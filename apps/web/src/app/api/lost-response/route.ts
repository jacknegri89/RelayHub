import { z } from "zod";
import { isJson, parseJson, readBody } from "@relayhub/shared/protocol";
import { validFormProof } from "../../../server/form-proof";
import {
  assertOrigin,
  clientAddress,
  handle,
  HttpError,
  response,
} from "../../../server/http";
import {
  labEventId,
  runIdentifier,
  startLostResponse,
} from "../../../server/lost-response";
import { throttle } from "../../../server/rate";

const input = z.strictObject({
  runId: runIdentifier,
  formProof: z.string().max(100),
  website: z.literal(""),
});
const MAX_BODY_BYTES = 1024;
const START_REQUESTS_PER_MINUTE = 8;

export function POST(request: Request) {
  return handle(async (requestId) => {
    assertOrigin(request);
    if (!isJson(request.headers.get("content-type"))) {
      throw new HttpError(415, "unsupported_content_type");
    }
    await throttle(
      "lost-response:start:" + clientAddress(request),
      START_REQUESTS_PER_MINUTE,
    );
    const bytes = await readBody(request, MAX_BODY_BYTES);
    let body: unknown;
    try {
      body = parseJson(bytes);
    } catch {
      throw new HttpError(422, "invalid_json");
    }
    const parsed = input.safeParse(body);
    if (
      !parsed.success ||
      !validFormProof("lost-response", parsed.data.formProof)
    ) {
      throw new HttpError(422, "invalid_test_form");
    }
    const runId = parsed.data.runId;
    const externalId = labEventId(request, runId);
    const report = await startLostResponse(runId, externalId, requestId);
    return response(202, report, requestId);
  });
}
