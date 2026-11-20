import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { settings } from "@relayhub/shared/config";
import { log } from "@relayhub/shared/log";
import { PayloadTooLarge } from "@relayhub/shared/protocol";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export function assertOrigin(request: Request) {
  if (request.headers.get("origin") !== settings().RELAYHUB_BASE_URL) {
    throw new HttpError(403, "origin_denied");
  }
}

export function clientAddress(request: Request) {
  // The deployment proxy must overwrite X-Real-IP and be the sole client of the app.
  if (settings().TRUST_PROXY === "1") {
    const candidate = request.headers.get("x-real-ip") ?? "";
    if (isIP(candidate)) {
      return candidate;
    }
    throw new HttpError(400, "client_address_required");
  }
  return "direct";
}

export function response(status: number, body: object, correlationId: string) {
  const headers: Record<string, string> = {
    "cache-control": "no-store",
    "x-request-id": correlationId,
  };
  if (status === 429) {
    headers["retry-after"] = "60";
  }
  if (status === 413) {
    // An early size rejection can leave request bytes unread on an HTTP/1 socket.
    headers.connection = "close";
  }
  return Response.json(body, { status, headers });
}

export async function handle(
  operation: (correlationId: string) => Promise<Response>,
) {
  const correlationId = randomUUID();
  try {
    return await operation(correlationId);
  } catch (error) {
    if (error instanceof HttpError) {
      return response(error.status, { error: error.code }, correlationId);
    }
    if (error instanceof PayloadTooLarge) {
      return response(413, { error: "payload_too_large" }, correlationId);
    }
    log("error", "request_failed", { correlationId });
    return response(500, { error: "internal_error" }, correlationId);
  }
}
