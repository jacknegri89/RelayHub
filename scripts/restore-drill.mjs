import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const localEnvironment = {};
for (const [key, value] of Object.entries(process.env)) {
  if (
    /^(path|pathext|systemroot|windir|comspec|temp|tmp|tmpdir|home|userprofile|appdata|localappdata|lang|ld_library_path|pguser|pgpassword|pgpassfile|pgport)$/i.test(
      key,
    )
  ) {
    localEnvironment[key] = value;
  }
}
if (
  !localEnvironment.PGUSER ||
  !/^\d{1,5}$/.test(localEnvironment.PGPORT ?? "")
) {
  throw new Error(
    "Set PGUSER and PGPORT for a dedicated loopback test cluster",
  );
}
const redisPort = process.env.RELAYHUB_DRILL_REDIS_PORT;
if (!/^\d{1,5}$/.test(redisPort ?? "")) {
  throw new Error(
    "Set RELAYHUB_DRILL_REDIS_PORT to a dedicated loopback test Redis port",
  );
}
const directory = await mkdtemp(join(tmpdir(), "relayhub-drill-"));
const home = join(directory, "gnupg");
const archive = join(directory, "snapshot.dump.gpg");
const env = {
  ...localEnvironment,
  PGHOST: "127.0.0.1",
  PGHOSTADDR: "127.0.0.1",
  GNUPGHOME: home,
  RELAYHUB_MODE: "demo",
  RELAYHUB_BASE_URL: "http://127.0.0.1:3000",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  ACTIVE_KEY_ID: "drill",
  ENCRYPTION_KEYS: "drill:" + randomBytes(32).toString("hex"),
  REDIS_URL: "redis://127.0.0.1:" + redisPort,
  RELAYHUB_DRILL_REDIS_PORT: redisPort,
};

async function run(command, args, environment = env) {
  try {
    const result = await execute(command, args, {
      env: environment,
      timeout: 120_000,
      windowsHide: true,
    });
    return result.stdout;
  } catch (error) {
    // Prisma and PostgreSQL can include connection details in diagnostics.
    throw new Error(
      command.split(/[\\/]/).pop() + " failed (exit " + error.code + ")",
    );
  }
}

function fixtureEnvironment(database) {
  const url = new URL("postgresql://127.0.0.1");
  url.username = env.PGUSER;
  url.password = env.PGPASSWORD ?? "";
  url.port = env.PGPORT;
  url.pathname = "/" + database;
  return { ...env, PGDATABASE: database, DATABASE_URL: url.href };
}

const archiveCommand = ["scripts/pg-archive.mjs"];
const fixtureCommand = ["--import", "tsx", "scripts/restore-fixture.ts"];
const createdDatabases = [];
let report;
let stage = "initialize synthetic keys";
try {
  await mkdir(home, { mode: 0o700 });
  if (
    process.platform === "win32" &&
    (await run("gpgconf", ["--list-dirs", "bindir"])).trim().startsWith("/")
  ) {
    // Git for Windows supplies an MSYS build of GnuPG that expects POSIX paths.
    env.GNUPGHOME = (await run("cygpath", ["-u", home])).trim();
  }
  await run("gpg", [
    "--batch",
    "--pinentry-mode",
    "loopback",
    "--passphrase",
    "",
    "--quick-generate-key",
    "Restore drill <backup@restore.invalid>",
    "default",
    "default",
    "1d",
  ]);
  const keyList = await run("gpg", [
    "--batch",
    "--with-colons",
    "--fingerprint",
    "--list-keys",
  ]);
  env.RELAYHUB_BACKUP_RECIPIENT = keyList
    .split(/\r?\n/)
    .find((line) => line.startsWith("fpr:"))
    ?.split(":")[9];
  assert.ok(env.RELAYHUB_BACKUP_RECIPIENT);
  stage = "migrate and seed isolated source";
  const source = "relayhub_drill_" + randomUUID().replaceAll("-", "");
  await run("createdb", [
    "--no-password",
    "--maintenance-db=postgres",
    "--template=template0",
    source,
  ]);
  createdDatabases.push(source);
  const sourceEnv = fixtureEnvironment(source);
  await run(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    sourceEnv,
  );
  await run(process.execPath, [...fixtureCommand, "seed"], sourceEnv);
  stage = "create and authenticate encrypted archive";
  const backup = JSON.parse(
    await run(
      process.execPath,
      [...archiveCommand, "backup", archive],
      sourceEnv,
    ),
  );
  await assert.rejects(
    run(process.execPath, [...archiveCommand, "backup", archive], sourceEnv),
  );
  await run(process.execPath, [
    ...archiveCommand,
    "verify",
    archive,
    backup.sha256,
  ]);
  await assert.rejects(
    run(process.execPath, [
      ...archiveCommand,
      "verify",
      archive,
      "0".repeat(64),
    ]),
  );
  // Even a matching file checksum cannot make an incomplete OpenPGP message a valid backup.
  const truncated = (await readFile(archive)).subarray(0, -12);
  const damaged = join(directory, "damaged.dump.gpg");
  await writeFile(damaged, truncated);
  const damagedDigest = createHash("sha256").update(truncated).digest("hex");
  await assert.rejects(
    run(process.execPath, [
      ...archiveCommand,
      "verify",
      damaged,
      damagedDigest,
    ]),
  );
  stage = "restore into new database";
  const restored = JSON.parse(
    await run(process.execPath, [
      ...archiveCommand,
      "restore",
      archive,
      backup.sha256,
    ]),
  );
  assert.match(restored.database, /^relayhub_restore_[a-f0-9]{32}$/);
  createdDatabases.push(restored.database);
  stage = "check relationships, replay and queue";
  const checks = JSON.parse(
    await run(
      process.execPath,
      [...fixtureCommand, "check"],
      fixtureEnvironment(restored.database),
    ),
  );
  report = { result: "PASS", sha256: backup.sha256, ...checks };
} catch (error) {
  console.error("Restore drill failed at " + stage + ": " + error.message);
  process.exitCode = 1;
} finally {
  const cleaned = await Promise.allSettled([
    ...createdDatabases.map((name) =>
      run("dropdb", ["--no-password", "--maintenance-db=postgres", name]),
    ),
    run("gpgconf", ["--kill", "gpg-agent"]),
  ]);
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 250,
  });
  if (cleaned.some((operation) => operation.status === "rejected")) {
    throw new Error(
      "Drill cleanup failed. Check only the temporary databases: " +
        createdDatabases.join(", "),
    );
  }
}
if (report) {
  console.info(JSON.stringify(report));
}
