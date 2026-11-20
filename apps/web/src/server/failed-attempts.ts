import { database, Prisma } from "@relayhub/db";
import { z } from "zod";

const PAGE_SIZE = 20;
const DAY_MS = 86_400_000;
const HISTORY_DAYS = 7;

function historyDay(value: string, now: Date) {
  if (!z.iso.date().safeParse(value).success) {
    return null;
  }
  const start = new Date(value + "T00:00:00.000Z");
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const age = today.getTime() - start.getTime();
  if (age < 0 || age >= HISTORY_DAYS * DAY_MS) {
    return null;
  }
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export async function readFailedAttempts(
  organizationId: string,
  destinationId: string,
  day: string,
  requestedPage = 1,
  now = new Date(),
) {
  const interval = historyDay(day, now);
  if (!interval || !z.uuid().safeParse(destinationId).success) {
    return null;
  }
  const scope = { organizationId, destinationId };
  // Mirror relayhub_observe_attempt: a transport failure has a measured attempt but no HTTP response.
  const failures: Prisma.DeliveryAttemptWhereInput = {
    delivery: scope,
    finishedAt: { gte: interval.start, lt: interval.end },
    OR: [
      {
        outcome: { in: ["success", "retry", "http_error"] },
        OR: [
          { httpStatus: { gte: 100, lt: 200 } },
          { httpStatus: { gte: 300, lte: 599 } },
        ],
      },
      { outcome: "retry", httpStatus: null, durationMs: { gte: 0 } },
    ],
  };
  const db = database();
  return db.$transaction(
    async (tx) => {
      const destination = await tx.webhookDestination.findFirst({
        where: { id: destinationId, organizationId },
        select: { name: true },
      });
      if (!destination) {
        return null;
      }
      const aggregate = await tx.destinationDailyStat.findFirst({
        where: { ...scope, day: interval.start },
        select: { failureCount: true },
      });
      const available = await tx.deliveryAttempt.count({ where: failures });
      const pages = Math.max(1, Math.ceil(available / PAGE_SIZE));
      let page = 1;
      if (Number.isSafeInteger(requestedPage) && requestedPage > 1) {
        page = Math.min(requestedPage, pages);
      }
      const rows = await tx.deliveryAttempt.findMany({
        where: failures,
        // Oldest first keeps existing pages stable as new attempts finish today.
        orderBy: [{ finishedAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          number: true,
          finishedAt: true,
          httpStatus: true,
          durationMs: true,
          failureStreakId: true,
          delivery: {
            select: {
              id: true,
              status: true,
              event: {
                select: { id: true, externalId: true, eventType: true },
              },
            },
          },
        },
      });
      const streaks = new Set<string>();
      for (const row of rows) {
        if (row.failureStreakId) {
          streaks.add(row.failureStreakId);
        }
      }
      const incidents = await tx.destinationIncident.findMany({
        where: {
          ...scope,
          failureStreakId: { in: [...streaks] },
          resolvedAt: { not: null },
        },
        select: { id: true, failureStreakId: true, resolvedAt: true },
      });
      const resolvedByStreak = new Map(
        incidents.map((incident) => [incident.failureStreakId, incident]),
      );
      return {
        destination,
        total: aggregate?.failureCount ?? 0,
        available,
        page,
        pages,
        rows,
        resolvedByStreak,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
