import type { Queue } from "bullmq";
import { database, Prisma } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import {
  activeStates,
  canTransition,
  deliveryStates,
} from "@relayhub/shared/delivery-states";
import { retryDelay } from "@relayhub/shared/retry";
import { recordOutcome, type JobData } from "./delivery";

export const QUEUE_NAME = "relayhub-deliveries";
const PUBLISH_INTERVAL_MS = 10_000;
const BATCH_SIZE = 50;
const HEALTH_HISTORY_DAYS = 7;
const queueable = deliveryStates.filter((state) =>
  canTransition(state, "queued"),
);

export async function dispatch(queue: Queue<JobData>) {
  const now = new Date();
  const entries = await database().outboxEntry.findMany({
    where: {
      publishAfter: { lte: now },
      delivery: { status: { in: ["pending", "queued", "retry_scheduled"] } },
    },
    orderBy: { publishAfter: "asc" },
    take: BATCH_SIZE,
  });
  for (const entry of entries) {
    if (!(await reserve(entry, now))) {
      continue;
    }
    await queue.add(
      "deliver",
      { deliveryId: entry.deliveryId, generation: entry.generation },
      {
        jobId: entry.deliveryId + "-" + entry.generation,
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 1,
      },
    );
  }
  return entries.length;
}

async function reserve(
  entry: { deliveryId: string; generation: number },
  now: Date,
) {
  return database().$transaction(async (tx) => {
    // Lock delivery before outbox, matching the processor's lock order.
    const queued = await tx.delivery.updateMany({
      where: {
        id: entry.deliveryId,
        generation: entry.generation,
        status: { in: queueable },
      },
      data: { status: "queued", queuedAt: now },
    });
    const reservation = await tx.outboxEntry.updateMany({
      where: {
        ...entry,
        publishAfter: { lte: now },
        delivery: { status: "queued" },
      },
      data: { publishAfter: new Date(now.getTime() + PUBLISH_INTERVAL_MS) },
    });
    return Boolean(reservation.count || queued.count);
  });
}

export async function recover() {
  const now = new Date();
  const expired = await database().delivery.findMany({
    where: { status: "delivering", leaseExpiresAt: { lte: now } },
    select: {
      id: true,
      generation: true,
      runAttempts: true,
      attemptCount: true,
      leaseToken: true,
    },
    take: BATCH_SIZE,
  });
  for (const delivery of expired) {
    const result = { outcome: "lease_expired" } as const;
    if (delivery.runAttempts >= settings().MAX_ATTEMPTS) {
      await recordOutcome(
        { delivery, leaseToken: delivery.leaseToken },
        { now, result, status: "failed" },
      );
      continue;
    }
    const nextAt = new Date(
      now.getTime() + retryDelay(delivery.runAttempts, undefined),
    );
    await recordOutcome(
      { delivery, leaseToken: delivery.leaseToken },
      { now, result, status: "retry_scheduled", nextAt },
    );
  }
}

export async function retainRecent(now = Date.now()) {
  const db = database();
  // Keep today and six complete UTC days, independently of raw event retention.
  const firstHealthDay = new Date(now);
  firstHealthDay.setUTCHours(0, 0, 0, 0);
  firstHealthDay.setUTCDate(
    firstHealthDay.getUTCDate() - HEALTH_HISTORY_DAYS + 1,
  );
  await db.destinationDailyStat.deleteMany({
    where: { day: { lt: firstHealthDay } },
  });
  const cutoff = new Date(
    now - settings().RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  await db.destinationEmailSubscription.deleteMany({
    where: { challengeExpiresAt: { lt: new Date(now) }, verifiedAt: null },
  });
  await db.destinationEmailMessage.deleteMany({
    where: { finishedAt: { lt: cutoff } },
  });
  // An active outage remains visible for as long as it lasts.
  await db.destinationIncident.deleteMany({
    where: { resolvedAt: { lt: cutoff } },
  });
  const events = await db.webhookEvent.findMany({
    where: {
      receivedAt: { lt: cutoff },
      deliveries: { none: { status: { in: activeStates } } },
    },
    orderBy: { receivedAt: "asc" },
    select: { id: true },
    take: BATCH_SIZE,
  });
  if (events.length) {
    await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "WebhookEvent"
        WHERE "id" IN (${Prisma.join(events.map((event) => event.id))})
        ORDER BY "id" FOR UPDATE SKIP LOCKED
      `;
      await tx.webhookEvent.deleteMany({
        where: {
          id: { in: locked.map((event) => event.id) },
          deliveries: { none: { status: { in: activeStates } } },
        },
      });
    });
  }
  // Expired login sessions and unused verification challenges can remain after a browser closes.
  await db.session.deleteMany({ where: { expiresAt: { lte: new Date(now) } } });
  await db.verification.deleteMany({
    where: { expiresAt: { lte: new Date(now) } },
  });
  await db.requestCounter.deleteMany({
    where: { expiresAt: { lt: new Date(now) } },
  });
  await db.ingressReceipt.deleteMany({
    where: { expiresAt: { lt: new Date(now) } },
  });
  await db.registrationInvite.deleteMany({
    where: { expiresAt: { lt: new Date(now) } },
  });
  await db.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
}
