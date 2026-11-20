import { z } from "zod";
import { isJson, parseJson, readBody } from "@relayhub/shared/protocol";
import { requireOrganization } from "../../../../../server/authorization";
import {
  assertOrigin,
  handle,
  HttpError,
  response,
} from "../../../../../server/http";
import {
  apiKeyCommand,
  manageApiKey,
} from "../../../../../server/organization-api-keys";
import { throttle } from "../../../../../server/rate";

export function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  return handle(async (correlationId) => {
    assertOrigin(request);
    if (!isJson(request.headers.get("content-type"))) {
      throw new HttpError(415, "unsupported_content_type");
    }
    const { organizationId } = await context.params;
    if (!z.uuid().safeParse(organizationId).success) {
      throw new HttpError(404, "organization_not_found");
    }
    const { session } = await requireOrganization(
      request.headers,
      organizationId,
      "manage_members",
    );
    await throttle("api-key-management:" + session.user.id, 12);
    const bytes = await readBody(request, 1024);
    let body: unknown;
    try {
      body = parseJson(bytes);
    } catch {
      throw new HttpError(422, "invalid_json");
    }
    const command = apiKeyCommand.safeParse(body);
    if (!command.success) {
      throw new HttpError(422, "invalid_configuration");
    }
    const result = await manageApiKey(
      organizationId,
      session.user.id,
      command.data,
    );
    let status = 200;
    if (command.data.action === "create") {
      status = 201;
    }
    return response(status, result, correlationId);
  });
}
