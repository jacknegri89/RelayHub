import { createHash } from "node:crypto";
import { createTransport } from "nodemailer";
import { z } from "zod";
import type { settings } from "./config";
import type { MailResult, NoticeMail } from "./mail";
import { parseJson, readBody } from "./protocol";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const TIMEOUT_MS = 5_000;
const RESPONSE_BYTES = 16_384;
const mailbox = z.email();
const receipt = z.object({ id: z.string().min(1) });
const tokens = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  scope: z.string().optional(),
});
const rejection = z.object({
  error: z.object({ errors: z.array(z.object({ reason: z.string() })) }),
});
type Config = ReturnType<typeof settings>;

// Gmail accepts a complete MIME message. Nodemailer composes it in memory.
const composer = createTransport({
  streamTransport: true,
  buffer: true,
  newline: "windows",
  disableFileAccess: true,
  disableUrlAccess: true,
});

async function rawMessage(mail: NoticeMail, from: string) {
  const messageId = createHash("sha256").update(mail.key).digest("hex");
  const composed = await composer.sendMail({
    from: { name: "RelayHub", address: from },
    to: { name: "", address: mail.to },
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    encoding: "base64",
    messageId: "<" + messageId + "@relayhub.invalid>",
  });
  return composed.message.toString("base64url");
}

async function jsonBody(response: Response) {
  try {
    return parseJson(await readBody(response, RESPONSE_BYTES));
  } catch {
    return null;
  }
}

async function refresh(config: Config) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: new URLSearchParams({
      client_id: config.GMAIL_CLIENT_ID!,
      client_secret: config.GMAIL_CLIENT_SECRET!,
      refresh_token: config.GMAIL_REFRESH_TOKEN!,
      grant_type: "refresh_token",
      scope: SEND_SCOPE,
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return { status: response.status };
  }
  const result = tokens.safeParse(await jsonBody(response));
  if (!result.success) {
    return { status: 503 };
  }
  if (result.data.scope && result.data.scope !== SEND_SCOPE) {
    return { status: 403 };
  }
  return { status: 200, token: result.data.access_token };
}

export async function sendGmail(
  mail: NoticeMail,
  config: Config,
): Promise<MailResult> {
  const from = config.RELAYHUB_EMAIL_FROM;
  if (!from || !mailbox.safeParse(mail.to).success || /[\r\n]/.test(mail.to)) {
    return { status: 400 };
  }
  const auth = await refresh(config);
  if (!auth.token) {
    return { status: auth.status };
  }
  // Bind the request to the configured mailbox. A token for another user must not send.
  const url =
    "https://gmail.googleapis.com/gmail/v1/users/" +
    encodeURIComponent(from) +
    "/messages/send";
  const raw = await rawMessage(mail, from);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        authorization: "Bearer " + auth.token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
  } catch {
    // Gmail has no send idempotency key. A lost acknowledgement may mean it already sent.
    return { status: 0, uncertain: true };
  }
  const body = await jsonBody(response);
  if (response.ok) {
    if (receipt.safeParse(body).success) {
      return { status: response.status };
    }
    return { status: 0, uncertain: true };
  }
  const error = rejection.safeParse(body);
  const rateLimited = error.data?.error.errors.some(({ reason }) =>
    [
      "rateLimitExceeded",
      "userRateLimitExceeded",
      "dailyLimitExceeded",
    ].includes(reason),
  );
  if (response.status === 429 || (response.status === 403 && rateLimited)) {
    const after = response.headers.get("retry-after");
    if (after && /^\d+$/.test(after)) {
      return { status: 429, retryAfterMs: Number(after) * 1000 };
    }
    return { status: 429 };
  }
  if (response.status >= 500 || response.status === 408) {
    return { status: response.status, uncertain: true };
  }
  return { status: response.status };
}
