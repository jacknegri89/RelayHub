import { randomUUID } from "node:crypto";
import { database, type Prisma } from "./index";
import { settings } from "@relayhub/shared/config";
import { encrypt } from "@relayhub/shared/encryption";
import { hashPayload } from "@relayhub/shared/protocol";
import { can, type Role } from "@relayhub/shared/access";

type EventInput = {
  sourceId: string;
  organizationId: string;
  sourceSecret: string;
  externalId: string;
  eventType: string;
  ingressSignature?: string;
  body: Buffer;
  correlationId: string;
  testDestinationId?: string;
  actorId?: string;
};

export async function storeEvent(input: EventInput) {
  const db = database();
  const eventId = randomUUID();
  const payloadHash = hashPayload(input.body);
  try {
    return await db.$transaction(async (tx) => {
      if (input.actorId) {
        const members = await tx.$queryRaw<{ role: Role }[]>`
          SELECT "role" FROM "OrganizationMember"
          WHERE "organizationId" = ${input.organizationId} AND "userId" = ${input.actorId} FOR SHARE
        `;
        if (!members[0] || !can(members[0].role, "configure")) {
          return { kind: "source_unavailable" } as const;
        }
      }
      // Serialize ingress against disabling or rotating the source.
      const source = await tx.$queryRaw<{ secret: string; enabled: boolean }[]>`
        SELECT "secret", "enabled" FROM "WebhookSource"
        WHERE "id" = ${input.sourceId} AND "organizationId" = ${input.organizationId} FOR SHARE
      `;
      if (!source[0]?.enabled || source[0].secret !== input.sourceSecret) {
        return { kind: "source_unavailable" } as const;
      }
      if (
        input.ingressSignature &&
        !(await reserveSignature(tx, input, input.ingressSignature))
      ) {
        return { kind: "signature_replay" } as const;
      }
      const inserted = await tx.webhookEvent.createMany({
        skipDuplicates: true,
        data: {
          id: eventId,
          organizationId: input.organizationId,
          sourceId: input.sourceId,
          externalId: input.externalId,
          eventType: input.eventType,
          payloadSize: input.body.length,
          payloadHash,
          payload: encrypt(input.body, "event:" + eventId),
          correlationId: input.correlationId,
        },
      });
      if (!inserted.count) {
        const existing = await tx.webhookEvent.findUnique({
          where: {
            sourceId_externalId: {
              sourceId: input.sourceId,
              externalId: input.externalId,
            },
          },
          select: { id: true, payloadHash: true },
        });
        if (existing?.payloadHash === payloadHash) {
          return { kind: "duplicate", eventId: existing.id } as const;
        }
        return { kind: "event_conflict" } as const;
      }
      const receivedAt = new Date();
      const subscriptions = await tx.subscription.findMany({
        where: {
          organizationId: input.organizationId,
          sourceId: input.sourceId,
          destinationId: input.testDestinationId,
          eventType: { in: ["", input.eventType] },
          destination: { enabled: true },
        },
        select: { destinationId: true },
      });
      const targets = new Set(
        subscriptions.map((subscription) => subscription.destinationId),
      );
      if (input.testDestinationId && !targets.has(input.testDestinationId)) {
        throw new TestRouteUnavailable();
      }
      const deliveries = Array.from(targets, (destinationId) => ({
        id: randomUUID(),
        organizationId: input.organizationId,
        eventId,
        destinationId,
      }));
      await tx.delivery.createMany({ data: deliveries });
      await tx.outboxEntry.createMany({
        data: deliveries.map((delivery) => ({
          deliveryId: delivery.id,
          generation: 1,
          availableAt: receivedAt,
          publishAfter: receivedAt,
        })),
      });
      if (input.actorId) {
        await tx.auditLog.create({
          data: {
            organizationId: input.organizationId,
            actorId: input.actorId,
            resourceId: eventId,
            action: "test_delivery",
          },
        });
      }
      return { kind: "accepted", eventId, deliveries: targets.size } as const;
    });
  } catch (error) {
    if (error instanceof TestRouteUnavailable) {
      return { kind: "test_route_unavailable" } as const;
    }
    throw error;
  }
}

class TestRouteUnavailable extends Error {}

async function reserveSignature(
  tx: Prisma.TransactionClient,
  input: EventInput,
  signature: string,
) {
  const key = {
    sourceId: input.sourceId,
    signature: hashPayload(Buffer.from(signature)),
  };
  // A signed timestamp can be future-dated by one window when it first arrives.
  const expiresAt = new Date(
    Date.now() + 2 * settings().WEBHOOK_WINDOW_SECONDS * 1000 + 1000,
  );
  const reserved = await tx.ingressReceipt.createMany({
    skipDuplicates: true,
    data: { ...key, externalId: input.externalId, expiresAt },
  });
  if (reserved.count) {
    return true;
  }
  const previous = await tx.ingressReceipt.findUnique({
    where: { sourceId_signature: key },
  });
  return previous?.externalId === input.externalId;
}
