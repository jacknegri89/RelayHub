import { database, Prisma } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const RECENT_EVENTS = 4;

type WindowCounts = {
  delivered: number;
  failed: number;
  previousDelivered: number;
  previousFailed: number;
  meanSuccessfulMs: number | null;
};
type Timings = { samples: number; percentiles: number[] | null };
type ResourceCounts = { enabled: number; configured: boolean };
export type OverviewDay = { date: string; succeeded: number; failed: number };

export async function readOverview(organizationId: string, now = new Date()) {
  const db = database();
  const since = new Date(now.getTime() - DAY_MS);
  const previous = new Date(since.getTime() - DAY_MS);
  const midnight = new Date(now);
  midnight.setUTCHours(0, 0, 0, 0);
  const first = new Date(midnight.getTime() - (WEEK_DAYS - 1) * DAY_MS);
  // All cards and plots see the same database snapshot, including workers completing deliveries.
  const [
    windows,
    timings,
    received,
    inflight,
    sourceCounts,
    destinationCounts,
    activeRoutes,
    daily,
    latest,
  ] = await db.$transaction(
    [
      db.$queryRaw<WindowCounts[]>`
      SELECT count(*) FILTER (WHERE status='delivered' AND "finishedAt">=${since})::int AS delivered,
             count(*) FILTER (WHERE status='failed' AND "finishedAt">=${since})::int AS failed,
             count(*) FILTER (WHERE status='delivered' AND "finishedAt"<${since})::int AS "previousDelivered",
             count(*) FILTER (WHERE status='failed' AND "finishedAt"<${since})::int AS "previousFailed",
             avg("durationMs") FILTER (WHERE status='delivered' AND "finishedAt">=${since})::float8 AS "meanSuccessfulMs"
      FROM "Delivery" WHERE "organizationId"=${organizationId} AND status IN ('delivered','failed')
        AND "finishedAt">=${previous} AND "finishedAt"<${now}`,
      db.$queryRaw<Timings[]>`
      SELECT count(*)::int AS samples,
             percentile_cont(ARRAY[0.50,0.95,0.99]) WITHIN GROUP (ORDER BY a."durationMs") AS percentiles
      FROM "DeliveryAttempt" a JOIN "Delivery" d ON d.id=a."deliveryId"
      WHERE d."organizationId"=${organizationId} AND a."finishedAt">=${since} AND a."finishedAt"<${now}
        AND a.outcome IN ('success','retry','http_error') AND a."httpStatus" BETWEEN 100 AND 599 AND a."durationMs">=0`,
      db.webhookEvent.count({
        where: { organizationId, receivedAt: { gte: since, lt: now } },
      }),
      db.delivery.count({
        where: {
          organizationId,
          status: {
            in: ["pending", "queued", "delivering", "retry_scheduled"],
          },
        },
      }),
      db.$queryRaw<ResourceCounts[]>`
      SELECT count(*) FILTER (WHERE enabled)::int AS enabled, count(*) > 0 AS configured
      FROM "WebhookSource" WHERE "organizationId"=${organizationId}`,
      db.$queryRaw<ResourceCounts[]>`
      SELECT count(*) FILTER (WHERE enabled)::int AS enabled, count(*) > 0 AS configured
      FROM "WebhookDestination" WHERE "organizationId"=${organizationId}`,
      db.subscription.count({
        where: {
          organizationId,
          source: { enabled: true },
          destination: { enabled: true },
        },
      }),
      db.destinationDailyStat.groupBy({
        by: ["day"],
        orderBy: { day: "asc" },
        where: { organizationId, day: { gte: first, lte: midnight } },
        _sum: { successCount: true, failureCount: true },
      }),
      db.webhookEvent.findMany({
        where: { organizationId },
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        take: RECENT_EVENTS,
        select: {
          id: true,
          eventType: true,
          externalId: true,
          receivedAt: true,
          source: { select: { name: true } },
          deliveries: { select: { status: true } },
        },
      }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  const totals = new Map(daily.map((row) => [row.day.getTime(), row._sum]));
  const days: OverviewDay[] = [];
  for (let time = first.getTime(); time <= midnight.getTime(); time += DAY_MS) {
    const row = totals.get(time);
    days.push({
      date: new Date(time).toISOString().slice(0, 10),
      succeeded: row?.successCount ?? 0,
      failed: row?.failureCount ?? 0,
    });
  }
  return {
    counts: windows[0],
    comparisonRetained: settings().RETENTION_DAYS >= 2,
    timings: timings[0],
    received,
    inflight,
    sources: sourceCounts[0].enabled,
    destinations: destinationCounts[0].enabled,
    hasConfiguredSources: sourceCounts[0].configured,
    hasConfiguredDestinations: destinationCounts[0].configured,
    activeRoutes,
    days,
    latest,
  };
}
