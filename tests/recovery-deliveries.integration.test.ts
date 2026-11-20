import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import {
  commandSchema,
  RECOVERY_BATCH_SIZE,
} from "../apps/web/src/server/commands";
import { manage } from "../apps/web/src/server/manage";
import {
  readRecovery,
  retryRecoveryBatch,
} from "../apps/web/src/server/recovery-deliveries";

if (!settings().isDemo) {
  throw new Error("Recovery tests require an isolated demo database.");
}
const db = database();
const organizationId = randomUUID();
const sourceId = randomUUID();
const owner = randomUUID();
const viewer = randomUUID();
const completedAt = new Date();

beforeAll(async () => {
  await db.user.createMany({
    data: [owner, viewer].map((id) => ({
      id,
      name: "Test",
      email: id + "@relayhub.example",
    })),
  });
  await db.organization.create({
    data: {
      id: organizationId,
      name: "Recovery test",
      sources: {
        create: { id: sourceId, name: "Recovery source", secret: "unused" },
      },
      members: {
        create: [
          { userId: owner, role: "owner" },
          { userId: viewer, role: "viewer" },
        ],
      },
    },
  });
});
afterAll(async () => {
  await db.$transaction([
    db.webhookEvent.deleteMany({ where: { organizationId } }),
    db.webhookDestination.deleteMany({ where: { organizationId } }),
    db.webhookSource.deleteMany({ where: { organizationId } }),
    db.organization.deleteMany({ where: { id: organizationId } }),
    db.user.deleteMany({ where: { id: { in: [owner, viewer] } } }),
  ]);
  await db.$disconnect();
});

async function destination() {
  const row = await db.webhookDestination.create({
    data: {
      organizationId,
      name: "Receiver",
      url: "https://example.com",
      secret: "unused",
    },
  });
  return row.id;
}

// All timestamps are intentionally identical: the database must use the
// serialization order and terminal attempt identity, even across multiple incidents.
async function terminal(destinationId: string, httpStatus = 422) {
  const eventId = randomUUID();
  let status: "delivered" | "failed" = "failed";
  let outcome = "http_error";
  if (httpStatus === 204) {
    status = "delivered";
    outcome = "success";
  }
  const event = await db.webhookEvent.create({
    data: {
      id: eventId,
      sourceId,
      organizationId,
      externalId: eventId,
      eventType: "recovery.test",
      correlationId: eventId,
      payload: "unused",
      payloadHash: "unused",
      payloadSize: 0,
      deliveries: {
        create: {
          destinationId,
          status,
          finishedAt: completedAt,
          attemptCount: 1,
          attempts: {
            create: {
              number: 1,
              finishedAt: completedAt,
              httpStatus,
              durationMs: 5,
              outcome,
            },
          },
        },
      },
    },
    select: {
      deliveries: { select: { id: true, attempts: { select: { id: true } } } },
    },
  });
  return {
    id: event.deliveries[0].id,
    eventId,
    attemptId: event.deliveries[0].attempts[0].id,
  };
}

function batch(
  destinationId: string,
  incidentId: string,
  deliveryIds: string[],
  actorId = owner,
) {
  return manage(
    { organizationId, actorId },
    { action: "delivery_retry_group", destinationId, incidentId, deliveryIds },
    randomUUID(),
  );
}

it("includes initial errors, separates equal-time episodes, and excludes later failures and expired details", async () => {
  const destinationId = await destination();
  const scope = { organizationId, destinationId };
  const unrelated = await terminal(destinationId);
  await terminal(destinationId, 204);
  const first = await terminal(destinationId);
  const second = await terminal(destinationId);
  const third = await terminal(destinationId);
  const expired = await terminal(destinationId);
  await terminal(destinationId, 204);
  await db.webhookEvent.delete({
    where: { id: expired.eventId, organizationId },
  });
  const later = await terminal(destinationId);
  const report = await readRecovery(scope, third.attemptId);
  expect(report?.rows.map((row) => row.id).sort()).toEqual(
    [first.id, second.id, third.id].sort(),
  );
  expect(report?.total).toBe(3);
  await db.$transaction([
    db.delivery.update({
      where: { id: second.id },
      data: { attemptCount: 2, generation: 2 },
    }),
    db.deliveryAttempt.create({
      data: {
        deliveryId: second.id,
        number: 2,
        finishedAt: completedAt,
        httpStatus: 422,
        outcome: "http_error",
      },
    }),
  ]);
  const all = [
    first.id,
    second.id,
    third.id,
    expired.id,
    later.id,
    unrelated.id,
  ];
  const result = await batch(destinationId, third.attemptId, all);
  expect(result).toMatchObject({
    queued: expect.arrayContaining([first.id, third.id]),
    skipped: 4,
  });
  expect(await batch(destinationId, third.attemptId, all)).toMatchObject({
    queued: [],
    skipped: 6,
  });
});

