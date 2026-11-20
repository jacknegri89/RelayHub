import { z } from "zod";
import { isJson, parseJson, readBody } from "@relayhub/shared/protocol";
import { requireOrganization } from "../../../../../../../server/authorization";
import { changeDestinationEmail } from "../../../../../../../server/destination-email";
import {
  assertOrigin,
  handle,
  HttpError,
  response,
} from "../../../../../../../server/http";
import { getLocale } from "../../../../../../../server/locale";
import { throttle } from "../../../../../../../server/rate";

const paramsSchema = z.object({
  organizationId: z.uuid(),
  destinationId: z.uuid(),
});
const commandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("enable") }),
  z.strictObject({ action: z.literal("disable") }),
  z.strictObject({
    action: z.literal("confirm"),
    code: z.string().regex(/^\d{8}$/),
  }),
]);

export function POST(
  request: Request,
  context: {
    params: Promise<{ organizationId: string; destinationId: string }>;
  },
) {
  return handle(async (correlationId) => {
    assertOrigin(request);
    if (!isJson(request.headers.get("content-type"))) {
      throw new HttpError(415, "unsupported_content_type");
    }
    const scope = paramsSchema.safeParse(await context.params);
    if (!scope.success) {
      throw new HttpError(404, "resource_not_found");
    }
    const { session } = await requireOrganization(
      request.headers,
      scope.data.organizationId,
      "read",
    );
    await throttle("destination-email:" + session.user.id, 12);
    const bytes = await readBody(request, 1024);
    let body: unknown;
    try {
      body = parseJson(bytes);
    } catch {
      throw new HttpError(422, "invalid_configuration");
    }
    const command = commandSchema.safeParse(body);
    if (!command.success) {
      throw new HttpError(422, "invalid_configuration");
    }
    const { locale } = await getLocale();
    await changeDestinationEmail(
      { ...scope.data, userId: session.user.id },
      command.data,
      locale,
    );
    return response(200, {}, correlationId);
  });
}
