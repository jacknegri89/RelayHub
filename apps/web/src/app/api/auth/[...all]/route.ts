import { createHash } from "node:crypto";
import { settings } from "@relayhub/shared/config";
import { z } from "zod";
import { isJson, parseJson, readBody } from "@relayhub/shared/protocol";
import { auth } from "../../../../server/auth";
import {
  assertOrigin,
  clientAddress,
  handle,
  HttpError,
} from "../../../../server/http";
import { throttle } from "../../../../server/rate";
import { validFormProof } from "../../../../server/form-proof";

const allowed = new Set([
  "/api/auth/sign-in/email",
  "/api/auth/sign-up/email",
  "/api/auth/sign-out",
]);

export function POST(request: Request) {
  return handle(async () => {
    assertOrigin(request);
    const path = new URL(request.url).pathname;
    if (!allowed.has(path)) {
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
    if (path !== "/api/auth/sign-out") {
      const proofData = z
        .object({ formProof: z.string(), website: z.literal("").optional() })
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
      if (
        path === "/api/auth/sign-up/email" &&
        settings().HOSTED_DEMO_SECRET &&
        !credentials.data.email.toLowerCase().endsWith("@demo.relayhub.example")
      ) {
        throw new HttpError(422, "use_demo_email");
      }
      const address = createHash("sha256")
        .update(credentials.data.email.trim().toLowerCase())
        .digest("hex");
      await throttle("auth-account:" + address, 8);
    }
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    const authRequest = new Request(request.url, {
      method: "POST",
      headers,
      body: JSON.stringify(authBody),
    });
    const result = await auth().handler(authRequest);
    result.headers.set("cache-control", "no-store");
    return result;
  });
}