it("bounds selection, authorizes each batch, and queues concurrent overlaps once", async () => {
  const destinationId = await destination();
  const scope = { organizationId, destinationId };
  const first = await terminal(destinationId);
  const second = await terminal(destinationId);
  const third = await terminal(destinationId);
  const ids = [first.id, second.id, third.id];
  await expect(
    batch(destinationId, third.attemptId, ids),
  ).rejects.toMatchObject({ status: 404 });
  await terminal(destinationId, 204);
  await expect(
    batch(destinationId, third.attemptId, ids, viewer),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    await readRecovery(
      { ...scope, organizationId: randomUUID() },
      third.attemptId,
    ),
  ).toBeNull();
  await expect(
    batch(await destination(), third.attemptId, ids),
  ).rejects.toMatchObject({ status: 404 });
  const command = {
    action: "delivery_retry_group",
    destinationId,
    incidentId: third.attemptId,
    deliveryIds: [first.id, first.id],
  };
  expect(commandSchema.safeParse(command).success).toBe(false);
  expect(
    commandSchema.safeParse({
      ...command,
      deliveryIds: Array.from({ length: RECOVERY_BATCH_SIZE + 1 }, () =>
        randomUUID(),
      ),
    }).success,
  ).toBe(false);
  await db.webhookDestination.update({
    where: { id: destinationId },
    data: { enabled: false },
  });
  await expect(
    batch(destinationId, third.attemptId, ids),
  ).rejects.toMatchObject({ status: 409 });
  await db.webhookDestination.update({
    where: { id: destinationId },
    data: { enabled: true },
  });
  await expect(
    db.$transaction(async (tx) => {
      await retryRecoveryBatch(tx, scope, owner, third.attemptId, ids);
      expect(
        await tx.outboxEntry.count({ where: { deliveryId: { in: ids } } }),
      ).toBe(3);
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect((await readRecovery(scope, third.attemptId))?.total).toBe(3);
  await Promise.all([
    batch(destinationId, third.attemptId, ids),
    batch(destinationId, third.attemptId, [...ids].reverse()),
  ]);
  const audits = await db.auditLog.findMany({
    where: {
      organizationId,
      actorId: owner,
      action: "delivery_retry",
      resourceId: { in: ids },
    },
  });
  expect(audits.map((r) => r.resourceId).sort()).toEqual([...ids].sort());
  expect(
    await db.auditLog.count({
      where: {
        organizationId,
        action: "delivery_retry_group",
        resourceId: third.attemptId,
      },
    }),
  ).toBe(1);
});

it("traverses a full recovery by cursor and blocks requeue during a new outage", async () => {
  const destinationId = await destination();
  const scope = { organizationId, destinationId };
  const entries = [];
  for (let i = 0; i < RECOVERY_BATCH_SIZE + 1; i++) {
    entries.push(await terminal(destinationId));
  }
  await terminal(destinationId, 204);
  const incident = entries[2].attemptId;
  const first = await readRecovery(scope, incident);
  expect(first?.total).toBe(RECOVERY_BATCH_SIZE + 1);
  expect(first?.hasMore).toBe(true);
  expect(first?.rows).toHaveLength(RECOVERY_BATCH_SIZE);
  const next = await readRecovery(scope, incident, first?.rows.at(-1)?.id);
  expect(next?.rows).toHaveLength(1);
  expect(next?.hasMore).toBe(false);
  expect(first?.rows.some((row) => row.id === next?.rows[0].id)).toBe(false);
  for (let i = 0; i < 3; i++) {
    await terminal(destinationId);
  }
  await expect(
    batch(destinationId, incident, [entries[0].id]),
  ).rejects.toMatchObject({ status: 409 });
});
