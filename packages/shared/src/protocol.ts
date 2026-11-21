import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Event names are namespaced identifiers such as order.created.
export const eventType = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
export const eventIdentifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
export const eventSchema = z.object({ type: eventType }).passthrough();

export function signature(secret: string, timestamp: string, body: Uint8Array) {
  return (
    "v1=" +
    createHmac("sha256", secret)
      .update(timestamp + ".")
      .update(body)
      .digest("hex")
  );
}

export function signatureMatches(
  secret: string,
  timestamp: string,
  body: Uint8Array,
  provided: string,
) {
  if (!/^v1=[a-f0-9]{64}$/.test(provided)) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(signature(secret, timestamp, body)),
    Buffer.from(provided),
  );
}

export function githubSignatureMatches(
  secret: string,
  body: Uint8Array,
  provided: string,
) {
  // GitHub signs the exact body bytes, including whitespace, without a timestamp.
  if (!/^sha256=[a-f0-9]{64}$/.test(provided)) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(body).digest();
  const supplied = Buffer.from(provided.slice("sha256=".length), "hex");
  return timingSafeEqual(expected, supplied);
}

// Outbound v2 also authenticates the identifiers a receiver uses for deduplication.
export function deliverySignature(
  secret: string,
  timestamp: string,
  deliveryId: string,
  eventId: string,
  body: Uint8Array,
) {
  const digest = createHmac("sha256", secret)
    .update([timestamp, deliveryId, eventId, ""].join("."))
    .update(body)
    .digest("hex");
  return "v2=" + digest;
}

export function deliverySignatureMatches(
  secret: string,
  timestamp: string,
  deliveryId: string,
  eventId: string,
  body: Uint8Array,
  provided: string,
) {
  // The fixed wire form is v2= followed by a lowercase SHA-256 digest.
  if (!/^v2=[a-f0-9]{64}$/.test(provided)) {
    return false;
  }
  const expected = deliverySignature(
    secret,
    timestamp,
    deliveryId,
    eventId,
    body,
  );
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function validTimestamp(
  timestamp: string,
  windowSeconds: number,
  now = Date.now(),
) {
  return (
    /^\d{10}$/.test(timestamp) &&
    Math.abs(Math.floor(now / 1000) - Number(timestamp)) <= windowSeconds
  );
}

export function hashPayload(body: Uint8Array) {
  return createHash("sha256").update(body).digest("hex");
}

export function isJson(contentType: string | null) {
  return contentType?.split(";")[0].trim().toLowerCase() === "application/json";
}

export class PayloadTooLarge extends Error {}

export async function readBody(
  request: Pick<Request, "headers" | "body">,
  limit: number,
): Promise<Buffer> {
  const length = Number(request.headers.get("content-length"));
  if (length > limit) {
    throw new PayloadTooLarge();
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (!reader) {
    return Buffer.alloc(0);
  }
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      total += result.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new PayloadTooLarge();
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export function parseJson(body: Buffer): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
}
