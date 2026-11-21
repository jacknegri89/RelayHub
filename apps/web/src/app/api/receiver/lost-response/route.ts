import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import {
  LAB_DESTINATION_ID,
  LAB_ORGANIZATION_ID,
  LAB_SOURCE_ID,
  lostResponseReceiverUrl,
  lostResponseSigningSecret,
} from "@relayhub/shared/lost-response";
import {
  deliverySignatureMatches,
  eventIdentifier,
  hashPayload,
  isJson,
  readBody,
  validTimestamp,
} from "@relayhub/shared/protocol";
import { handle, HttpError } from "../../../../server/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ORDER_BYTES = 256;
const LATE_ACK_MARGIN_MS = 1000;
const deliveryIdentifier = z.uuid();

async function recordOrder(
  deliveryId: string,
  externalId: string,
  body: Buffer,
) {
  return database().$transaction(async (tx) => {
    const target = await tx.delivery.findUnique({
      where: {
        id: deliveryId,
        organizationId: LAB_ORGANIZATION_ID,
        destinationId: LAB_DESTINATION_ID,
        destination: { url: lostResponseReceiverUrl() },
        event: {
          sourceId: LAB_SOURCE_ID,
          externalId,
          eventType: "order.created",
          payloadHash: hashPayload(body),
        },
      },
      select: { id: true },
    });
    if (!target) {
      throw new HttpError(404, "resource_not_found");
    }
    // The order itself is the deduplication record, including on simultaneous retries.
    const inserted = await tx.lostResponseOrder.createMany({
      data: [{ deliveryId }],
      skipDuplicates: true,
    });
    if (!inserted.count) {
      await tx.lostResponseOrder.update({
        where: { deliveryId },
        data: { receipts: { increment: 1 } },
      });
    }
    return inserted;
  });
}

export function POST(request: Request) {
  return handle(async () => {
    const config = settings();
    if (!isJson(request.headers.get("content-type"))) {
      throw new HttpError(415, "json_required");
    }
    const deliveryId = request.headers.get("x-relayhub-delivery-id") ?? "";
    const externalId = request.headers.get("x-relayhub-event-id") ?? "";
    const timestamp = request.headers.get("x-relayhub-timestamp") ?? "";
    const signature =
      request.headers.get("x-relayhub-delivery-signature") ?? "";
    if (
      !deliveryIdentifier.safeParse(deliveryId).success ||
      !eventIdentifier.safeParse(externalId).success ||
      !validTimestamp(timestamp, config.WEBHOOK_WINDOW_SECONDS) ||
      !signature.startsWith("v2=")
    ) {
      throw new HttpError(401, "invalid_signature");
    }
    const body = await readBody(request, MAX_ORDER_BYTES);
    if (
      !deliverySignatureMatches(
        lostResponseSigningSecret(),
        timestamp,
        deliveryId,
        externalId,
        body,
        signature,
      )
    ) {
      throw new HttpError(401, "invalid_signature");
    }
    const expected = Buffer.from(
      JSON.stringify({ type: "order.created", id: externalId }),
    );
    if (!body.equals(expected)) {
      throw new HttpError(422, "invalid_order");
    }
    const inserted = await recordOrder(deliveryId, externalId, body);
    if (inserted.count === 1) {
      // The transaction has committed. The receiver's late reply continues after the sender disconnects.
      await delay(config.DELIVERY_TIMEOUT_MS + LATE_ACK_MARGIN_MS);
    }
    return new Response(null, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  });
}
