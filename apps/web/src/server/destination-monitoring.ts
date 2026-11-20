import { database, Prisma } from "@relayhub/db";

export type DestinationAlert = {
  id: string;
  kind: "outage" | "recovery";
  destinationId: string;
  name: string;
  at: string;
};

export type AlertSummary = {
  openCount: number;
  latest: DestinationAlert | null;
};
type TransitionRow = Omit<DestinationAlert, "at"> & { at: Date };
type SummaryRow = { openCount: number } & (TransitionRow | { id: null });
type AlertFilter = { destinationId?: string; onlyOpen?: boolean };

// Each incident has one opening and, once it closes, one recovery.
function transitions(organizationId: string, filter: AlertFilter) {
  const scope = Prisma.sql`i."organizationId" = ${organizationId}`;
  let destination = Prisma.empty;
  if (filter.destinationId) {
    destination = Prisma.sql`AND i."destinationId" = ${filter.destinationId}`;
  }
  const opening = Prisma.sql`
    SELECT i.id, i."destinationId", i."organizationId", 'outage' AS kind, i."openedAt" AS at, i."openedOrder" AS ordinal
    FROM "DestinationIncident" i WHERE ${scope} ${destination}`;
  if (filter.onlyOpen) {
    return Prisma.sql`${opening} AND i."resolvedAt" IS NULL`;
  }
  return Prisma.sql`${opening}
    UNION ALL
    SELECT i.id, i."destinationId", i."organizationId", 'recovery' AS kind, i."resolvedAt" AS at, i."resolvedOrder" AS ordinal
    FROM "DestinationIncident" i WHERE ${scope} ${destination} AND i."resolvedAt" IS NOT NULL`;
}

function alertRows(
  organizationId: string,
  filter: AlertFilter,
  take: number,
  skip = 0,
) {
  return Prisma.sql`
    SELECT e.id, e.kind, e."destinationId", d.name, e.at
    FROM (SELECT * FROM (${transitions(organizationId, filter)}) transitions
          ORDER BY at DESC, ordinal DESC LIMIT ${take} OFFSET ${skip}) e
    JOIN "WebhookDestination" d ON d.id = e."destinationId" AND d."organizationId" = e."organizationId"
    ORDER BY e.at DESC, e.ordinal DESC`;
}

function presentAlert(row: TransitionRow): DestinationAlert {
  return {
    id: row.id,
    kind: row.kind,
    destinationId: row.destinationId,
    name: row.name,
    at: row.at.toISOString(),
  };
}

export async function readAlerts(
  organizationId: string,
  filter: AlertFilter,
  take: number,
  skip = 0,
) {
  const rows = await database().$queryRaw<TransitionRow[]>(
    alertRows(organizationId, filter, take, skip),
  );
  return rows.map(presentAlert);
}

export async function readAlertSummary(
  organizationId: string,
): Promise<AlertSummary> {
  // The count and latest transition must describe the same PostgreSQL snapshot.
  const [row] = await database().$queryRaw<SummaryRow[]>`
    SELECT c."openCount", latest.*
    FROM (SELECT count(*)::int AS "openCount" FROM "DestinationIncident"
          WHERE "organizationId" = ${organizationId} AND "resolvedAt" IS NULL) c
    LEFT JOIN (${alertRows(organizationId, {}, 1)}) latest ON TRUE`;
  let latest: DestinationAlert | null = null;
  if (row.id !== null) {
    latest = presentAlert(row);
  }
  return { openCount: row.openCount, latest };
}

const WEEK_DAYS = 7;
const DAY_MS = 86_400_000;

export async function readDestinationReport(
  organizationId: string,
  destinationId: string,
  now = new Date(),
) {
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const first = today - (WEEK_DAYS - 1) * DAY_MS;
  const db = database();
  const scope = { organizationId, destinationId };
  // On a busy receiver the latest status, incident feed and chart must refer to the same completed attempts.
  const [destination, rows, alerts] = await db.$transaction(
    [
      db.webhookDestination.findFirst({
        where: { organizationId, id: destinationId },
        select: {
          name: true,
          enabled: true,
          consecutiveFailures: true,
          lastHealthObservationAt: true,
        },
      }),
      db.destinationDailyStat.findMany({
        where: {
          ...scope,
          day: { gte: new Date(first), lte: new Date(today) },
        },
        select: {
          day: true,
          successCount: true,
          failureCount: true,
          responseDurationMs: true,
          responseCount: true,
        },
      }),
      db.$queryRaw<TransitionRow[]>(
        alertRows(organizationId, { destinationId }, 4),
      ),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  if (!destination) {
    return null;
  }
  const byDate = new Map(rows.map((row) => [row.day.getTime(), row]));
  const days = [];
  for (let date = first; date <= today; date += DAY_MS) {
    const row = byDate.get(date);
    let averageMs: number | null = null;
    if (row && row.responseCount > 0) {
      averageMs = Number(row.responseDurationMs) / row.responseCount;
    }
    days.push({
      date: new Date(date).toISOString().slice(0, 10),
      successes: row?.successCount ?? 0,
      failures: row?.failureCount ?? 0,
      averageMs,
    });
  }
  return { destination, days, alerts: alerts.map(presentAlert) };
}
