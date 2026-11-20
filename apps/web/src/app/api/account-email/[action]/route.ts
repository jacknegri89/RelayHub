import { scheduleAccountMail } from "../../../../server/account-mail-task";
import { isAPIError } from "better-auth/api";
import { z } from "zod";
import { database } from "@relayhub/db";
import { accountEmailConfigured } from "@relayhub/shared/mail";
import { isJson, parseJson, readBody } from "@relayhub/shared/protocol";
import {
  allowAccountMail,
  confirmMailbox,
  sendVerificationLink,
} from "../../../../server/account-mail";
import { auth } from "../../../../server/auth";
import { requireSession } from "../../../../server/authorization";
import { validFormProof } from "../../../../server/form-proof";
import {
  assertOrigin,
  clientAddress,
  handle,
  HttpError,
  response,
} from "../../../../server/http";
import { throttle } from "../../../../server/rate";

const resetRequestPath = "/api/account-email/request-reset";
const resetRequest = z.strictObject({
  email: z
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  website: z.literal("").optional(),
  formProof: z.string(),
});
const confirmation = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
const reset = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9]{24}$/),
  newPassword: z.string().min(12).max(128),
});

async function processResetRequest(request: Request, body: unknown) {
  const parsed = resetRequest.safeParse(body);
  if (
    !parsed.success ||
    !validFormProof(resetRequestPath, parsed.data.formProof)
  ) {
    throw new HttpError(422, "form_not_ready");
  }
  const email = parsed.data.email;
  // Count every submitted address before the eligibility lookup, including unknown addresses.
  if (await allowAccountMail("reset", email)) {
    scheduleAccountMail(async () => {
      const eligible = await database().user.findFirst({
        where: { email, emailVerified: true },
        select: { id: true },
      });
      if (eligible) {
        await auth().api.requestPasswordReset({ body: { email }, request });
      }
    });
  }
}

async function completeReset(body: unknown) {
  const input = reset.safeParse(body);
  if (!input.success) {
    throw new HttpError(400, "account_link_invalid");
  }
  try {
    await auth().api.resetPassword({ body: input.data });
  } catch (error) {
    if (isAPIError(error) && error.statusCode < 500) {
      throw new HttpError(400, "account_link_invalid");
    }
    throw error;
  }
}

export function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  return handle(async (requestId) => {
    assertOrigin(request);
    if (!accountEmailConfigured()) {
      throw new HttpError(503, "mail_unavailable");
    }
    if (!isJson(request.headers.get("content-type"))) {
      throw new HttpError(415, "unsupported_content_type");
    }
    const { action } = await context.params;
    await throttle("account-email-ip:" + clientAddress(request), 20);
    let body: unknown;
    const bytes = await readBody(request, 4096);
    try {
      body = parseJson(bytes);
    } catch {
      throw new HttpError(422, "invalid_json");
    }
    if (action === "request-reset") {
      await processResetRequest(request, body);
      return response(202, { status: true }, requestId);
    }
    if (action === "reset-password") {
      await completeReset(body);
      return response(200, { status: true }, requestId);
    }
    const session = await requireSession(request.headers);
    if (
      action === "request-verification" &&
      z.strictObject({}).safeParse(body).success
    ) {
      await sendVerificationLink(session.user, request.headers);
    } else if (action === "confirm-verification") {
      const input = confirmation.safeParse(body);
      if (!input.success) {
        throw new HttpError(400, "account_link_invalid");
      }
      await confirmMailbox(session.user, input.data.token);
    } else {
      throw new HttpError(404, "endpoint_not_found");
    }
    return response(200, { status: true }, requestId);
  });
}
