import { randomUUID } from "node:crypto";
import { database, type DeliveryStatus } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import {
  canTransition,
  deliveryStates,
} from "@relayhub/shared/delivery-states";
import { DestinationBlocked } from "@relayhub/shared/destinations";
import { decrypt } from "@relayhub/shared/encryption";
import { log } from "@relayhub/shared/log";
import { signature } from "@relayhub/shared/protocol";
import { classifyStatus, retryDelay } from "@relayhub/shared/retry";
import { send } from "./send";

export type JobData = { deliveryId: string; generation: number };
const claimable = deliveryStates.filter((state) =>
  canTransition(state, "delivering"),
);

export async function claim({ deliveryId, generation }: JobData) {
  const now = new Date();
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(
    now.getTime() + settings().DELIVERY_TIMEOUT_MS + 30_000,
  );
  return database().$transaction(async (tx) => {
    const result = await tx.delivery.updateMany({
      where: {
        id: deliveryId,
        generation,
        status: { in: claimable },
        nextAt: { lte: now },
      },
      data: {
        status: "delivering",
        leaseToken,
        leaseExpiresAt,
        attemptCount: { increment: 1 },
        runAttempts: { increment: 1 },
      },
    });
    if (!result.count) {
      return null;
    }
    const delivery = await tx.delivery.findUniqueOrThrow({
      where: { id: deliveryId },
      include: {
        event: { include: { source: { select: { enabled: true } } } },
        destination: true,
      },
    });
    await tx.deliveryAttempt.create({
      data: { deliveryId, number: delivery.attemptCount, startedAt: now },
    });
    return { delivery, leaseToken, leaseExpiresAt };
  });
}

type Claim = NonNullable<Awaited<ReturnType<typeof claim>>>;
type AttemptResult = {
  outcome:
    | "success"
    | "retry"
    | "http_error"
    | "policy_blocked"
    | "disabled"
    | "decryption_error";
  status?: number;
  retryAfter?: string;
  durationMs?: number;
};

export async function processDelivery(job: JobData) {
  const claimed = await claim(job);
  if (!claimed) {
    return;
  }
  const result = await attempt(claimed);
  await finish(claimed, result);
  log("info", "delivery_attempt", {
    deliveryId: job.deliveryId,
    correlationId: claimed.delivery.event.correlationId,
    attempt: claimed.delivery.attemptCount,
    outcome: result.outcome,
    ...(result.status && { httpStatus: result.status }),
  });
}

async function attempt({
  delivery,
  leaseExpiresAt,
}: Claim): Promise<AttemptResult> {
  const { event, destination } = delivery;
  if (!destination.enabled || !event.source.enabled) {
    return { outcome: "disabled" };
  }
  let body: Buffer;
  let secret: string;
  try {
    body = decrypt(event.payload, "event:" + event.id);
    secret = decrypt(
      destination.secret,
      "destination:" + destination.id,
    ).toString("utf8");
  } catch {
    return { outcome: "decryption_error" };
  }
  const timeout = Math.min(
    settings().DELIVERY_TIMEOUT_MS,
    leaseExpiresAt.getTime() - Date.now() - 1000,
  );
  if (timeout <= 0) {
    return { outcome: "retry" };
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  const started = performance.now();
  try {
    const result = await send(
      destination.url,
      body,
      {
        "x-relayhub-delivery-id": delivery.id,
        "x-relayhub-event-id": event.externalId,
        "x-relayhub-timestamp": timestamp,
        "x-relayhub-signature": signature(secret, timestamp, body),
      },
      timeout,
    );
    const classification = classifyStatus(result.status);
    let outcome: AttemptResult["outcome"] = "http_error";
    if (classification !== "permanent") {
      outcome = classification;
    }
    return {
      ...result,
      outcome,
      durationMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    if (error instanceof DestinationBlocked) {
      return { outcome: "policy_blocked" };
    }
    return {
      outcome: "retry",
      durationMs: Math.round(performance.now() - started),
    };
  }
}

async function finish({ delivery, leaseToken }: Claim, result: AttemptResult) {
  const now = new Date();
  let status: DeliveryStatus = "failed";
  let nextAt: Date | undefined;
  if (result.outcome === "success") {
    status = "delivered";
  } else if (result.outcome === "disabled") {
    status = "cancelled";
  } else if (
    result.outcome === "retry" &&
    delivery.runAttempts < settings().MAX_ATTEMPTS
  ) {
    status = "retry_scheduled";
    nextAt = new Date(
      now.getTime() + retryDelay(delivery.runAttempts, result.retryAfter),
    );
  }
  await recordOutcome(
    { delivery, leaseToken },
    { status, nextAt, now, result },
  );
}

type RecordInput = {
  status: DeliveryStatus;
  now: Date;
  nextAt?: Date;
  result:
    | AttemptResult
    | { outcome: "lease_expired"; status?: undefined; durationMs?: undefined };
};

export async function recordOutcome(
  {
    delivery,
    leaseToken,
  }: {
    delivery: Pick<Claim["delivery"], "id" | "generation" | "attemptCount">;
    leaseToken: string | null;
  },
  { status, now, nextAt, result }: RecordInput,
) {
  if (
    !canTransition("delivering", status) ||
    Boolean(nextAt) !== (status === "retry_scheduled")
  ) {
    throw new Error("Invalid delivery outcome transition");
  }
  let finishedAt: Date | null = now;
  if (nextAt) {
    finishedAt = null;
  }
  await database().$transaction(async (tx) => {
    const changed = await tx.delivery.updateMany({
      where: {
        id: delivery.id,
        generation: delivery.generation,
        status: "delivering",
        leaseToken,
      },
      data: {
        status,
        leaseToken: null,
        leaseExpiresAt: null,
        lastStatus: result.status ?? null,
        durationMs: result.durationMs ?? null,
        generation: { increment: Number(Boolean(nextAt)) },
        nextAt: nextAt ?? now,
        finishedAt,
      },
    });
    if (!changed.count) {
      return;
    }
    await tx.deliveryAttempt.update({
      where: {
        deliveryId_number: {
          deliveryId: delivery.id,
          number: delivery.attemptCount,
        },
      },
      data: {
        outcome: result.outcome,
        httpStatus: result.status,
        durationMs: result.durationMs,
        finishedAt: now,
        retryAt: nextAt,
      },
    });
    if (!nextAt) {
      await tx.outboxEntry.deleteMany({ where: { deliveryId: delivery.id } });
      return;
    }
    const schedule = {
      generation: delivery.generation + 1,
      availableAt: nextAt,
      publishAfter: nextAt,
    };
    await tx.outboxEntry.upsert({
      where: { deliveryId: delivery.id },
      create: { deliveryId: delivery.id, ...schedule },
      update: schedule,
    });
  });
}
