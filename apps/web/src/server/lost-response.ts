import { createHmac } from "node:crypto";
import { z } from "zod";
import { database, Prisma } from "@relayhub/db";
import { storeEvent } from "@relayhub/db/events";
import { withinLimit } from "@relayhub/db/rate-limit";
import { settings } from "@relayhub/shared/config";
import { encrypt, newSecret } from "@relayhub/shared/encryption";
import {
  LAB_DESTINATION_ID,
  LAB_ORGANIZATION_ID,
  LAB_SOURCE_ID,
  lostResponseReceiverUrl,
  lostResponseSigningSecret,
} from "@relayhub/shared/lost-response";
import type { LostResponseReport } from "../lost-response-report";
import { HttpError } from "./http";

const ORDER_TYPE = "order.created";
const STARTS_PER_HOUR = 60;
const HOUR_SECONDS = 3600;
export const runIdentifier = z.uuidv4();

// The public URL alone cannot identify a stored order. Retries from the same tab
// derive the same sender ID without storing the browser's bearer key.
export function labEventId(request: Request, runId: string) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, key, extra] = authorization.split(" ");
  if (
    scheme !== "Bearer" ||
    extra !== undefined ||
    !runIdentifier.safeParse(key).success
  ) {
    throw new HttpError(401, "run_key_required");
  }
  return createHmac("sha256", settings().BETTER_AUTH_SECRET)
    .update("lost-response:order:" + runId + ":" + key)
    .digest("hex");
}

// This workspace has no members. Only the fixed lab route receives public test orders.
async function provisionLabRoute() {
  const db = database();
  return db.$transaction(async (tx) => {
    // A native upsert on the same primary key serializes first-time provisioning.
    await tx.organization.upsert({
      where: { id: LAB_ORGANIZATION_ID },
      create: { id: LAB_ORGANIZATION_ID, name: "RelayHub delivery lab" },
      update: { name: "RelayHub delivery lab" },
      select: { id: true },
    });
    const source = await tx.webhookSource.upsert({
      where: {
        id_organizationId: {
          id: LAB_SOURCE_ID,
          organizationId: LAB_ORGANIZATION_ID,
        },
      },
      create: {
        id: LAB_SOURCE_ID,
        organizationId: LAB_ORGANIZATION_ID,
        name: "Test orders",
        secret: encrypt(Buffer.from(newSecret()), "source:" + LAB_SOURCE_ID),
      },
      update: {},
      select: { secret: true },
    });
    const receiver = {
      url: lostResponseReceiverUrl(),
      secret: encrypt(
        Buffer.from(lostResponseSigningSecret()),
        "destination:" + LAB_DESTINATION_ID,
      ),
    };
    await tx.webhookDestination.upsert({
      where: {
        id_organizationId: {
          id: LAB_DESTINATION_ID,
          organizationId: LAB_ORGANIZATION_ID,
        },
      },
      create: {
        id: LAB_DESTINATION_ID,
        organizationId: LAB_ORGANIZATION_ID,
        name: "Order receiver",
        ...receiver,
      },
      update: receiver,
      select: { id: true },
    });
    const route = {
      sourceId: LAB_SOURCE_ID,
      destinationId: LAB_DESTINATION_ID,
      eventType: ORDER_TYPE,
    };
    await tx.subscription.upsert({
      where: { sourceId_destinationId_eventType: route },
      create: { organizationId: LAB_ORGANIZATION_ID, ...route },
      update: {},
    });
    return source.secret;
  });
}

export async function readLostResponse(
  runId: string,
  externalId: string,
): Promise<LostResponseReport | null> {
  return database().$transaction(
    async (tx) => {
      const delivery = await tx.delivery.findFirst({
        where: {
          organizationId: LAB_ORGANIZATION_ID,
          destinationId: LAB_DESTINATION_ID,
          event: { sourceId: LAB_SOURCE_ID, externalId, eventType: ORDER_TYPE },
        },
        select: {
          id: true,
          status: true,
          attempts: {
            orderBy: { number: "asc" },
            select: {
              number: true,
              deliveryId: true,
              outcome: true,
              startedAt: true,
              finishedAt: true,
              durationMs: true,
              httpStatus: true,
            },
          },
        },
      });
      if (!delivery) {
        return null;
      }
      // Read the receiver's order ledger independently of the worker's HTTP outcomes.
      const orders = await tx.lostResponseOrder.aggregate({
        where: { deliveryId: delivery.id },
        _count: { _all: true },
        _min: { createdAt: true },
        _sum: { receipts: true },
      });
      return {
        runId,
        deliveryId: delivery.id,
        status: delivery.status,
        attempts: delivery.attempts.map((attempt) => ({
          ...attempt,
          startedAt: attempt.startedAt.toISOString(),
          finishedAt: attempt.finishedAt?.toISOString() ?? null,
        })),
        requestsReceived: orders._sum.receipts ?? 0,
        ordersSaved: orders._count._all,
        orderSavedAt: orders._min.createdAt?.toISOString() ?? null,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

async function reserveLabCapacity(tx: Prisma.TransactionClient) {
  if (
    !(await withinLimit("lost-response:new", STARTS_PER_HOUR, HOUR_SECONDS, tx))
  ) {
    const secondsUntilNextWindow =
      HOUR_SECONDS - (Math.floor(Date.now() / 1000) % HOUR_SECONDS);
    throw new HttpError(429, "rate_limited", secondsUntilNextWindow);
  }
}

export async function startLostResponse(
  runId: string,
  externalId: string,
  correlationId: string,
) {
  const current = await readLostResponse(runId, externalId);
  if (current) {
    return current;
  }
  if (settings().MAX_ATTEMPTS < 2) {
    throw new HttpError(503, "retry_unavailable");
  }
  const sourceSecret = await provisionLabRoute();
  const result = await storeEvent(
    {
      sourceId: LAB_SOURCE_ID,
      organizationId: LAB_ORGANIZATION_ID,
      sourceSecret,
      correlationId,
      externalId,
      eventType: ORDER_TYPE,
      testDestinationId: LAB_DESTINATION_ID,
      body: Buffer.from(JSON.stringify({ type: ORDER_TYPE, id: externalId })),
    },
    reserveLabCapacity,
  );
  if (result.kind !== "accepted" && result.kind !== "duplicate") {
    throw new HttpError(503, "lab_unavailable");
  }
  const report = await readLostResponse(runId, externalId);
  if (!report) {
    throw new HttpError(503, "lab_unavailable");
  }
  return report;
}
