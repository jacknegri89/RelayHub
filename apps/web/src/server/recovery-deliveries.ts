import { database, Prisma } from "@relayhub/db";
import { RECOVERY_BATCH_SIZE } from "./commands";
import { HttpError } from "./http";

type Transaction = Prisma.TransactionClient;
type Scope = { organizationId: string; destinationId: string };
type Id = { id: string };
type Candidate = Id & {
  externalId: string;
  eventType: string;
  finishedAt: Date;
  httpStatus: number | null;
};

// Only the last attempt of the still-failed delivery may qualify. A subsequent
// run of the same delivery cannot be requeued by a stale recovery selection.
function candidateScope(scope: Scope, groupId: string) {
  return Prisma.sql`
    FROM "DeliveryAttempt" a
    JOIN "Delivery" d ON d.id = a."deliveryId" AND d."attemptCount" = a.number
    JOIN "WebhookEvent" e ON e.id = d."eventId" AND e."organizationId" = d."organizationId"
    JOIN "WebhookSource" s ON s.id = e."sourceId" AND s."organizationId" = e."organizationId"
    WHERE a."failureStreakId" = ${groupId} AND d."organizationId" = ${scope.organizationId}
      AND d."destinationId" = ${scope.destinationId} AND d.status = 'failed' AND s.enabled`;
}

export async function readRecovery(
  scope: Scope,
  incidentId?: string,
  after?: string,
) {
  const db = database();
  return db.$transaction(
    async (tx) => {
      const destination = await tx.webhookDestination.findFirst({
        where: {
          id: scope.destinationId,
          organizationId: scope.organizationId,
        },
        select: { name: true, enabled: true, consecutiveFailures: true },
      });
      if (!destination) {
        return null;
      }
      const incident = await tx.destinationIncident.findFirst({
        where: { ...scope, id: incidentId, resolvedAt: { not: null } },
        orderBy: [{ resolvedAt: "desc" }, { resolvedOrder: "desc" }],
        select: { id: true, resolvedAt: true, failureStreakId: true },
      });
      if (incidentId && !incident) {
        return null;
      }
      let rows: Candidate[] = [];
      let total = 0;
      if (incident?.failureStreakId) {
        const candidates = candidateScope(scope, incident.failureStreakId);
        let cursor = Prisma.empty;
        if (after) {
          cursor = Prisma.sql`AND d.id > ${after}`;
        }
        const [count] = await tx.$queryRaw<
          { total: number }[]
        >`SELECT count(*)::int AS total ${candidates}`;
        total = count.total;
        rows = await tx.$queryRaw<Candidate[]>`
        SELECT d.id, e."externalId", e."eventType", a."finishedAt", a."httpStatus"
        ${candidates} ${cursor} ORDER BY d.id LIMIT ${RECOVERY_BATCH_SIZE + 1}`;
      }
      const hasMore = rows.length > RECOVERY_BATCH_SIZE;
      return {
        destination,
        incident,
        rows: rows.slice(0, RECOVERY_BATCH_SIZE),
        hasMore,
        total,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

// Retention also locks events in ID order. Taking the same locks before
// changing deliveries preserves the original payload across concurrent cleanup.
async function lockEvents(
  tx: Transaction,
  organizationId: string,
  ids: string[],
  destinationId?: string,
) {
  let destination = Prisma.empty;
  if (destinationId) {
    destination = Prisma.sql`AND d."destinationId" = ${destinationId}`;
  }
  return tx.$queryRaw<Id[]>`
    SELECT e.id FROM "WebhookEvent" e JOIN "Delivery" d
      ON d."eventId" = e.id AND d."organizationId" = e."organizationId"
    WHERE d."organizationId" = ${organizationId} AND d.id IN (${Prisma.join(ids)}) ${destination}
    ORDER BY e.id FOR UPDATE OF e`;
}

async function enqueueFailed(
  tx: Transaction,
  organizationId: string,
  ids: string[],
) {
  if (!ids.length) {
    return [];
  }
  const now = new Date();
  const rows = await tx.delivery.updateManyAndReturn({
    where: { id: { in: ids }, organizationId, status: "failed" },
    data: {
      status: "pending",
      generation: { increment: 1 },
      runAttempts: 0,
      nextAt: now,
      queuedAt: null,
      finishedAt: null,
    },
    select: { id: true, generation: true },
  });
  if (rows.length) {
    await tx.outboxEntry.createMany({
      data: rows.map((row) => ({
        deliveryId: row.id,
        generation: row.generation,
        availableAt: now,
        publishAfter: now,
      })),
    });
  }
  return rows.map((row) => row.id);
}

export async function retryDelivery(
  tx: Transaction,
  organizationId: string,
  id: string,
) {
  const events = await lockEvents(tx, organizationId, [id]);
  if (!events.length) {
    throw new HttpError(404, "resource_not_found");
  }
  const queued = await enqueueFailed(tx, organizationId, [id]);
  if (!queued.length) {
    throw new HttpError(409, "delivery_is_not_failed");
  }
  return { id };
}

export async function retryRecoveryBatch(
  tx: Transaction,
  scope: Scope,
  actorId: string,
  incidentId: string,
  ids: string[],
) {
  const [incident] = await tx.$queryRaw<{ failureStreakId: string | null }[]>`
    SELECT "failureStreakId" FROM "DestinationIncident" WHERE id = ${incidentId}
    AND "organizationId" = ${scope.organizationId} AND "destinationId" = ${scope.destinationId}
    AND "resolvedAt" IS NOT NULL FOR SHARE`;
  if (!incident) {
    throw new HttpError(404, "resource_not_found");
  }
  await lockEvents(tx, scope.organizationId, ids, scope.destinationId);
  let eligible: Id[] = [];
  if (incident.failureStreakId) {
    eligible = await tx.$queryRaw<Id[]>`
      SELECT d.id ${candidateScope(scope, incident.failureStreakId)} AND d.id IN (${Prisma.join(ids)})
      ORDER BY d.id FOR UPDATE OF d FOR SHARE OF s`;
  }
  const [destination] = await tx.$queryRaw<{ ready: boolean }[]>`
    SELECT enabled AND "consecutiveFailures" < 3 AS ready FROM "WebhookDestination"
    WHERE id = ${scope.destinationId} AND "organizationId" = ${scope.organizationId} FOR SHARE`;
  if (!destination?.ready) {
    throw new HttpError(409, "destination_unavailable");
  }
  const queued = await enqueueFailed(
    tx,
    scope.organizationId,
    eligible.map((row) => row.id),
  );
  if (queued.length) {
    await tx.auditLog.createMany({
      data: queued.map((id) => ({
        organizationId: scope.organizationId,
        actorId,
        action: "delivery_retry",
        resourceId: id,
      })),
    });
  }
  return { id: incidentId, queued, skipped: ids.length - queued.length };
}
