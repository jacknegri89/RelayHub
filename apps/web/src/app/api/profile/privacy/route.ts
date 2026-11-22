import { z } from "zod";
import { isJson, parseJson, readBody } from "@relayhub/shared/protocol";
import { handleAccountPrivacy } from "../../../../server/account-privacy";
import { auth } from "../../../../server/auth";
import { requireSession } from "../../../../server/authorization";
import { validProfileEditToken } from "../../../../server/form-proof";
import {
  assertOrigin,
  clientAddress,
  handle,
  HttpError,
  response,
} from "../../../../server/http";
import { throttle } from "../../../../server/rate";

const credentials = {
  password: z.string().min(1).max(128),
  csrfToken: z.string(),
};
const command = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("export"), ...credentials }),
  z.strictObject({
    action: z.literal("delete"),
    ...credentials,
    confirm: z.literal(true),
    deleteOrganizations: z.array(z.uuid()),
    successors: z.array(
      z.strictObject({ organizationId: z.uuid(), userId: z.uuid() }),
    ),
  }),
]);
const MAX_REQUEST_BYTES = 256 * 1024;

async function accountClosedResponse(requestId: string) {
  const context = await auth().$context;
  const result = response(200, { status: true }, requestId);
  const cookies = [
    ...Object.values(context.authCookies),
    context.createAuthCookie("two_factor"),
    context.createAuthCookie("trust_device"),
  ];
  for (const cookie of cookies) {
    let expired = cookie.name + "=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax";
    if (cookie.attributes.secure) {
      expired += "; Secure";
    }
    result.headers.append("set-cookie", expired);
  }
  return result;
}

export function POST(request: Request) {
  return handle(async (requestId) => {
    assertOrigin(request);
    if (!isJson(request.headers.get("content-type"))) {
      throw new HttpError(415, "unsupported_content_type");
    }
    const session = await requireSession(request.headers);
    const bytes = await readBody(request, MAX_REQUEST_BYTES);
    let body: unknown;
    try {
      body = parseJson(bytes);
    } catch {
      throw new HttpError(422, "invalid_json");
    }
    const parsed = command.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(422, "invalid_privacy_request");
    }
    const input = parsed.data;
    if (!validProfileEditToken(session.session.id, input.csrfToken)) {
      throw new HttpError(403, "profile_form_expired");
    }
    await throttle("privacy-ip:" + clientAddress(request), 30);
    await throttle("privacy-account:" + session.user.id, 5);
    const identity = { userId: session.user.id, sessionId: session.session.id };
    if (input.action === "export") {
      const data = await handleAccountPrivacy(identity, input.password);
      const download = response(200, data, requestId);
      download.headers.set(
        "content-disposition",
        'attachment; filename="relayhub-account.json"',
      );
      return download;
    }
    // Prepare the expired cookies before the irreversible transaction. Returning success needs no second DB call.
    const result = await accountClosedResponse(requestId);
    await handleAccountPrivacy(identity, input.password, input);
    return result;
  });
}
