import { settings } from "@relayhub/shared/config";
import {
  isJson,
  readBody,
  signatureMatches,
  validTimestamp,
} from "@relayhub/shared/protocol";
import { handle, HttpError } from "../../../../server/http";

export function POST(request: Request) {
  return handle(async () => {
    const config = settings();
    const secret = config.VERIFICATION_RECEIVER_SECRET;
    if (config.isDemo || !secret) {
      throw new HttpError(404, "endpoint_not_found");
    }
    const timestamp = request.headers.get("x-relayhub-timestamp") ?? "";
    const signature = request.headers.get("x-relayhub-signature") ?? "";
    if (
      !isJson(request.headers.get("content-type")) ||
      !validTimestamp(timestamp, config.WEBHOOK_WINDOW_SECONDS) ||
      !/^v1=[a-f0-9]{64}$/.test(signature)
    ) {
      throw new HttpError(401, "invalid_signature");
    }
    const body = await readBody(request, config.PAYLOAD_LIMIT_BYTES);
    if (!signatureMatches(secret, timestamp, body, signature)) {
      throw new HttpError(401, "invalid_signature");
    }
    return new Response(null, {
      status: 204,
      headers: { "cache-control": "no-store" },
    });
  });
}
