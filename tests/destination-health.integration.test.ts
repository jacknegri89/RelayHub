import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { readDestinationReport } from "../apps/web/src/server/destination-monitoring";
import { recordOutcome } from "../apps/worker/src/delivery";
import { retainRecent } from "../apps/worker/src/dispatch";

if (!settings().isDemo) {
  throw new Error(
    "Destination health tests require an isolated demo database.",
  );
}

const db = database();
const organizationId = randomUUID();
const sourceId = randomUUID();
const today = new Date();
today.setUTCHours(0, 0, 0, 0);

beforeAll(async () => {
  await db.organization.create({
    data: {
      id: organizationId,
      name: "Health test",
      sources: {
        create: { id: sourceId, name: "Test source", secret: "unused" },
      },
    },
  });
});

afterAll(async () => {
  try {
    await db.$transaction([
      db.webhookEvent.deleteMany({ where: { organizationId } }),
      db.webhookDestination.deleteMany({ where: { organizationId } }),
      db.webhookSource.deleteMany({ where: { organizationId } }),
      db.organization.deleteMany({ where: { id: organizationId } }),
    ]);
  } finally {
    await db.$disconnect();
  }
});

async function createDestination() {
  const destination = await db.webhookDestination.create({
    data: {
      organizationId,
      name: "Health test",
      url: "https://example.com",
      secret: "unused",
    },
  });
  return destination.id;
}

it("purges expired login sessions and verification records while keeping active ones", async () => {
  const ownerId = randomUUID();
  const expiredId = randomUUID();
  const activeId = randomUUID();
  const now = Date.now();
  const records = [
    { id: expiredId, expiresAt: new Date(now - 60_000) },
    { id: activeId, expiresAt: new Date(now + 60_000) },
  ];
  try {
    await db.user.create({
      data: {
        id: ownerId,
        name: "Retention fixture",
        email: ownerId + "@example.test",
        sessions: {
          create: records.map((record) => ({ ...record, token: randomUUID() })),
        },
      },
    });
    await db.verification.createMany({
      data: records.map((record) => ({
        ...record,
        identifier: record.id,
        value: ownerId,
      })),
    });
    await retainRecent(now);
    const sessions = await db.session.findMany({
      where: { userId: ownerId },
      select: { id: true },
    });
    const verifications = await db.verification.findMany({
      where: { value: ownerId },
      select: { id: true },
    });
    expect(sessions).toEqual([{ id: activeId }]);
    expect(verifications).toEqual([{ id: activeId }]);
  } finally {
    await db.verification.deleteMany({
      where: { id: { in: [expiredId, activeId] } },
    });
    await db.user.deleteMany({ where: { id: ownerId } });
  }
});

async function beginAttempt(
  destinationId: string,
  attemptId: string = randomUUID(),
) {
  const correlationId = randomUUID();
  const event = await db.webhookEvent.create({
    data: {
      organizationId,
      sourceId,
      correlationId,
      externalId: correlationId,
      eventType: "health.test",
      payload: "",
      payloadHash: "",
      payloadSize: 0,
    },
  });
  const leaseToken = randomUUID();
  const delivery = await db.delivery.create({
    data: {
      organizationId,
      eventId: event.id,
      destinationId,
      status: "delivering",
      leaseToken,
      attemptCount: 1,
    },
  });
  const attempt = await db.deliveryAttempt.create({
    data: { id: attemptId, deliveryId: delivery.id, number: 1 },
  });
  return { attempt, delivery, leaseToken };
}

type Observation = {
  outcome: string;
  httpStatus?: number;
  durationMs?: number;
};
const unavailable = { outcome: "retry", httpStatus: 503, durationMs: 20 };
const accepted = { outcome: "success", httpStatus: 204, durationMs: 0 };

// Same attempt update used by workers that were already running when the migration landed.
async function finish(
  destinationId: string,
  result: Observation,
  finishedAt = new Date(),
  attemptId?: string,
) {
  const { attempt } = await beginAttempt(destinationId, attemptId);
  return db.deliveryAttempt.update({
    where: { id: attempt.id },
    data: { ...result, finishedAt },
  });
}

