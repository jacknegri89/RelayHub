import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { readFailedAttempts } from "../apps/web/src/server/failed-attempts";

if (!settings().isDemo) {
  throw new Error("Failed-attempt tests require an isolated demo database.");
}

const db = database();
const org = randomUUID();
const source = randomUUID();
const dayStart = new Date();
dayStart.setUTCHours(0, 0, 0, 0);
dayStart.setUTCDate(dayStart.getUTCDate() - 1);
const day = dayStart.toISOString().slice(0, 10);
const dayMs = 86_400_000;

beforeAll(async () => {
  await db.organization.create({
    data: {
      id: org,
      name: "Failed attempts fixture",
      sources: { create: { id: source, name: "Shop", secret: "unused" } },
    },
  });
});

afterAll(async () => {
  try {
    await db.$transaction([
      db.webhookEvent.deleteMany({ where: { organizationId: org } }),
      db.webhookDestination.deleteMany({ where: { organizationId: org } }),
      db.webhookSource.deleteMany({ where: { organizationId: org } }),
      db.organization.deleteMany({ where: { id: org } }),
    ]);
  } finally {
    await db.$disconnect();
  }
});

async function fixture() {
  const destination = await db.webhookDestination.create({
    data: {
      organizationId: org,
      name: "Test receiver",
      url: "https://example.com",
      secret: "unused",
    },
  });
  const event = await db.webhookEvent.create({
    data: {
      organizationId: org,
      sourceId: source,
      externalId: randomUUID(),
      eventType: "test.order",
      correlationId: randomUUID(),
      payload: "",
      payloadHash: "",
      payloadSize: 0,
    },
  });
  const delivery = await db.delivery.create({
    data: {
      organizationId: org,
      destinationId: destination.id,
      eventId: event.id,
      status: "delivered",
    },
  });
  return { destination, delivery, event };
}

it("uses UTC completion time and the chart failure definition even for a subsequently delivered event", async () => {
  const { destination, delivery, event } = await fixture();
  const records = [
    { number: 1, offset: -1, outcome: "http_error", httpStatus: 400 },
    { number: 2, offset: 0, outcome: "http_error", httpStatus: 400 },
    { number: 3, offset: 1, outcome: "retry", durationMs: 5000 },
    { number: 4, offset: 2, outcome: "lease_expired" },
    { number: 5, offset: 3, outcome: "retry" },
    { number: 6, offset: 4, outcome: "success", httpStatus: 204 },
    {
      number: 7,
      offset: dayMs - 1,
      outcome: "retry",
      httpStatus: 503,
      durationMs: 3,
    },
    { number: 8, offset: dayMs, outcome: "http_error", httpStatus: 403 },
  ];
  for (const { offset, ...observation } of records) {
    await db.deliveryAttempt.create({
      data: {
        deliveryId: delivery.id,
        finishedAt: new Date(dayStart.getTime() + offset),
        ...observation,
      },
    });
  }
  const other = await fixture();
  await db.deliveryAttempt.create({
    data: {
      number: 1,
      deliveryId: other.delivery.id,
      finishedAt: dayStart,
      outcome: "retry",
      durationMs: 300,
    },
  });
  const report = await readFailedAttempts(org, destination.id, day);
  expect(report).toMatchObject({ total: 3, available: 3, page: 1, pages: 1 });
  expect(report?.rows.map((row) => row.number)).toEqual([2, 3, 7]);
  for (const row of report!.rows) {
    expect(row.delivery).toMatchObject({
      status: "delivered",
      event: { id: event.id },
    });
  }
  const [early, timedOut, later] = report!.rows;
  const recovered = report!.resolvedByStreak.get(early.failureStreakId);
  expect(recovered?.resolvedAt).toEqual(new Date(dayStart.getTime() + 4));
  expect(report!.resolvedByStreak.get(timedOut.failureStreakId)).toEqual(
    recovered,
  );
  expect(report!.resolvedByStreak.get(later.failureStreakId)).toBeUndefined();

  expect(
    await readFailedAttempts(randomUUID(), destination.id, day),
  ).toBeNull();
  expect(
    await readFailedAttempts(org, destination.id, "2001-01-01"),
  ).toBeNull();
  expect(
    await readFailedAttempts(org, destination.id, "2025-02-30"),
  ).toBeNull();
  await db.webhookEvent.deleteMany({
    where: { id: event.id, organizationId: org },
  });
  expect(await readFailedAttempts(org, destination.id, day)).toMatchObject({
    total: 3,
    available: 0,
    rows: [],
  });
});

it("paginates distinct attempts deterministically when completion timestamps match", async () => {
  const { delivery, destination } = await fixture();
  const attempts = Array.from({ length: 22 }, (_, index) => ({
    id: randomUUID(),
    number: index + 1,
    deliveryId: delivery.id,
    finishedAt: dayStart,
    outcome: "http_error",
    httpStatus: 400,
  }));
  await db.deliveryAttempt.createMany({ data: attempts });
  const first = await readFailedAttempts(org, destination.id, day);
  const last = await readFailedAttempts(org, destination.id, day, 2);
  expect(first).toMatchObject({ page: 1, pages: 2, available: 22 });
  expect(last).toMatchObject({ page: 2, pages: 2 });
  expect(first?.rows).toHaveLength(20);
  expect(last?.rows).toHaveLength(2);
  const paginated = [...first!.rows, ...last!.rows].map((row) => row.id);
  expect(paginated).toEqual(attempts.map((row) => row.id).sort());
});
