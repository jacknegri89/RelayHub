import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { readOverview } from "../apps/web/src/server/overview";

if (!settings().isDemo) {
  throw new Error("Overview tests require the demo database.");
}
const db = database();
const fixtureOrgs = [randomUUID(), randomUUID()];
const [org, other] = fixtureOrgs;
const asOf = new Date();
asOf.setUTCHours(12, 0, 0, 0);
const DAY_MS = 86_400_000;
const since = new Date(asOf.getTime() - DAY_MS);

async function createOrganization(organizationId: string) {
  const source = randomUUID();
  const dest = randomUUID();
  const pausedSource = randomUUID();
  const pausedDestination = randomUUID();
  await db.organization.create({
    data: {
      id: organizationId,
      name: "Overview fixture",
      sources: {
        create: [
          { id: source, name: "Shop", secret: "unused" },
          {
            id: pausedSource,
            name: "Paused shop",
            secret: "unused",
            enabled: false,
          },
        ],
      },
      destinations: {
        create: [
          {
            id: dest,
            name: "Billing",
            url: "https://example.test",
            secret: "unused",
          },
          {
            id: pausedDestination,
            name: "Old billing",
            url: "https://example.test",
            secret: "unused",
            enabled: false,
          },
        ],
      },
    },
  });
  // Only rules with both endpoints enabled can actually forward new events.
  await db.subscription.createMany({
    data: [
      { organizationId, sourceId: source, destinationId: dest },
      { organizationId, sourceId: pausedSource, destinationId: dest },
      { organizationId, sourceId: source, destinationId: pausedDestination },
    ],
  });
  return { organizationId, source, dest };
}
async function complete(
  scope: Awaited<ReturnType<typeof createOrganization>>,
  at: Date,
  delivered: boolean,
  ms: number | null,
) {
  let status: "delivered" | "failed" = "failed";
  let httpStatus: number | null = 503;
  let outcome = "retry";
  if (delivered) {
    status = "delivered";
    httpStatus = 204;
    outcome = "success";
  }
  if (ms === null) {
    httpStatus = null;
  }
  const event = await db.webhookEvent.create({
    data: {
      organizationId: scope.organizationId,
      sourceId: scope.source,
      receivedAt: at,
      eventType: "test.order",
      externalId: randomUUID(),
      correlationId: randomUUID(),
      payload: "",
      payloadHash: "",
      payloadSize: 0,
    },
  });
  await db.delivery.create({
    data: {
      organizationId: scope.organizationId,
      eventId: event.id,
      destinationId: scope.dest,
      status,
      durationMs: ms,
      finishedAt: at,
      attempts: {
        create: {
          number: 1,
          finishedAt: at,
          httpStatus,
          outcome,
          durationMs: ms ?? 5000,
        },
      },
    },
  });
}
beforeAll(async () => {
  const ours = await createOrganization(org);
  const theirs = await createOrganization(other);
  // The two rolling windows touch at noon UTC; the calendar-day trend changes at midnight.
  await complete(ours, new Date(since.getTime() - 1), true, 600);
  await complete(ours, since, true, 0);
  await complete(ours, new Date(asOf.getTime() - 2000), false, 100);
  await complete(ours, new Date(asOf.getTime() - 1000), false, null);
  await complete(theirs, new Date(asOf.getTime() - 1000), true, 50_000);
});
afterAll(async () => {
  const where = { organizationId: { in: fixtureOrgs } };
  try {
    await db.$transaction([
      db.webhookEvent.deleteMany({ where }),
      db.webhookDestination.deleteMany({ where }),
      db.webhookSource.deleteMany({ where }),
      db.organization.deleteMany({ where: { id: { in: fixtureOrgs } } }),
    ]);
  } finally {
    await db.$disconnect();
  }
});
it("scopes both rolling windows, active resources, measured HTTP percentiles and seven UTC buckets", async () => {
  const summary = await readOverview(org, asOf);
  expect(summary).toMatchObject({
    counts: {
      delivered: 1,
      failed: 2,
      previousDelivered: 1,
      previousFailed: 0,
      meanSuccessfulMs: 0,
    },
    received: 3,
    inflight: 0,
    sources: 1,
    destinations: 1,
    hasConfiguredSources: true,
    hasConfiguredDestinations: true,
    activeRoutes: 1,
    timings: { samples: 2, percentiles: [50, 95, 99] },
  });
  expect(summary.days).toHaveLength(7);
  expect(summary.days[0]).toMatchObject({ succeeded: 0, failed: 0 });
  expect(summary.days[5]).toMatchObject({
    date: since.toISOString().slice(0, 10),
    succeeded: 2,
    failed: 0,
  });
  expect(summary.days[6]).toMatchObject({ succeeded: 0, failed: 2 });
  expect(summary.latest).toHaveLength(4);
  const empty = await readOverview(randomUUID(), asOf);
  expect(empty.hasConfiguredSources).toBe(false);
  expect(empty.hasConfiguredDestinations).toBe(false);
  expect(empty.activeRoutes).toBe(0);
  expect(empty.timings).toEqual({ samples: 0, percentiles: null });
  expect(empty.days.every((d) => d.succeeded === 0 && d.failed === 0)).toBe(
    true,
  );
});

it("distinguishes configured but disabled destinations from a new inventory", async () => {
  await db.webhookDestination.updateMany({
    where: { organizationId: other },
    data: { enabled: false },
  });
  const disabled = await readOverview(other, asOf);
  expect(disabled).toMatchObject({
    sources: 1,
    destinations: 0,
    activeRoutes: 0,
    hasConfiguredSources: true,
    hasConfiguredDestinations: true,
  });
});
