import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import {
  lostResponseReceiverUrl,
  lostResponseSigningSecret,
} from "@relayhub/shared/lost-response";
import { deliverySignature, hashPayload } from "@relayhub/shared/protocol";
import { POST } from "../apps/web/src/app/api/receiver/lost-response/route";

// The real receiver runs against an isolated organization, including when the suite runs in parallel.
const fixture = vi.hoisted(() => ({
  organization: crypto.randomUUID(),
  source: crypto.randomUUID(),
  destination: crypto.randomUUID(),
}));
vi.mock("@relayhub/shared/lost-response", async (original) => ({
  ...(await original<typeof import("@relayhub/shared/lost-response")>()),
  LAB_ORGANIZATION_ID: fixture.organization,
  LAB_SOURCE_ID: fixture.source,
  LAB_DESTINATION_ID: fixture.destination,
}));

const config = settings();
if (!config.isDemo) {
  throw new Error("Lost-response receiver tests require the demo database.");
}
const db = database();

beforeAll(async () => {
  await db.organization.create({
    data: {
      id: fixture.organization,
      name: "Lost response receiver test",
      sources: {
        create: { id: fixture.source, name: "Test source", secret: "unused" },
      },
      destinations: {
        create: {
          id: fixture.destination,
          name: "Test receiver",
          url: lostResponseReceiverUrl(),
          secret: "unused",
        },
      },
    },
  });
});

afterAll(async () => {
  // Removing the event also removes its delivery and the receiver's order.
  await db.$transaction([
    db.webhookEvent.deleteMany({
      where: { organizationId: fixture.organization },
    }),
    db.webhookDestination.deleteMany({
      where: { organizationId: fixture.organization },
    }),
    db.webhookSource.deleteMany({
      where: { organizationId: fixture.organization },
    }),
    db.organization.deleteMany({ where: { id: fixture.organization } }),
  ]);
  await db.$disconnect();
});

async function createDelivery() {
  const externalId = randomBytes(32).toString("hex"),
    deliveryId = randomUUID();
  const body = JSON.stringify({ type: "order.created", id: externalId });
  await db.webhookEvent.create({
    data: {
      organizationId: fixture.organization,
      sourceId: fixture.source,
      externalId,
      eventType: "order.created",
      payloadHash: hashPayload(Buffer.from(body)),
      payloadSize: Buffer.byteLength(body),
      payload: "unused",
      correlationId: randomUUID(),
      deliveries: {
        create: { id: deliveryId, destinationId: fixture.destination },
      },
    },
  });
  return { externalId, deliveryId, body };
}

function signedRequest(
  order: { deliveryId: string; externalId: string; body: string },
  signal?: AbortSignal,
) {
  const { deliveryId, externalId, body } = order;
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request(lostResponseReceiverUrl(), {
    method: "POST",
    signal,
    body,
    headers: {
      "content-type": "application/json",
      "x-relayhub-delivery-id": deliveryId,
      "x-relayhub-event-id": externalId,
      "x-relayhub-timestamp": timestamp,
      "x-relayhub-delivery-signature": deliverySignature(
        lostResponseSigningSecret(),
        timestamp,
        deliveryId,
        externalId,
        Buffer.from(body),
      ),
    },
  });
}

it("requires a signed order for the stored event and destination", async () => {
  const order = await createDelivery();
  const unsigned = signedRequest(order);
  unsigned.headers.delete("x-relayhub-delivery-signature");
  expect((await POST(unsigned)).status).toBe(401);
  const differentBody = JSON.stringify({
    type: "payment.paid",
    id: order.externalId,
  });
  expect(
    (await POST(signedRequest({ ...order, body: differentBody }))).status,
  ).toBe(422);
  const otherExternalId = randomUUID();
  const otherBody = JSON.stringify({
    type: "order.created",
    id: otherExternalId,
  });
  expect(
    (
      await POST(
        signedRequest({
          ...order,
          externalId: otherExternalId,
          body: otherBody,
        }),
      )
    ).status,
  ).toBe(404);
  expect(
    await db.lostResponseOrder.count({
      where: { deliveryId: order.deliveryId },
    }),
  ).toBe(0);
});

it("commits before the lost acknowledgement and counts two concurrent receipts as one order", async () => {
  const order = await createDelivery();
  const started = Date.now();
  const controllers = [new AbortController(), new AbortController()];
  const responses = controllers.map((controller) =>
    POST(signedRequest(order, controller.signal)),
  );
  const fastAck = await Promise.race(responses);
  expect(fastAck.status).toBe(200);
  for (const controller of controllers) {
    controller.abort();
  }
  const where = { deliveryId: order.deliveryId };
  expect(await db.lostResponseOrder.findUnique({ where })).not.toBeNull();
  const acknowledgements = await Promise.all(responses);
  expect(acknowledgements.map((ack) => ack.status)).toEqual([200, 200]);
  expect(Date.now() - started).toBeGreaterThanOrEqual(
    config.DELIVERY_TIMEOUT_MS,
  );
  expect(await db.lostResponseOrder.count({ where })).toBe(1);
  expect(await db.lostResponseOrder.findUnique({ where })).toMatchObject({
    receipts: 2,
  });
}, 45000);
