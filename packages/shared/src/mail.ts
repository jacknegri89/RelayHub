import { settings } from "./config";
import { sendGmail } from "./gmail";
import { parseJson, readBody } from "./protocol";

const HTTP_TIMEOUT_MS = 5_000;
const RECEIPT_LIMIT_BYTES = 8_192;

export type NoticeMail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  key: string;
};
export type MailResult = {
  status: number;
  retryAfterMs?: number;
  permanentConflict?: boolean;
  uncertain?: boolean;
};

function usesResendTestDomain(config: ReturnType<typeof settings>) {
  const sender = config.RELAYHUB_EMAIL_FROM?.toLowerCase();
  return Boolean(sender?.endsWith("@resend.dev"));
}

export function mailConfigured(recipient?: string, config = settings()) {
  if (config.RELAYHUB_MAILPIT_URL) {
    return true;
  }
  if (config.RELAYHUB_MAIL_PROVIDER === "gmail") {
    return Boolean(
      config.RELAYHUB_EMAIL_FROM?.toLowerCase().endsWith("@gmail.com") &&
      config.GMAIL_CLIENT_ID &&
      config.GMAIL_CLIENT_SECRET &&
      config.GMAIL_REFRESH_TOKEN,
    );
  }
  if (!config.RESEND_API_KEY || !config.RELAYHUB_EMAIL_FROM) {
    return false;
  }
  if (!usesResendTestDomain(config)) {
    return true;
  }
  const allowed = config.RELAYHUB_RESEND_TEST_TO?.toLowerCase();
  return Boolean(
    allowed && (!recipient || recipient.toLowerCase() === allowed),
  );
}

export function accountEmailConfigured(config = settings()) {
  return (
    config.RELAYHUB_ACCOUNT_EMAIL === "1" &&
    mailConfigured(undefined, config) &&
    !usesResendTestDomain(config)
  );
}

async function receipt(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = parseJson(await readBody(response, RECEIPT_LIMIT_BYTES));
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // A truncated acknowledgement leaves acceptance unknown. Never log the body.
  }
  return {};
}

export async function sendMail(
  mail: NoticeMail,
  config = settings(),
): Promise<MailResult> {
  if (!mailConfigured(mail.to, config)) {
    return { status: 403 };
  }
  if (config.RELAYHUB_MAIL_PROVIDER === "gmail") {
    return sendGmail(mail, config);
  }
  const headers = new Headers({ "content-type": "application/json" });
  let url = "https://api.resend.com/emails";
  let body: object;
  let receiptField = "id";
  if (config.RELAYHUB_MAILPIT_URL) {
    url = config.RELAYHUB_MAILPIT_URL + "/api/v1/send";
    receiptField = "ID";
    body = {
      From: { Email: "relayhub@example.test" },
      To: [{ Email: mail.to }],
      Subject: mail.subject,
      Text: mail.text,
      HTML: mail.html,
    };
  } else {
    headers.set("authorization", "Bearer " + config.RESEND_API_KEY);
    headers.set("idempotency-key", mail.key);
    body = {
      from: config.RELAYHUB_EMAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    };
  }
  const response = await fetch(url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    headers,
    body: JSON.stringify(body),
  });
  return readResult(response, receiptField);
}

async function readResult(
  response: Response,
  receiptField: string,
): Promise<MailResult> {
  if (response.ok || response.status === 409) {
    const acknowledgment = await receipt(response);
    if (response.ok) {
      const id = acknowledgment[receiptField];
      if (typeof id !== "string" || !id.trim()) {
        return { status: 0 };
      }
    }
    if (
      response.status === 409 &&
      acknowledgment.name === "invalid_idempotent_request"
    ) {
      return { status: 409, permanentConflict: true };
    }
  } else {
    await response.body?.cancel();
  }
  const after = response.headers.get("retry-after");
  if (after && /^\d+$/.test(after)) {
    return { status: response.status, retryAfterMs: Number(after) * 1000 };
  }
  return { status: response.status };
}
