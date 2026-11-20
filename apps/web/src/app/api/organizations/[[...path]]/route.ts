import { z } from "zod";
import { database } from "@relayhub/db";
import { isJson, parseJson, readBody } from "@relayhub/shared/protocol";
import {
  requireOrganization,
  requireSession,
} from "../../../../server/authorization";
import { commandSchema, createOrganization } from "../../../../server/commands";
import {
  assertOrigin,
  handle,
  HttpError,
  response,
} from "../../../../server/http";
import { manage, permissionFor } from "../../../../server/manage";
import { throttle } from "../../../../server/rate";

export function POST(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  return handle(async (correlationId) => {
    assertOrigin(request);
    if (!isJson(request.headers.get("content-type"))) {
      throw new HttpError(415, "unsupported_content_type");
    }
    const session = await requireSession(request.headers);
    await throttle("management:" + session.user.id, 80);
    const bytes = await readBody(request, 8192);
    let body: unknown;
    try {
      body = parseJson(bytes);
    } catch {
      throw new HttpError(422, "invalid_json");
    }
    const { path = [] } = await context.params;
    if (!path.length) {
      const input = createOrganization.safeParse(body);
      if (!input.success) {
        throw new HttpError(422, "invalid_organization");
      }
      const organization = await database().organization.create({
        data: {
          name: input.data.name,
          members: { create: { userId: session.user.id, role: "owner" } },
        },
      });
      return response(201, { id: organization.id }, correlationId);
    }
    if (path.length !== 1 || !z.uuid().safeParse(path[0]).success) {
      throw new HttpError(404, "endpoint_not_found");
    }
    const input = commandSchema.safeParse(body);
    if (!input.success) {
      throw new HttpError(422, "invalid_configuration");
    }
    const organizationId = path[0];
    await requireOrganization(
      request.headers,
      organizationId,
      permissionFor(input.data),
    );
    const result = await manage(
      { organizationId, actorId: session.user.id },
      input.data,
      correlationId,
    );
    return response(200, result, correlationId);
  });
}
