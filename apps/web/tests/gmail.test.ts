import { afterEach, expect, it, vi } from "vitest";
import { parseConfig } from "@relayhub/shared/config";
import {
  accountEmailConfigured,
  mailConfigured,
  sendMail,
} from "@relayhub/shared/mail";

const gmailEnvironment = {
  RELAYHUB_BASE_URL: "https://relayhub.example",
  DATABASE_URL: "postgresql://localhost/test",
  REDIS_URL: "redis://localhost",
  BETTER_AUTH_SECRET: "s".repeat(32),
  ACTIVE_KEY_ID: "test",
  ENCRYPTION_KEYS: "test:" + "0".repeat(64),
  RELAYHUB_MAIL_PROVIDER: "gmail",
  RELAYHUB_EMAIL_FROM: "operator.test@gmail.com",
  GMAIL_CLIENT_ID: "test-client",
  GMAIL_CLIENT_SECRET: "test-client-secret",
  GMAIL_REFRESH_TOKEN: "test-refresh",
  RELAYHUB_ACCOUNT_EMAIL: "1",
};
const config = parseConfig(gmailEnvironment);
const mail = {
  to: "member@example.test",
  subject: "Ripristino · È online",
  text: "Apri il link per scegliere una nuova password.\n\nhttps://relayhub.example/reset-password#test-token",
  key: "recovery/1",
};
const scope = "https://www.googleapis.com/auth/gmail.send";
function tokenResponse(granted = scope) {
  return Response.json({
    token_type: "Bearer",
    access_token: "test-access",
    scope: granted,
  });
}
afterEach(() => vi.unstubAllGlobals());

it("sends account and destination mail from the selected operator to one recipient", async () => {
  expect(accountEmailConfigured(config)).toBe(true);
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(tokenResponse())
    .mockResolvedValueOnce(Response.json({ id: "receipt" }));
  vi.stubGlobal("fetch", transport);
  expect(await sendMail(mail, config)).toEqual({ status: 200 });
  const [[tokenUrl, tokenOptions], [url, options]] = transport.mock.calls;
  expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
  expect((tokenOptions?.body as URLSearchParams).get("refresh_token")).toBe(
    "test-refresh",
  );
  expect((tokenOptions?.body as URLSearchParams).get("scope")).toBe(scope);
  expect(url).toBe(
    "https://gmail.googleapis.com/gmail/v1/users/operator.test%40gmail.com/messages/send",
  );
  expect(options?.redirect).toBe("error");
  const raw = Buffer.from(
    JSON.parse(String(options?.body)).raw,
    "base64url",
  ).toString();
  expect(raw).toContain(
    "From: RelayHub <operator.test@gmail.com>\r\nTo: member@example.test\r\n",
  );
  expect(raw).toContain("Subject: =?UTF-8?Q?Ripristino_=C2=B7_=C3=88_online?=");
  const encodedText = raw.split("\r\n\r\n")[1];
  const decodedText = Buffer.from(encodedText, "base64").toString("utf8");
  expect(decodedText.replaceAll("\r\n", "\n")).toBe(mail.text);
  expect(raw).not.toContain("test-refresh");
});

it("composes Gmail's plain and HTML bodies as ordered MIME alternatives", async () => {
  const html =
    '<p>È il tuo account? <a href="https://relayhub.example/reset-password#test-token">Apri RelayHub</a>.</p>';
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(tokenResponse())
    .mockResolvedValueOnce(Response.json({ id: "receipt" }));
  vi.stubGlobal("fetch", transport);
  expect(await sendMail({ ...mail, html }, config)).toEqual({ status: 200 });
  const request = transport.mock.calls[1][1];
  const raw = Buffer.from(
    JSON.parse(String(request?.body)).raw,
    "base64url",
  ).toString();
  expect(raw).toContain("Content-Type: multipart/alternative;");
  const boundary = raw.match(/boundary="([^"]+)"/)?.[1];
  expect(boundary).toBeTruthy();
  const sections = raw.split("--" + boundary);
  expect(sections).toHaveLength(4);
  const alternatives = sections.slice(1, 3).map((section) => {
    const [headers, body] = section.trim().split("\r\n\r\n");
    expect(headers).toContain("Content-Transfer-Encoding: base64");
    return {
      headers,
      body: Buffer.from(body, "base64").toString().replaceAll("\r\n", "\n"),
    };
  });
  expect(alternatives[0].headers).toContain("Content-Type: text/plain");
  expect(alternatives[0].body).toBe(mail.text);
  expect(alternatives[1].headers).toContain("Content-Type: text/html");
  expect(alternatives[1].body).toBe(html);
});

it("rejects malformed recipients, broader OAuth grants and incomplete Gmail credentials without falling back", async () => {
  const blankToken = parseConfig({
    ...gmailEnvironment,
    GMAIL_REFRESH_TOKEN: "   ",
  });
  expect(accountEmailConfigured(blankToken)).toBe(false);
  expect(
    mailConfigured(mail.to, {
      ...config,
      GMAIL_REFRESH_TOKEN: "",
      RESEND_API_KEY: "other",
    }),
  ).toBe(false);
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(tokenResponse(scope + " https://mail.google.com/"));
  vi.stubGlobal("fetch", transport);
  expect(
    (
      await sendMail(
        { ...mail, to: mail.to + "\r\nBcc:other@example.test" },
        config,
      )
    ).status,
  ).toBe(400);
  expect(transport).not.toHaveBeenCalled();
  expect((await sendMail(mail, config)).status).toBe(403);
  expect(transport).toHaveBeenCalledTimes(1);
});

it("distinguishes a quota rejection from a missing Gmail send receipt", async () => {
  const transport = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", transport);
  transport
    .mockResolvedValueOnce(tokenResponse())
    .mockResolvedValueOnce(
      Response.json(
        { error: { errors: [{ reason: "userRateLimitExceeded" }] } },
        { status: 403, headers: { "retry-after": "60" } },
      ),
    );
  expect(await sendMail(mail, config)).toEqual({
    status: 429,
    retryAfterMs: 60000,
  });
  transport
    .mockResolvedValueOnce(tokenResponse())
    .mockResolvedValueOnce(Response.json({}));
  expect(await sendMail(mail, config)).toEqual({ status: 0, uncertain: true });
  transport
    .mockResolvedValueOnce(tokenResponse())
    .mockRejectedValueOnce(new Error("lost response"));
  expect(await sendMail(mail, config)).toEqual({ status: 0, uncertain: true });
});
