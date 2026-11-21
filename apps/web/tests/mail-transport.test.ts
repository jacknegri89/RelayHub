import { afterEach, expect, it, vi } from "vitest";
import { parseConfig } from "@relayhub/shared/config";
import { sendMail } from "@relayhub/shared/mail";

const environment = {
  RELAYHUB_MODE: "demo",
  RELAYHUB_BASE_URL: "http://127.0.0.1:3000",
  DATABASE_URL: "postgresql://localhost/test",
  REDIS_URL: "redis://localhost",
  BETTER_AUTH_SECRET: "s".repeat(32),
  ACTIVE_KEY_ID: "test",
  ENCRYPTION_KEYS: "test:" + "0".repeat(64),
};
const mail = {
  key: "example/notification",
  to: "member@example.test",
  subject: "RelayHub",
  text: "È online.",
};
const html = "<p>È online.</p>";

afterEach(() => vi.unstubAllGlobals());

it("preserves Resend's text-only request and includes both bodies for an HTML notice", async () => {
  const config = parseConfig({
    ...environment,
    RESEND_API_KEY: "test-key",
    RELAYHUB_EMAIL_FROM: "notices@example.test",
  });
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json({ id: "receipt" }));
  vi.stubGlobal("fetch", transport);
  const richNotice = { ...mail, html, key: "example/rich-notification" };
  await sendMail(mail, config);
  await sendMail(richNotice, config);
  const expected = {
    from: config.RELAYHUB_EMAIL_FROM,
    to: [mail.to],
    subject: mail.subject,
    text: mail.text,
  };
  const [[, textRequest], [url, htmlRequest]] = transport.mock.calls;
  expect(url).toBe("https://api.resend.com/emails");
  expect(JSON.parse(String(textRequest?.body))).toEqual(expected);
  expect(JSON.parse(String(htmlRequest?.body))).toEqual({ ...expected, html });
  expect(new Headers(textRequest?.headers).get("idempotency-key")).toBe(
    mail.key,
  );
  expect(new Headers(htmlRequest?.headers).get("idempotency-key")).toBe(
    richNotice.key,
  );
});

it("sends Mailpit its HTML and Text fields", async () => {
  const config = parseConfig({
    ...environment,
    RELAYHUB_MAILPIT_URL: "http://127.0.0.1:8025",
  });
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ ID: "receipt" }));
  vi.stubGlobal("fetch", transport);
  expect(await sendMail({ ...mail, html }, config)).toEqual({ status: 200 });
  const [[url, request]] = transport.mock.calls;
  expect(url).toBe("http://127.0.0.1:8025/api/v1/send");
  expect(JSON.parse(String(request?.body))).toEqual({
    From: { Email: "relayhub@example.test" },
    To: [{ Email: mail.to }],
    Subject: mail.subject,
    Text: mail.text,
    HTML: html,
  });
});