it("opens one incident at three observable failures and starts a new episode after recovery", async () => {
  const destinationId = await createDestination();
  const scope = { organizationId, destinationId };
  await finish(destinationId, unavailable);
  await finish(destinationId, { outcome: "retry", durationMs: 4000 });
  for (const outcome of [
    "disabled",
    "lease_expired",
    "decryption_error",
    "policy_blocked",
    "retry",
  ]) {
    await finish(destinationId, { outcome });
  }
  expect(await db.destinationIncident.count({ where: scope })).toBe(0);

  const third = await finish(destinationId, {
    outcome: "http_error",
    httpStatus: 400,
    durationMs: 40,
  });
  await finish(destinationId, unavailable);
  let first = await db.destinationIncident.findUniqueOrThrow({
    where: { id: third.id },
  });
  expect(first).toMatchObject({
    openedAt: third.finishedAt,
    resolvedAt: null,
    failureCount: 4,
  });
  await finish(destinationId, { outcome: "disabled" });
  expect(
    await db.destinationIncident.count({
      where: { ...scope, resolvedAt: null },
    }),
  ).toBe(1);

  const recovery = await finish(destinationId, accepted);
  first = await db.destinationIncident.findUniqueOrThrow({
    where: { id: third.id },
  });
  expect(first.resolvedAt).toEqual(recovery.finishedAt);
  const stat = await db.destinationDailyStat.findFirstOrThrow({ where: scope });
  expect(stat).toMatchObject({
    successCount: 1,
    failureCount: 4,
    responseDurationMs: 80n,
    responseCount: 4,
  });
  await finish(destinationId, unavailable);
  await finish(destinationId, unavailable);
  const second = await finish(destinationId, unavailable);
  const open = await db.destinationIncident.findMany({
    where: { ...scope, resolvedAt: null },
  });
  expect(open.map((incident) => incident.id)).toEqual([second.id]);
  expect(await db.destinationIncident.count({ where: scope })).toBe(2);
});

it("orders successive outages and recoveries in the same millisecond independently of UUIDs", async () => {
  const destinationId = await createDestination();
  const [secondId, firstId] = [randomUUID(), randomUUID()].sort();
  const observedAt = new Date();
  for (const openingId of [firstId, secondId]) {
    await finish(destinationId, unavailable, observedAt);
    await finish(destinationId, unavailable, observedAt);
    await finish(destinationId, unavailable, observedAt, openingId);
    await finish(destinationId, accepted, observedAt);
  }
  const rows = await db.destinationIncident.findMany({
    where: { organizationId, destinationId },
    orderBy: { openedOrder: "asc" },
  });
  expect(rows.map((row) => row.id)).toEqual([firstId, secondId]);
  const [first, second] = rows;
  expect(first.openedAt).toEqual(second.resolvedAt);
  expect(first.resolvedOrder).toBeGreaterThan(first.openedOrder);
  expect(second.openedOrder).toBeGreaterThan(first.resolvedOrder!);
  expect(second.resolvedOrder).toBeGreaterThan(second.openedOrder);
  // Rewriting a resolved row must not move the original recovery in the log.
  const repeated = await db.destinationIncident.update({
    where: { id: firstId },
    data: { resolvedAt: observedAt },
  });
  expect(repeated.resolvedOrder).toBe(first.resolvedOrder);
  const report = await readDestinationReport(
    organizationId,
    destinationId,
    observedAt,
  );
  expect(report?.alerts.map(({ id, kind }) => [id, kind])).toEqual([
    [secondId, "recovery"],
    [secondId, "outage"],
    [firstId, "recovery"],
    [firstId, "outage"],
  ]);
  await finish(destinationId, { ...accepted, durationMs: 1 }, observedAt);
  const updatedReport = await readDestinationReport(
    organizationId,
    destinationId,
    observedAt,
  );
  expect(updatedReport?.days.at(-1)?.averageMs).toBe(121 / 9);
});

