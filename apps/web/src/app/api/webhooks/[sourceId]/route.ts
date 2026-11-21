import { database } from "@relayhub/db";
import { storeEvent } from "@relayhub/db/events";
import { settings } from "@relayhub/shared/config";
import { decrypt } from "@relayhub/shared/encryption";
import { log } from "@relayhub/shared/log";
import {
  eventIdentifier,
  eventSchema,
  githubSignatureMatches,
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
    if (
      !z.uuid().safeParse(sourceId).success ||
      (!request.headers.has("x-relayhub-signature") &&
        !request.headers.has("x-hub-signature-256"))
    ) {
      throw new HttpError(401, "invalid_signature");
    }
    const source = await database().webhookSource.findUnique({
      where: { id: sourceId },
      select: {
        organizationId: true,
        enabled: true,
        secret: true,
        provider: true,
      },
    });
    if (!source?.enabled) {
      throw new HttpError(401, "invalid_signature");
    }
    const body = await readBody(request, config.PAYLOAD_LIMIT_BYTES);
    const secret = decrypt(source.secret, "source:" + sourceId).toString(
      "utf8",
    );
    let envelope: VerifiedEnvelope;
    if (source.provider === "github") {
      envelope = verifyGitHubEnvelope(request.headers, body, secret);
    } else {
      envelope = verifyRelayHubEnvelope(
        request.headers,
        body,
        secret,
        config.WEBHOOK_WINDOW_SECONDS,
      );
    }
    await throttle("source:" + sourceId, 180);
    const eventType = getEventType(body, envelope.githubEvent);
    if (envelope.githubEvent === "ping") {
      return response(200, { pong: true }, correlationId);
    }
    const result = await storeEvent({
      sourceId,
      organizationId: source.organizationId,
      sourceSecret: source.secret,
      externalId: envelope.externalId,
      eventType,
      ingressSignature: envelope.ingressSignature,
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

type VerifiedEnvelope = {
  externalId: string;
  githubEvent?: string;
  ingressSignature?: string;
};

function verifyGitHubEnvelope(
  headers: Headers,
  body: Buffer,
  secret: string,
): VerifiedEnvelope {
  const provided = headers.get("x-hub-signature-256") ?? "";
  if (!githubSignatureMatches(secret, body, provided)) {
    throw new HttpError(401, "invalid_signature");
  }
  const deliveryId = headers.get("x-github-delivery") ?? "";
  if (!z.guid().safeParse(deliveryId).success) {
    throw new HttpError(422, "invalid_event_id");
  }
  const githubEvent = headers.get("x-github-event") ?? "";
  // Names such as pull_request stay within the 100-character routing limit including "github.".
  if (!/^[a-z][a-z0-9_]{0,92}$/.test(githubEvent)) {
    throw new HttpError(422, "invalid_event_type");
  }
  // Two independent GitHub deliveries may have identical bodies and signatures.
  return { externalId: deliveryId.toLowerCase(), githubEvent };
}

function verifyRelayHubEnvelope(
  headers: Headers,
  body: Buffer,
  secret: string,
  windowSeconds: number,
): VerifiedEnvelope {
  const timestamp = headers.get("x-relayhub-timestamp") ?? "";
  const ingressSignature = headers.get("x-relayhub-signature") ?? "";
  if (
    !validTimestamp(timestamp, windowSeconds) ||
    !signatureMatches(secret, timestamp, body, ingressSignature)
  ) {
    throw new HttpError(401, "invalid_signature");
  }
  const externalId = headers.get("x-relayhub-event-id") ?? "";
  if (!eventIdentifier.safeParse(externalId).success) {
    throw new HttpError(422, "invalid_event_id");
  }
  return { externalId, ingressSignature };
}

function getEventType(body: Buffer, githubEvent?: string) {
  let payload: unknown;
  try {
    payload = parseJson(body);
  } catch {
    throw new HttpError(422, "invalid_json");
  }
  if (githubEvent) {
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload)
    ) {
      throw new HttpError(422, "invalid_json");
    }
    return "github." + githubEvent;
  }
  const event = eventSchema.safeParse(payload);
  if (!event.success) {
    throw new HttpError(422, "invalid_event_type");
  }
  return event.data.type;
}
