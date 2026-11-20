import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, open, realpath, unlink } from "node:fs/promises";
import { devNull } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { pipeline } from "node:stream/promises";

// pg_dump, pg_restore and GnuPG stream data through pipes. Only ciphertext reaches the filesystem.
function run(command, args, stdio) {
  const child = spawn(command, args, { stdio, windowsHide: true });
  const done = new Promise((accept, reject) => {
    child.once("error", () => reject(new Error(command + " could not start")));
    child.once("close", (code) => {
      if (code === 0) {
        accept();
      } else {
        reject(new Error(command + " failed (exit " + code + ")"));
      }
    });
  });
  return { child, done };
}

async function transfer(
  firstCommand,
  firstArgs,
  secondCommand,
  secondArgs,
  output,
  input = "ignore",
) {
  const first = run(firstCommand, firstArgs, [input, "pipe", "ignore"]);
  const second = run(secondCommand, secondArgs, ["pipe", output, "ignore"]);
  const results = await Promise.allSettled([
    first.done,
    second.done,
    pipeline(first.child.stdout, second.child.stdin),
  ]);
  for (const result of results) {
    if (result.status === "rejected") {
      throw result.reason;
    }
  }
}

async function checksum(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

const offlineGpg = [
  "--batch",
  "--no-tty",
  "--disable-dirmngr",
  "--no-auto-key-locate",
];

async function unpack(filename, argumentsForRestore) {
  const archive = await open(filename, "r");
  try {
    await transfer(
      "gpg",
      [...offlineGpg, "--decrypt"],
      "pg_restore",
      argumentsForRestore,
      "ignore",
      archive.fd,
    );
  } finally {
    await archive.close();
  }
}

async function backup(filename) {
  const fingerprint = process.env.RELAYHUB_BACKUP_RECIPIENT ?? "";
  // A full fingerprint avoids selecting an unrelated public key with the same name.
  if (!/^(?:[A-F0-9]{40}|[A-F0-9]{64})$/i.test(fingerprint)) {
    throw new Error(
      "Set RELAYHUB_BACKUP_RECIPIENT to the full public key fingerprint",
    );
  }
  if (!process.env.PGDATABASE || !process.env.PGHOST || !process.env.PGUSER) {
    throw new Error("Explicit PGHOST, PGUSER and PGDATABASE are required");
  }
  const loopback = ["127.0.0.1", "::1"];
  if (
    (!loopback.includes(process.env.PGHOST) ||
      (process.env.PGHOSTADDR && !loopback.includes(process.env.PGHOSTADDR))) &&
    process.env.PGSSLMODE !== "verify-full"
  ) {
    throw new Error(
      "A remote backup connection requires PGSSLMODE=verify-full",
    );
  }
  const staging = filename + "." + randomUUID() + ".partial";
  const file = await open(staging, "wx", 0o600);
  try {
    await transfer(
      "pg_dump",
      ["--no-password", "--format=custom"],
      "gpg",
      [
        ...offlineGpg,
        "--encrypt",
        "--trust-model",
        "always",
        "--recipient",
        fingerprint,
        "--compress-algo",
        "none",
        "--output",
        "-",
      ],
      file.fd,
    );
    await file.sync();
    const sha256 = await checksum(staging);
    // Publish exclusively after both programs finish. An existing archive is never overwritten.
    await link(staging, filename);
    return { sha256 };
  } finally {
    await file.close();
    await unlink(staging);
  }
}

async function verify(filename, expected) {
  if (
    !expected ||
    !/^[a-f0-9]{64}$/.test(expected) ||
    (await checksum(filename)) !== expected
  ) {
    throw new Error(
      "Encrypted archive SHA-256 mismatch or missing trusted digest",
    );
  }
  // Writing the complete archive as SQL to the null device exercises every data stream.
  await unpack(filename, ["--file", devNull]);
}

function requireLocalTarget() {
  // libpq also accepts service files, hostaddr and connection strings. Pin both host fields.
  if (
    process.env.PGHOST !== "127.0.0.1" ||
    (process.env.PGHOSTADDR && process.env.PGHOSTADDR !== "127.0.0.1") ||
    process.env.PGSERVICE ||
    process.env.PGSERVICEFILE ||
    !process.env.PGUSER ||
    !/^\d{1,5}$/.test(process.env.PGPORT ?? "")
  ) {
    throw new Error(
      "Restore requires PGHOST=127.0.0.1, PGPORT, PGUSER and no service override",
    );
  }
  process.env.PGHOSTADDR = "127.0.0.1";
}

async function restore(filename, expected) {
  requireLocalTarget();
  await verify(filename, expected);
  const database = "relayhub_restore_" + randomUUID().replaceAll("-", "");
  await run(
    "createdb",
    [
      "--no-password",
      "--maintenance-db=postgres",
      "--template=template0",
      database,
    ],
    "ignore",
  ).done;
  try {
    await unpack(filename, [
      "--no-password",
      "--single-transaction",
      "--no-owner",
      "--no-privileges",
      "--dbname",
      database,
    ]);
  } catch (error) {
    // createdb succeeded exclusively for this new UUID. No existing database is eligible for cleanup.
    try {
      await run(
        "dropdb",
        ["--no-password", "--maintenance-db=postgres", database],
        "ignore",
      ).done;
    } catch {
      throw new Error(
        "Restore failed and could not clean up the newly created database " +
          database,
      );
    }
    throw error;
  }
  return { database };
}

async function main() {
  const [action, archive, digest] = process.argv.slice(2);
  if (
    !archive ||
    !archive.endsWith(".dump.gpg") ||
    !["backup", "verify", "restore"].includes(action)
  ) {
    throw new Error(
      "Usage: node scripts/pg-archive.mjs backup|verify|restore /path/name.dump.gpg [sha256]",
    );
  }
  const parent = await realpath(dirname(resolve(archive)));
  const workspace = await realpath(join(import.meta.dirname, ".."));
  const outside = relative(workspace, parent);
  if (
    outside !== ".." &&
    !outside.startsWith(".." + sep) &&
    !isAbsolute(outside)
  ) {
    throw new Error("Store encrypted archives outside the checkout");
  }
  const filename = join(parent, basename(archive));
  if (action === "backup") {
    return backup(filename);
  }
  if (action === "restore") {
    return restore(filename, digest);
  }
  await verify(filename, digest);
  return { verified: true };
}

try {
  console.info(JSON.stringify(await main()));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
