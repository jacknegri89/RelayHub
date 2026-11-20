import { settings } from "@relayhub/shared/config";
import {
  isJson,
  readBody,
  signatureMatches,
  validTimestamp,
} from "@relayhub/shared/protocol";
import { handle, HttpError } from "../../../../../server/http";

export function POST(
  request: Request,
  { params }: { params: Promise<{ scenario: string }> },
) {
  return handle(async () => {
    const config = settings();
    const { scenario } = await params;
    const secret = config.HOSTED_DEMO_SECRET;
    if (!secret || config.isDemo || !["success", "retry"].includes(scenario)) {
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
    if (scenario === "retry") {
      return new Response(null, {
        status: 503,
        headers: { "retry-after": "10", "cache-control": "no-store" },
      });
    }
    // The hosted receiver has no business side effects or payload storage.
    return new Response(null, {
      status: 204,
      headers: { "cache-control": "no-store" },
    });
  });
}
