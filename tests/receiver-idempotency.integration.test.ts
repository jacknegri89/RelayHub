import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { database } from "@relayhub/db";
import { storeEvent } from "@relayhub/db/events";
import { encrypt } from "@relayhub/shared/encryption";
import { deliverySignature } from "@relayhub/shared/protocol";
import {
  ReceiptStore,
  MAX_TRACKED_RECEIPTS,
} from "../apps/mock-receiver/src/ReceiptStore";
import { recover } from "../apps/worker/src/dispatch";

const runNode = promisify(execFile);
const receiverSecret = randomUUID();
const adminUrl = new URL(process.env.DATABASE_URL ?? "");
if (
  process.env.RELAYHUB_MODE !== "demo" ||
  !["localhost", "127.0.0.1", "postgres"].includes(adminUrl.hostname)
) {
  throw new Error(
    "Receiver tests require a local isolated PostgreSQL service in demo mode.",
  );
}
const { Client } = createRequire(resolve("packages/db/package.json"))(
  "pg",
) as typeof import("pg");
const admin = new Client({ connectionString: adminUrl.href });
// Identifiers are not SQL parameters. This prefix and locally generated hex are the only accepted database names.
const databaseName = "receiver_test_" + randomUUID().replaceAll("-", "");
if (!/^receiver_test_[a-f0-9]{32}$/.test(databaseName)) {
  throw new Error("Invalid isolated test database name");
}
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = "/" + databaseName;
let created = false;
let directory: string;
const children = new Set<ChildProcess>();

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "relayhub-receiver-"));
  await admin.connect();
  // The running dispatcher cannot reserve these fixtures before the test worker restarts.
  await admin.query('CREATE DATABASE "' + databaseName + '"');
  created = true;
  vi.stubEnv("DATABASE_URL", databaseUrl.href);
  await runNode(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env },
  );
}, 60_000);

async function stop(child: ChildProcess) {
  if (child.exitCode === null && child.signalCode === null) {
    const closed = once(child, "exit");
    child.kill("SIGKILL");
    await closed;
  }
  children.delete(child);
}

afterAll(async () => {
  try {
    await Promise.all([...children].map(stop));
    if (created) {
      await database().$disconnect();
      await admin.query('DROP DATABASE "' + databaseName + '"');
    }
  } finally {
    vi.unstubAllEnvs();
    await admin.end();
    if (directory) {
      await rm(directory, { recursive: true, force: true, maxRetries: 4 });
    }
  }
}, 30_000);

async function localOrigin() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  if (!address || typeof address === "string") {
    throw new Error("Test port unavailable");
  }
  await new Promise<void>((done) => probe.close(() => done()));
  return "http://127.0.0.1:" + address.port;
}

function childEnvironment(origin: string) {
  return {
    ...process.env,
    DEMO_RECEIVER_URL: origin,
    DEMO_RECEIVER_SECRET: receiverSecret,
    DELIVERY_TIMEOUT_MS: "600",
    MAX_ATTEMPTS: "5",
  };
}

