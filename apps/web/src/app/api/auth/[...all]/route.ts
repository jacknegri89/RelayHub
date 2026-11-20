import { createHash } from "node:crypto";
import { z } from "zod";
import { isJson, parseJson, readBody } from "@relayhub/shared/protocol";
import { accountEmailConfigured } from "@relayhub/shared/mail";
import { auth } from "../../../../server/auth";
import {
  assertOrigin,
  clientAddress,
  handle,
  HttpError,
} from "../../../../server/http";
import { throttle } from "../../../../server/rate";
import { validFormProof } from "../../../../server/form-proof";

const credentialPaths = new Set([
  "/api/auth/sign-in/email",
  "/api/auth/sign-up/email",
]);
const signOutPath = "/api/auth/sign-out";
const enablePath = "/api/auth/two-factor/enable";
const disablePath = "/api/auth/two-factor/disable";
const passwordInput = z
  .object({ password: z.string().min(12).max(128) })
  .strict();
const factorInputs = new Map<string, z.ZodType>([
  [enablePath, passwordInput],
  [disablePath, passwordInput],
  [
    "/api/auth/two-factor/verify-totp",
    z
      .object({
        code: z
          .string()
          .trim()
          .regex(/^\d{6}$/),
      })
      .strict(),
  ],
  [
    "/api/auth/two-factor/verify-backup-code",
    z.object({ code: z.string().trim().min(8).max(64) }).strict(),
  ],
]);

export function POST(request: Request) {
  return handle(async () => {
    assertOrigin(request);
    const path = new URL(request.url).pathname;
    const factorInput = factorInputs.get(path);
    if (!credentialPaths.has(path) && !factorInput && path !== signOutPath) {
      throw new HttpError(404, "endpoint_not_found");
    }
    if (!isJson(request.headers.get("content-type"))) {
      throw new HttpError(415, "unsupported_content_type");
    }
    await throttle("auth:" + clientAddress(request), 30);
    const bytes = await readBody(request, 8192);
    let json: unknown;
    try {
      json = parseJson(bytes);
    } catch {
      throw new HttpError(422, "invalid_json");
    }
    let authBody: unknown = json;
    if (factorInput) {
      const factor = factorInput.safeParse(json);
      if (!factor.success) {
        throw new HttpError(422, "invalid_factor");
      }
      await limitFactorAttempt(path, request);
      authBody = factor.data;
    }
    if (credentialPaths.has(path)) {
      const proofData = z
        .object({
          formProof: z.string(),
          website: z.literal("").optional(),
        })
        .passthrough()
        .safeParse(json);
      if (
        !proofData.success ||
        !validFormProof(path, proofData.data.formProof)
      ) {
        throw new HttpError(422, "form_not_ready");
      }
      const {
        formProof: _formProof,
        website: _website,
        ...authFields
      } = proofData.data;
      void _formProof;
      void _website;
      authBody = authFields;
      const credentials = z
        .object({ email: z.email().max(254) })
        .safeParse(authBody);
      if (!credentials.success) {
        throw new HttpError(422, "invalid_credentials");
      }
      const address = createHash("sha256")
        .update(credentials.data.email.trim().toLowerCase())
        .digest("hex");
      await throttle("auth-account:" + address, 8);
      if (path === "/api/auth/sign-up/email") {
        const signup = z
          .object({
            name: z.string().trim().min(1).max(80),
            password: z.string().min(12).max(128),
          })
          .safeParse(authBody);
        if (!signup.success) {
          throw new HttpError(422, "invalid_credentials");
        }
      }
    }
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    const authRequest = new Request(request.url, {
      method: "POST",
      headers,
      body: JSON.stringify(authBody),
    });
    const result = await auth().handler(authRequest);
    if (
      path === "/api/auth/sign-up/email" &&
      accountEmailConfigured() &&
      result.ok
    ) {
      return Response.json(
        { status: true },
        { headers: { "cache-control": "no-store" } },
      );
    }
    result.headers.set("cache-control", "no-store");
    return result;
  });
}

async function limitFactorAttempt(path: string, request: Request) {
  await throttle("auth-factor:" + clientAddress(request), 20);
  if (path !== enablePath && path !== disablePath) {
    return;
  }
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session) {
    throw new HttpError(401, "authentication_required");
  }
  await throttle("auth-factor-management:" + session.user.id, 6);
  if (path === enablePath && session.user.twoFactorEnabled) {
    throw new HttpError(409, "factor_already_enabled");
  }
}
