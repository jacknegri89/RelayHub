import {
  clientAddress,
  handle,
  HttpError,
  response,
} from "../../../../server/http";
import {
  labEventId,
  readLostResponse,
  runIdentifier,
} from "../../../../server/lost-response";
import { throttle } from "../../../../server/rate";

const READS_PER_MINUTE = 120;

export function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  return handle(async (requestId) => {
    const { runId } = await context.params;
    if (!runIdentifier.safeParse(runId).success) {
      throw new HttpError(404, "run_not_found");
    }
    const externalId = labEventId(request, runId);
    await throttle(
      "lost-response:read:" + clientAddress(request),
      READS_PER_MINUTE,
    );
    const report = await readLostResponse(runId, externalId);
    if (!report) {
      throw new HttpError(404, "run_not_found");
    }
    return response(200, report, requestId);
  });
}
