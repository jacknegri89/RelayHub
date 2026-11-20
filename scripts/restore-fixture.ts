import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { database } from "@relayhub/db";
import { storeEvent } from "@relayhub/db/events";
import { decrypt, encrypt } from "@relayhub/shared/encryption";
import { claim, recordOutcome } from "../apps/worker/src/delivery";
import { dispatch, QUEUE_NAME } from "../apps/worker/src/dispatch";

const url = new URL(process.env.DATABASE_URL ?? "");
if (
  process.env.RELAYHUB_MODE !== "demo" ||
  url.hostname !== "127.0.0.1" ||
  !/^\/relayhub_(?:drill|restore)_[a-f0-9]{32}$/.test(url.pathname)
) {
  throw new Error(
    "This fixture runs only inside a temporary local drill database",
  );
}
const body = Buffer.from('{"type":"order.created","order":"DRILL-1"}');
const testSecret = Buffer.from("Synthetic secret for the restore drill only");
const externalId = "restore-order-1";
const eventType = "order.created";
const db = database();

async function seed() {
  const sourceId = randomUUID();
  const secret = encrypt(testSecret, "source:" + sourceId);
  const organization = await db.organization.create({
    data: {
      name: "Restore drill",
      members: {
        create: {
          role: "owner",
          user: {
            create: { email: "owner@restore.invalid", name: "Drill owner" },
          },
        },
      },
      sources: { create: { id: sourceId, name: "Orders", secret } },
    },
  });
  for (const name of ["Warehouse", "Billing"]) {
    const id = randomUUID();
    await db.webhookDestination.create({
      data: {
        id,
        name,
        organizationId: organization.id,
        url: "https://restore.invalid/unused",
        secret: encrypt(testSecret, "destination:" + id),
      },
    });
    await db.subscription.create({
      data: {
        sourceId,
        destinationId: id,
        organizationId: organization.id,
        eventType,
      },
    });
  }
  const accepted = await storeEvent({
    sourceId,
    sourceSecret: secret,
    organizationId: organization.id,
    externalId,
    eventType,
    body,
    correlationId: randomUUID(),
  });
  assert.equal(accepted.kind, "accepted");
  const delivered = await db.delivery.findFirstOrThrow({
    where: { destination: { name: "Warehouse" } },
  });
  const taken = await claim({
    deliveryId: delivered.id,
    generation: delivered.generation,
  });
  assert.ok(taken);
  await recordOutcome(taken, {
    status: "delivered",
    now: new Date(),
    result: { outcome: "success", status: 204, durationMs: 57 },
  });
}

async function check() {
  const member = await db.organizationMember.findFirstOrThrow({
    include: { user: true },
  });
  assert.equal(member.role, "owner");
  assert.equal(member.user.email, "owner@restore.invalid");
  assert.equal(
    await db.subscription.count({
      where: { organizationId: member.organizationId },
    }),
    2,
  );
  const event = await db.webhookEvent.findFirstOrThrow({
    where: { organizationId: member.organizationId },
    include: {
      source: true,
      deliveries: {
        include: { destination: true, attempts: true, outbox: true },
      },
    },
  });
  assert.equal(event.externalId, externalId);
  assert.deepEqual(decrypt(event.payload, "event:" + event.id), body);
  assert.deepEqual(
    decrypt(event.source.secret, "source:" + event.sourceId),
    testSecret,
  );
  for (const delivery of event.deliveries) {
    assert.deepEqual(
      decrypt(
        delivery.destination.secret,
        "destination:" + delivery.destinationId,
      ),
      testSecret,
    );
  }
  const duplicate = await storeEvent({
    sourceId: event.sourceId,
    sourceSecret: event.source.secret,
    organizationId: member.organizationId,
    externalId,
    eventType,
    body,
    correlationId: randomUUID(),
  });
  assert.equal(duplicate.kind, "duplicate");
  assert.equal(await db.webhookEvent.count(), 1);
  assert.equal(await db.delivery.count(), 2);
  assert.equal(await db.outboxEntry.count(), 1);
  const done = event.deliveries.find(
    (row) => row.destination.name === "Warehouse",
  );
  assert.equal(done?.status, "delivered");
  assert.equal(done.attempts.length, 1);
  assert.equal(done.attempts[0].httpStatus, 204);
  assert.equal(done.outbox, null);
  const pending = event.deliveries.find(
    (row) => row.destination.name === "Billing",
  );
  assert.equal(pending?.status, "pending");
  assert.equal(pending.attempts.length, 0);
  assert.equal(pending.outbox?.generation, pending.generation);
  await checkQueue(pending.id, pending.generation);
  return {
    events: 1,
    deliveries: 2,
    successfulAttempts: 1,
    republishedJobs: 1,
    readableEnvelopes: 4,
    duplicate: duplicate.kind,
  };
}

async function checkQueue(deliveryId: string, generation: number) {
  const { Queue } = createRequire(resolve("apps/worker/package.json"))(
    "bullmq",
  );
  // Use a fresh namespace so no running worker can ever consume this synthetic job.
  const queue: Parameters<typeof dispatch>[0] = new Queue(QUEUE_NAME, {
    prefix: "restore-drill-" + randomUUID(),
    connection: {
      host: "127.0.0.1",
      port: Number(process.env.RELAYHUB_DRILL_REDIS_PORT),
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    },
  });
  try {
    assert.equal(await queue.count(), 0);
    await dispatch(queue);
    await dispatch(queue);
    const jobs = await queue.getJobs(["waiting"]);
    assert.equal(jobs.length, 1);
    assert.deepEqual(jobs[0].data, { deliveryId, generation });
  } finally {
    try {
      await queue.obliterate();
    } finally {
      await queue.close();
    }
  }
}

try {
  if (process.argv[2] === "seed") {
    await seed();
  } else if (process.argv[2] === "check") {
    console.info(JSON.stringify(await check()));
  } else {
    throw new Error("Expected seed or check");
  }
} finally {
  await db.$disconnect();
}