it("ages out resolved incidents by recovery time and keeps ongoing outages", async () => {
  const destinationId = await createDestination();
  const activeDestination = await createDestination();
  const expired = new Date(today);
  expired.setUTCDate(expired.getUTCDate() - settings().RETENTION_DAYS - 1);
  for (const target of [destinationId, activeDestination]) {
    await finish(target, unavailable, expired);
    await finish(target, unavailable, expired);
    await finish(target, unavailable, expired);
  }
  await finish(destinationId, accepted, expired);
  // A second long-running incident only recovered today and stays in the log.
  await finish(destinationId, unavailable, expired);
  await finish(destinationId, unavailable, expired);
  await finish(destinationId, unavailable, expired);
  await finish(destinationId, accepted, today);
  await retainRecent();
  const retained = await db.destinationIncident.findMany({
    where: { destinationId, organizationId },
  });
  expect(retained).toHaveLength(1);
  expect(retained[0]).toMatchObject({ openedAt: expired, resolvedAt: today });
  expect(
    await db.destinationIncident.count({
      where: {
        destinationId: activeDestination,
        organizationId,
        resolvedAt: null,
      },
    }),
  ).toBe(1);
});

it("rolls back with the attempt and counts concurrent or redelivered completions only once", async () => {
  const destinationId = await createDestination();
  const scope = { organizationId, destinationId };
  const claims = await Promise.all(
    Array.from({ length: 4 }, () => beginAttempt(destinationId)),
  );
  await expect(
    db.$transaction(async (tx) => {
      await tx.deliveryAttempt.update({
        where: { id: claims[0].attempt.id },
        data: { ...unavailable, finishedAt: new Date() },
      });
      throw new Error("rollback test");
    }),
  ).rejects.toThrow("rollback test");
  expect(await db.destinationDailyStat.count({ where: scope })).toBe(0);

  const completion = {
    now: new Date(),
    status: "failed",
    result: { outcome: "retry", status: 503, durationMs: 20 },
  } as const;
  await Promise.all(
    [...claims, claims[0]].map((claim) => recordOutcome(claim, completion)),
  );
  // Rewriting an already-final attempt also does not produce another observation.
  await db.deliveryAttempt.update({
    where: { id: claims[0].attempt.id },
    data: { finishedAt: completion.now },
  });
  const incidents = await db.destinationIncident.findMany({ where: scope });
  expect(incidents).toHaveLength(1);
  expect(incidents[0].failureCount).toBe(4);
  const stat = await db.destinationDailyStat.findFirstOrThrow({ where: scope });
  expect(stat).toMatchObject({
    failureCount: 4,
    responseCount: 4,
    responseDurationMs: 80n,
  });
});

it("keeps today and six UTC days independently of event deletion and enforces tenant ownership", async () => {
  const destinationId = await createDestination();
  const scope = { organizationId, destinationId };
  const firstDay = new Date(today);
  firstDay.setUTCDate(firstDay.getUTCDate() - 6);
  const expiredDay = new Date(firstDay.getTime() - 1);
  await finish(destinationId, accepted, expiredDay);
  await finish(destinationId, accepted, firstDay);
  await finish(destinationId, { outcome: "retry", durationMs: 90 }, today);
  // HTTP responses without a recorded duration still count toward availability.
  await finish(destinationId, { outcome: "success", httpStatus: 200 }, today);
  await db.webhookEvent.deleteMany({
    where: { organizationId, deliveries: { some: { destinationId } } },
  });
  const rows = await db.destinationDailyStat.findMany({
    where: scope,
    orderBy: { day: "asc" },
  });
  expect(rows.map((row) => row.day)).toEqual([firstDay, today]);
  expect(rows[0]).toMatchObject({
    successCount: 1,
    failureCount: 0,
    responseCount: 1,
    responseDurationMs: 0n,
  });
  expect(rows[1]).toMatchObject({
    successCount: 1,
    failureCount: 1,
    responseCount: 0,
    responseDurationMs: 0n,
  });

  await expect(
    db.destinationDailyStat.create({
      data: { destinationId, organizationId: randomUUID(), day: expiredDay },
    }),
  ).rejects.toMatchObject({ code: "P2003" });
  await db.destinationDailyStat.create({ data: { ...scope, day: expiredDay } });
  await retainRecent();
  expect(await db.destinationDailyStat.count({ where: scope })).toBe(2);
});