async function startReceiver(
  origin: string,
  filename: string,
  timeoutMs = 600,
) {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "apps/mock-receiver/src/index.ts"],
    {
      env: {
        ...childEnvironment(origin),
        DELIVERY_TIMEOUT_MS: String(timeoutMs),
        RECEIVER_BIND: "127.0.0.1",
        RECEIVER_DB_PATH: filename,
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  children.add(child);
  await expect
    .poll(
      async () => {
        if (child.exitCode !== null) {
          throw new Error("Receiver exited before becoming ready");
        }
        try {
          return (await fetch(origin + "/health")).status;
        } catch {
          return 0;
        }
      },
      { timeout: 15_000, interval: 100 },
    )
    .toBe(200);
  return child;
}

// Each invocation starts the real worker delivery core in a new OS process.
function startWorker(
  origin: string,
  jobs: { deliveryId: string; generation: number }[],
  timeoutMs = 600,
) {
  const execution = `import {processDelivery} from "./apps/worker/src/delivery.ts"; import {database} from "@relayhub/db";
    try { for (const job of JSON.parse(process.argv[1])) { await processDelivery(job); } } finally { await database().$disconnect(); }`;
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      execution,
      JSON.stringify(jobs),
    ],
    {
      env: {
        ...childEnvironment(origin),
        DELIVERY_TIMEOUT_MS: String(timeoutMs),
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  children.add(child);
  return child;
}

async function worker(
  origin: string,
  jobs: { deliveryId: string; generation: number }[],
) {
  const child = startWorker(origin, jobs);
  const [code] = await once(child, "exit");
  children.delete(child);
  expect(code).toBe(0);
}

function counters(filename: string, deliveryId: string) {
  const reader = new DatabaseSync(filename, { readOnly: true });
  try {
    return {
      attempts: reader
        .prepare("SELECT attempts FROM receipts WHERE delivery_id=?")
        .get(deliveryId)?.attempts,
      orders: reader
        .prepare("SELECT count(*) AS total FROM orders WHERE delivery_id=?")
        .get(deliveryId)?.total,
    };
  } finally {
    reader.close();
  }
}

it("commits one order when concurrent signed copies reach two receiver processes", async () => {
  const filename = join(directory, "concurrent.sqlite");
  const first = await localOrigin();
  await startReceiver(first, filename);
  const second = await localOrigin();
  await startReceiver(second, filename);
  const id = randomUUID(),
    eventId = randomUUID(),
    timestamp = String(Math.floor(Date.now() / 1000));
  const body = Buffer.from(JSON.stringify({ type: "order.created" }));
  const headers = {
    "content-type": "application/json",
    "x-relayhub-event-id": eventId,
    "x-relayhub-delivery-id": id,
    "x-relayhub-timestamp": timestamp,
    "x-relayhub-delivery-signature": deliverySignature(
      receiverSecret,
      timestamp,
      id,
      eventId,
      body,
    ),
  };
  const copies = Array.from({ length: 8 }, (_, i) => [first, second][i % 2]);
  const replies = await Promise.all(
    copies.map(async (origin) => {
      const reply = await fetch(origin + "/hooks/success", {
        method: "POST",
        headers,
        body,
      });
      expect(reply.status).toBe(200);
      return reply.text();
    }),
  );
  expect(replies.filter((text) => text === "duplicate")).toHaveLength(7);
  expect(counters(filename, id)).toEqual({ attempts: 8, orders: 1 });
  // A receiver must authenticate the key before looking up a stored receipt.
  expect(
    (
      await fetch(first + "/hooks/success", {
        method: "POST",
        headers: { ...headers, "x-relayhub-delivery-id": randomUUID() },
        body,
      })
    ).status,
  ).toBe(401);
  const changed = Buffer.from(JSON.stringify({ type: "order.changed" }));
  const conflict = await fetch(second + "/hooks/success", {
    method: "POST",
    headers: {
      ...headers,
      "x-relayhub-delivery-signature": deliverySignature(
        receiverSecret,
        timestamp,
        id,
        eventId,
        changed,
      ),
    },
    body: changed,
  });
  expect(conflict.status).toBe(409);
  expect(counters(filename, id)).toEqual({ attempts: 8, orders: 1 });
}, 30_000);

async function orderFanout(urls: string[]) {
  const db = database();
  const organizationId = randomUUID(),
    sourceId = randomUUID(),
    eventId = randomUUID();
  const sourceSecret = encrypt(Buffer.from(randomUUID()), "source:" + sourceId);
  await db.organization.create({
    data: {
      id: organizationId,
      name: "Receiver test",
      sources: {
        create: { id: sourceId, name: "Orders", secret: sourceSecret },
      },
    },
  });
  const destinations = [];
  for (const url of urls) {
    const id = randomUUID();
    await db.webhookDestination.create({
      data: {
        id,
        organizationId,
        name: "Test consumer",
        url,
        secret: encrypt(Buffer.from(receiverSecret), "destination:" + id),
      },
    });
    await db.subscription.create({
      data: {
        organizationId,
        sourceId,
        destinationId: id,
        eventType: "order.created",
      },
    });
    destinations.push(id);
  }
  const stored = await storeEvent({
    sourceId,
    organizationId,
    sourceSecret,
    externalId: eventId,
    eventType: "order.created",
    correlationId: randomUUID(),
    body: Buffer.from(JSON.stringify({ type: "order.created", id: eventId })),
  });
  expect(stored).toMatchObject({ kind: "accepted", deliveries: urls.length });
  const jobs = [];
  for (const destinationId of destinations) {
    const row = await db.delivery.findFirstOrThrow({
      where: { organizationId, destinationId },
    });
    jobs.push({ deliveryId: row.id, generation: row.generation });
  }
  return jobs;
}

it("restarts the receiver and worker between a committed order timeout and its retry, preserving successful fanout", async () => {
  const warehouse = await localOrigin();
  const warehouseFile = join(directory, "warehouse.sqlite");
  await startReceiver(warehouse, warehouseFile);
  const billing = await localOrigin();
  const billingFile = join(directory, "billing.sqlite");
  const processBeforeTimeout = await startReceiver(billing, billingFile);
  const db = database();
  const jobs = await orderFanout([
    warehouse + "/hooks/success",
    billing + "/hooks/lost-response",
  ]);
  await Promise.all([worker(warehouse, [jobs[0]]), worker(billing, [jobs[1]])]);
  const failedAck = await db.delivery.findUniqueOrThrow({
    where: { id: jobs[1].deliveryId },
  });
  expect(failedAck).toMatchObject({
    status: "retry_scheduled",
    attemptCount: 1,
    lastStatus: null,
  });
  expect(counters(billingFile, failedAck.id)).toEqual({
    attempts: 1,
    orders: 1,
  });
  const outbox = await db.outboxEntry.findUniqueOrThrow({
    where: { deliveryId: failedAck.id },
  });
  await stop(processBeforeTimeout);
  await startReceiver(billing, billingFile);
  await delay(Math.max(0, failedAck.nextAt.getTime() - Date.now()) + 10);
  // Replayed queue jobs for the already acknowledged fanout and old generation are harmless.
  await worker(billing, [
    jobs[0],
    jobs[1],
    { deliveryId: failedAck.id, generation: outbox.generation },
  ]);
  const deliveries = await Promise.all(
    jobs.map((job) =>
      db.delivery.findUniqueOrThrow({
        where: { id: job.deliveryId },
        include: { attempts: { orderBy: { number: "asc" } } },
      }),
    ),
  );
  expect(deliveries[0]).toMatchObject({
    status: "delivered",
    attemptCount: 1,
    lastStatus: 200,
  });
  expect(deliveries[1]).toMatchObject({
    status: "delivered",
    attemptCount: 2,
    lastStatus: 200,
  });
  expect(deliveries[1].attempts.map((a) => a.outcome)).toEqual([
    "retry",
    "success",
  ]);
  expect(counters(warehouseFile, jobs[0].deliveryId)).toEqual({
    attempts: 1,
    orders: 1,
  });
  expect(counters(billingFile, jobs[1].deliveryId)).toEqual({
    attempts: 2,
    orders: 1,
  });
  expect(await db.outboxEntry.count()).toBe(0);
}, 60_000);

it("recovers a killed in-flight worker after the receiver committed the order", async () => {
  const origin = await localOrigin();
  const filename = join(directory, "in-flight.sqlite");
  const receiver = await startReceiver(origin, filename, 8000);
  const [job] = await orderFanout([origin + "/hooks/lost-response"]);
  const interrupted = startWorker(origin, [job], 8000);
  await expect
    .poll(() => counters(filename, job.deliveryId).orders, {
      interval: 25,
      timeout: 15_000,
    })
    .toBe(1);
  await stop(interrupted);
  await stop(receiver);
  const db = database();
  // Advance only this fixture's lease deadline, then run the real crash recovery transaction.
  const expired = await db.delivery.updateMany({
    where: {
      id: job.deliveryId,
      status: "delivering",
      generation: job.generation,
    },
    data: { leaseExpiresAt: new Date(0) },
  });
  expect(expired.count).toBe(1);
  await recover();
  const next = await db.delivery.findUniqueOrThrow({
    where: { id: job.deliveryId },
  });
  expect(next.status).toBe("retry_scheduled");
  await startReceiver(origin, filename);
  await delay(Math.max(0, next.nextAt.getTime() - Date.now()) + 10);
  await worker(origin, [
    job,
    { deliveryId: job.deliveryId, generation: next.generation },
  ]);
  const finished = await db.delivery.findUniqueOrThrow({
    where: { id: job.deliveryId },
    include: { attempts: { orderBy: { number: "asc" } } },
  });
  expect(finished.status).toBe("delivered");
  expect(finished.attempts.map((a) => a.outcome)).toEqual([
    "lease_expired",
    "success",
  ]);
  expect(counters(filename, job.deliveryId)).toEqual({
    attempts: 2,
    orders: 1,
  });
}, 40_000);

it("preserves live receipts at capacity and frees expired test orders with their receipts", () => {
  const filename = join(directory, "retention.sqlite");
  const store = new ReceiptStore(filename, 1);
  const inspector = new DatabaseSync(filename);
  const now = Date.now();
  try {
    inspector
      .prepare(
        `WITH RECURSIVE sequence(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM sequence WHERE n<?)
      INSERT INTO receipts SELECT 'existing-'||n,'fingerprint',1,1,? FROM sequence`,
      )
      .run(MAX_TRACKED_RECEIPTS, now);
    inspector
      .prepare("INSERT INTO orders(delivery_id,created_at) VALUES (?,?)")
      .run("existing-1", now);
    const fresh = {
      id: randomUUID(),
      fingerprint: "fingerprint",
      isOrder: true,
    };
    expect(store.record(fresh, "success", now).status).toBe(503);
    expect(
      store.record({ ...fresh, id: "existing-1" }, "success", now),
    ).toMatchObject({ status: 200, duplicate: true });
    expect(store.record(fresh, "success", now + 86_400_001)).toMatchObject({
      status: 200,
      duplicate: false,
    });
    expect(counters(filename, "existing-1")).toEqual({
      attempts: undefined,
      orders: 0,
    });
    expect(counters(filename, fresh.id)).toEqual({ attempts: 1, orders: 1 });
  } finally {
    inspector.close();
    store.close();
  }
});

it("rolls back a receipt when its business write fails", () => {
  const filename = join(directory, "rollback.sqlite");
  const store = new ReceiptStore(filename, 30);
  const inspector = new DatabaseSync(filename);
  const delivery = { id: randomUUID(), fingerprint: "fixture", isOrder: true };
  try {
    inspector.exec(
      "CREATE TRIGGER reject_order BEFORE INSERT ON orders BEGIN SELECT RAISE(ABORT,'business write failed'); END;",
    );
    expect(() => store.record(delivery, "success")).toThrow(
      "business write failed",
    );
    expect(counters(filename, delivery.id)).toEqual({
      attempts: undefined,
      orders: 0,
    });
    inspector.exec("DROP TRIGGER reject_order");
    expect(store.record(delivery, "success")).toMatchObject({
      status: 200,
      duplicate: false,
    });
    expect(counters(filename, delivery.id)).toEqual({ attempts: 1, orders: 1 });
  } finally {
    store.close();
    inspector.close();
  }
});
