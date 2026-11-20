import { z } from "zod";
import { requireOrganization } from "../../../../../server/authorization";
import { readAlertSummary } from "../../../../../server/destination-monitoring";
import { handle, HttpError, response } from "../../../../../server/http";
import { throttle } from "../../../../../server/rate";

export function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  return handle(async (correlationId) => {
    const { organizationId } = await context.params;
    if (!z.uuid().safeParse(organizationId).success) {
      throw new HttpError(404, "organization_not_found");
    }
    const { session } = await requireOrganization(
      request.headers,
      organizationId,
      "read",
    );
    await throttle("destination-alerts:" + session.user.id, 60);
    return response(200, await readAlertSummary(organizationId), correlationId);
  });
}
