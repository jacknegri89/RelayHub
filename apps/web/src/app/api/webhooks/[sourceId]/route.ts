import { database } from "@relayhub/db";
import { storeEvent } from "@relayhub/db/events";
import { settings } from "@relayhub/shared/config";
import { decrypt } from "@relayhub/shared/encryption";
import { log } from "@relayhub/shared/log";
import {
  eventIdentifier,
  eventSchema,
  isJson,
  parseJson,
  readBody,
  signatureMatches,
  validTimestamp,
} from "@relayhub/shared/protocol";
import { z } from "zod";
import {
  clientAddress,
  handle,
  HttpError,
  response,
} from "../../../../server/http";
import { throttle } from "../../../../server/rate";

export function POST(
  request: Request,
  context: { params: Promise<{ sourceId: string }> },
) {
  return handle(async (correlationId) => {
    const { sourceId } = await context.params;
    const config = settings();
    await throttle("ingress:" + clientAddress(request), 360);
    if (!isJson(request.headers.get("content-type"))) {
      throw new HttpError(415, "unsupported_content_type");
    }
    const timestamp = request.headers.get("x-relayhub-timestamp") ?? "";
    const externalId = request.headers.get("x-relayhub-event-id") ?? "";
    const ingressSignature = request.headers.get("x-relayhub-signature") ?? "";
    if (
      !z.uuid().safeParse(sourceId).success ||
      !validTimestamp(timestamp, config.WEBHOOK_WINDOW_SECONDS) ||
      !/^v1=[a-f0-9]{64}$/.test(ingressSignature)
    ) {
      throw new HttpError(401, "invalid_signature");
    }
    if (!eventIdentifier.safeParse(externalId).success) {
      throw new HttpError(422, "invalid_event_id");
    }
    const source = await database().webhookSource.findUnique({
      where: { id: sourceId },
      select: { organizationId: true, enabled: true, secret: true },
    });
    if (!source?.enabled) {
      throw new HttpError(401, "invalid_signature");
    }
    const body = await readBody(request, config.PAYLOAD_LIMIT_BYTES);
    const secret = decrypt(source.secret, "source:" + sourceId).toString(
      "utf8",
    );
    if (!signatureMatches(secret, timestamp, body, ingressSignature)) {
      throw new HttpError(401, "invalid_signature");
    }
    await throttle("source:" + sourceId, 180);
    const eventType = getEventType(body);
    const result = await storeEvent({
      sourceId,
      organizationId: source.organizationId,
      sourceSecret: source.secret,
      externalId,
      eventType,
      ingressSignature,
      body,
      correlationId,
    });
    switch (result.kind) {
      case "accepted":
        log("info", "webhook_accepted", {
          correlationId,
          eventId: result.eventId,
        });
        return response(
          202,
          { eventId: result.eventId, deliveries: result.deliveries },
          correlationId,
        );
      case "duplicate":
        return response(
          200,
          { eventId: result.eventId, duplicate: true },
          correlationId,
        );
      case "event_conflict":
      case "signature_replay":
        throw new HttpError(409, result.kind);
      default:
        throw new HttpError(401, "invalid_signature");
    }
  });
}

function getEventType(body: Buffer) {
  let payload: unknown;
  try {
    payload = parseJson(body);
  } catch {
    throw new HttpError(422, "invalid_json");
  }
  const event = eventSchema.safeParse(payload);
  if (!event.success) {
    throw new HttpError(422, "invalid_event_type");
  }
  return event.data.type;
}
