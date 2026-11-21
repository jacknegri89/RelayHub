import { createHash, randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { database } from "@relayhub/db";
import { parseConfig, settings } from "@relayhub/shared/config";
import {
  changeDestinationEmail,
  emailPreference,
} from "../apps/web/src/server/destination-email";
import { dispatchDestinationEmail as dispatchQueuedEmail } from "../apps/worker/src/destination-email";
import {
  accountEmailConfigured,
  mailConfigured,
  sendMail,
  type NoticeMail,
} from "@relayhub/shared/mail";

// The test provider below records messages locally. A demo guard protects real subscriptions.
vi.hoisted(() => {
  vi.stubEnv("RELAYHUB_MAILPIT_URL", "");
  vi.stubEnv("RESEND_API_KEY", "integration-only");
  vi.stubEnv("RELAYHUB_EMAIL_FROM", "sender@relayhub.example");
});
if (!settings().isDemo) {
  throw new Error("Destination email tests require an isolated demo database.");
}
const db = database();
const org = randomUUID();
const destination = randomUUID();
const user = randomUUID();
const email = user + "@relayhub.example";
const scope = { organizationId: org, destinationId: destination, userId: user };
// Run a deterministic worker tick after PostgreSQL has rounded its defaults to milliseconds.
function nextTick() {
  return new Date(Date.now() + 100);
}
function dispatchDestinationEmail(
  send?: Parameters<typeof dispatchQueuedEmail>[0],
  now = nextTick(),
) {
  return dispatchQueuedEmail(send, now, org);
}

beforeAll(async () => {
  await db.user.create({ data: { id: user, email, name: "Mailbox test" } });
  await db.organization.create({
    data: {
      id: org,
      name: "Mailbox test",
      members: { create: { userId: user, role: "viewer" } },
      destinations: {
        create: {
          id: destination,
          name: "Billing",
          url: "https://example.test",
          secret: "unused",
        },
      },
    },
  });
});
beforeEach(async () => {
  await db.user.update({
    where: { id: user },
    data: { email, emailVerified: false },
  });
  await db.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: org, userId: user } },
    create: { organizationId: org, userId: user, role: "viewer" },
    update: {},
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await db.destinationEmailSubscription.deleteMany({ where: scope });
  await db.destinationIncident.deleteMany({
    where: { organizationId: org, destinationId: destination },
  });
});
afterAll(async () => {
  try {
    await db.$transaction([
      db.webhookDestination.deleteMany({ where: { organizationId: org } }),
      db.organization.deleteMany({ where: { id: org } }),
      db.user.deleteMany({ where: { id: user } }),
      db.requestCounter.deleteMany({
        where: {
          key: {
            startsWith:
              "mailbox-code:" +
              createHash("sha256").update(email).digest("hex") +
              ":",
          },
        },
      }),
    ]);
  } finally {
    vi.unstubAllEnvs();
    await db.$disconnect();
  }
});

function openIncident() {
  return db.destinationIncident.create({
    data: {
      id: randomUUID(),
      organizationId: org,
      destinationId: destination,
      openedAt: new Date(),
      failureCount: 3,
    },
  });
}

it("confirms mailbox ownership before monitoring, retries the same message and sends recovery in order", async () => {
  const messages: NoticeMail[] = [];
  async function accept(mail: NoticeMail) {
    messages.push(mail);
    return { status: 200 };
  }
  await changeDestinationEmail(scope, { action: "enable" }, "it");
  await changeDestinationEmail(scope, { action: "enable" }, "it");
  const unconfirmed = await openIncident();
  await db.destinationIncident.update({
    where: { id: unconfirmed.id },
    data: { resolvedAt: new Date() },
  });
  expect(await emailPreference(scope)).toBe("pending");
  await dispatchDestinationEmail(accept);
  expect(messages).toHaveLength(1);
  const code = messages[0].text.match(/\b\d{8}\b/)?.[0] ?? "";
  expect(code).toHaveLength(8);
  expect(messages[0].to).toBe(email);
  expect(messages[0].text).not.toContain("Billing");
  const incorrect = String((Number(code[0]) + 1) % 10) + code.slice(1);
  await expect(
    changeDestinationEmail(scope, { action: "confirm", code: incorrect }, "it"),
  ).rejects.toMatchObject({ code: "invalid_mailbox_code" });
  await changeDestinationEmail(scope, { action: "confirm", code }, "it");
  expect(await emailPreference(scope)).toBe("active");
  expect(await dispatchDestinationEmail(accept)).toBe(false);

  const incident = await openIncident();
  const resolvedAt = new Date();
  for (let i = 0; i < 2; i++) {
    await db.destinationIncident.update({
      where: { id: incident.id },
      data: { resolvedAt },
    });
  }
  const claimTime = nextTick();
  const first = vi.fn(async (mail: NoticeMail) => {
    messages.push(mail);
    return { status: 429, retryAfterMs: 40_000 };
  });
  const results = await Promise.all([
    dispatchDestinationEmail(first, claimTime),
    dispatchDestinationEmail(first, claimTime),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(first).toHaveBeenCalledTimes(1);
  expect(
    await dispatchDestinationEmail(
      accept,
      new Date(claimTime.getTime() + 35_000),
    ),
  ).toBe(false);
  const retryAt = new Date(claimTime.getTime() + 45_000);
  await dispatchDestinationEmail(accept, retryAt);
  await dispatchDestinationEmail(accept, retryAt);
  expect(messages[1]).toEqual(messages[2]);
  expect(messages[2].subject).toContain("Guasto");
  expect(messages[3].subject).toContain("ripristinata");
  expect(messages[3].text).toContain(
    "/workspace/" + org + "/destinations/" + destination,
  );
  expect(messages[3].key).not.toBe(messages[2].key);
  expect(await dispatchDestinationEmail(accept, retryAt)).toBe(false);
  await changeDestinationEmail(scope, { action: "disable" }, "it");
  expect(await emailPreference(scope)).toBe("off");
});

it("sends HTML and text through Resend and stops uncertain retries before its deduplication expires", async () => {
  await db.user.update({ where: { id: user }, data: { emailVerified: true } });
  await changeDestinationEmail(scope, { action: "enable" }, "en");
  await openIncident();
  const provider = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error("timeout"))
    .mockResolvedValue(Response.json({ id: randomUUID() }));
  vi.stubGlobal("fetch", provider);
  const now = nextTick();
  await dispatchDestinationEmail(undefined, now);
  await dispatchDestinationEmail(undefined, new Date(now.getTime() + 31_000));
  expect(provider).toHaveBeenCalledTimes(2);
  const [url, request] = provider.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  expect(request?.redirect).toBe("error");
  const headers = new Headers(request?.headers);
  expect(headers.get("idempotency-key")).toMatch(/^relayhub\/.+\/outage\//);
  expect(headers.get("authorization")).toBe("Bearer integration-only");
  const body = JSON.parse(String(request?.body));
  expect(body).toMatchObject({ from: "sender@relayhub.example", to: [email] });
  expect(body.text).toContain("/destinations/" + destination);
  expect(body.html).toContain("/destinations/" + destination);
  expect(provider.mock.calls[1][1]?.body).toBe(request?.body);
  expect(
    new Headers(provider.mock.calls[1][1]?.headers).get("idempotency-key"),
  ).toBe(headers.get("idempotency-key"));
  await db.destinationIncident.updateMany({
    where: { organizationId: org, destinationId: destination },
    data: { resolvedAt: new Date() },
  });
  provider.mockRejectedValue(new Error("uncertain response"));
  const start = nextTick();
  await dispatchDestinationEmail(undefined, start);
  await dispatchDestinationEmail(
    undefined,
    new Date(start.getTime() + 24 * 60 * 60_000),
  );
  expect(provider).toHaveBeenCalledTimes(3);
  expect(await emailPreference(scope)).toBe("activeWithFailure");
});

it("recovers a lost pre-upgrade Resend receipt using the original text-only request", async () => {
  await db.user.update({ where: { id: user }, data: { emailVerified: true } });
  await changeDestinationEmail(scope, { action: "enable" }, "en");
  await openIncident();
  const receipt = randomUUID();
  let accepted: { key: string | null; body: string } | undefined;
  const provider = vi.fn<typeof fetch>(async (_url, request) => {
    const key = new Headers(request?.headers).get("idempotency-key");
    const body = String(request?.body);
    if (!accepted) {
      accepted = { key, body };
      throw new Error("Original response lost after provider acceptance");
    }
    if (key !== accepted.key || body !== accepted.body) {
      return Response.json(
        { name: "invalid_idempotent_request" },
        { status: 409 },
      );
    }
    return Response.json({ id: receipt });
  });
  vi.stubGlobal("fetch", provider);

  // The first worker sent the legacy format. A newer worker picks up the same durable row.
  const legacySend = ({ to, key, subject, text }: NoticeMail) =>
    sendMail({ to, key, subject, text });
  const now = nextTick();
  await dispatchDestinationEmail(legacySend, now);
  const retry = new Date(now.getTime() + 31_000);
  await dispatchDestinationEmail(undefined, retry);
  expect(provider).toHaveBeenCalledTimes(3);
  const requests = provider.mock.calls.map(([, request]) => ({
    key: new Headers(request?.headers).get("idempotency-key"),
    body: JSON.parse(String(request?.body)),
  }));
  const [legacy, withHtml, replay] = requests;
  expect(legacy.key).toMatch(/^relayhub\/.+\/outage\//);
  expect(legacy.body).not.toHaveProperty("html");
  expect(withHtml.key).toBe(legacy.key);
  expect(withHtml.body).toMatchObject({
    ...legacy.body,
    html: expect.any(String),
  });
  expect(replay).toEqual(legacy);
  expect(await emailPreference(scope)).toBe("active");
  expect(await dispatchDestinationEmail(undefined, retry)).toBe(false);
});

it("scopes opt-in to its member, removes work on address change, unsubscribe or removal", async () => {
  await expect(
    changeDestinationEmail(
      { ...scope, organizationId: randomUUID() },
      { action: "enable" },
      "en",
    ),
  ).rejects.toMatchObject({ status: 404 });
  await db.user.update({ where: { id: user }, data: { emailVerified: true } });
  await changeDestinationEmail(scope, { action: "enable" }, "en");
  expect(await emailPreference(scope)).toBe("active");
  const incident = await openIncident();
  await changeDestinationEmail(scope, { action: "disable" }, "en");
  const send = vi.fn().mockResolvedValue({ status: 200 });
  expect(await dispatchDestinationEmail(send)).toBe(false);
  await changeDestinationEmail(scope, { action: "enable" }, "en");
  await db.destinationIncident.update({
    where: { id: incident.id },
    data: { resolvedAt: new Date() },
  });
  await db.user.update({
    where: { id: user },
    data: { email: "new-" + email },
  });
  expect(await emailPreference(scope)).toBe("off");
  expect(await dispatchDestinationEmail(send)).toBe(false);
  await changeDestinationEmail(scope, { action: "enable" }, "en");
  await openIncident();
  await db.organizationMember.delete({
    where: { organizationId_userId: { organizationId: org, userId: user } },
  });
  expect(await dispatchDestinationEmail(send)).toBe(false);
  expect(send).not.toHaveBeenCalled();
});

it("retries a provider failure and a lost receipt with one logical message", async () => {
  await db.user.update({ where: { id: user }, data: { emailVerified: true } });
  await changeDestinationEmail(scope, { action: "enable" }, "en");
  await openIncident();
  const accepted = new Map<string, string>();
  const provider = vi.fn<typeof fetch>();
  provider.mockResolvedValueOnce(new Response(null, { status: 500 }));
  provider.mockImplementation(async (_url, request) => {
    const key = new Headers(request?.headers).get("idempotency-key")!;
    if (!accepted.has(key)) {
      accepted.set(key, randomUUID());
      return new Response("{"); // Provider stored the message before the connection broke.
    }
    return Response.json({ id: accepted.get(key) });
  });
  vi.stubGlobal("fetch", provider);
  const start = nextTick().getTime();
  for (const elapsed of [0, 31_000, 92_000]) {
    expect(
      await dispatchDestinationEmail(undefined, new Date(start + elapsed)),
    ).toBe(true);
  }
  expect(provider).toHaveBeenCalledTimes(3);
  expect(accepted.size).toBe(1);
  expect(
    await dispatchDestinationEmail(undefined, new Date(start + 180_000)),
  ).toBe(false);
  expect(await emailPreference(scope)).toBe("active");
});

it.each([
  [403, "validation_error"],
  [409, "invalid_idempotent_request"],
])(
  "finishes a permanent provider rejection (%s) and releases later alerts",
  async (status, name) => {
    await db.user.update({
      where: { id: user },
      data: { emailVerified: true },
    });
    await changeDestinationEmail(scope, { action: "enable" }, "en");
    const incident = await openIncident();
    const provider = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ name }, { status }))
      .mockResolvedValueOnce(Response.json({ id: randomUUID() }));
    vi.stubGlobal("fetch", provider);
    await dispatchDestinationEmail();
    expect(await emailPreference(scope)).toBe("activeWithFailure");
    await db.destinationIncident.update({
      where: { id: incident.id },
      data: { resolvedAt: new Date() },
    });
    await dispatchDestinationEmail();
    expect(provider).toHaveBeenCalledTimes(2);
    expect(String(provider.mock.calls[1][1]?.body)).toContain(
      "Destination recovered",
    );
    expect(await dispatchDestinationEmail()).toBe(false);
  },
);

it("finishes an ambiguous Gmail send once and lets the recovery email through", async () => {
  await db.user.update({ where: { id: user }, data: { emailVerified: true } });
  await changeDestinationEmail(scope, { action: "enable" }, "en");
  const incident = await openIncident();
  const send = vi
    .fn()
    .mockResolvedValueOnce({ status: 503, uncertain: true })
    .mockResolvedValueOnce({ status: 200 });
  await dispatchDestinationEmail(send);
  expect(await emailPreference(scope)).toBe("activeWithFailure");
  await db.destinationIncident.update({
    where: { id: incident.id },
    data: { resolvedAt: new Date() },
  });
  await dispatchDestinationEmail(send);
  expect(send.mock.calls[1][0].subject).toContain("Destination recovered");
  expect(
    await dispatchDestinationEmail(send, new Date(Date.now() + 60_000)),
  ).toBe(false);
  expect(send).toHaveBeenCalledTimes(2);
});

it("expires a stale outage even when the worker never attempted it", async () => {
  await db.user.update({ where: { id: user }, data: { emailVerified: true } });
  await changeDestinationEmail(scope, { action: "enable" }, "en");
  await openIncident();
  const later = new Date(Date.now() + 24 * 60 * 60_000);
  const send = vi.fn();
  expect(await dispatchDestinationEmail(send, later)).toBe(true);
  expect(send).not.toHaveBeenCalled();
  expect(await emailPreference(scope)).toBe("activeWithFailure");
});

it("reserves Resend's test domain for one operator and rejects unsafe capture configurations", () => {
  const config = parseConfig({
    ...process.env,
    RELAYHUB_EMAIL_FROM: "onboarding@resend.dev",
    RELAYHUB_RESEND_TEST_TO: email,
    RELAYHUB_ACCOUNT_EMAIL: "1",
  });
  expect(mailConfigured(email, config)).toBe(true);
  expect(mailConfigured("other@example.test", config)).toBe(false);
  expect(accountEmailConfigured(config)).toBe(false);
  const partial = parseConfig({
    ...process.env,
    RELAYHUB_EMAIL_FROM: "",
    RELAYHUB_ACCOUNT_EMAIL: "1",
  });
  expect(mailConfigured(email, partial)).toBe(false);
  expect(accountEmailConfigured(partial)).toBe(false);
  expect(
    mailConfigured(email, { ...config, RELAYHUB_RESEND_TEST_TO: "" }),
  ).toBe(false);
  expect(
    accountEmailConfigured({
      ...config,
      RELAYHUB_EMAIL_FROM: "notify@relayhub.example",
    }),
  ).toBe(true);
  for (const url of [
    "https://example.com",
    "http://127.0.0.1:8025/elsewhere",
    "http://u:p@127.0.0.1:8025",
  ]) {
    expect(() =>
      parseConfig({
        ...process.env,
        RESEND_API_KEY: "",
        RELAYHUB_EMAIL_FROM: "",
        RELAYHUB_MAILPIT_URL: url,
      }),
    ).toThrow();
  }
  expect(() =>
    parseConfig({
      ...process.env,
      RELAYHUB_MODE: "production",
      RELAYHUB_BASE_URL: "https://example.test",
      RESEND_API_KEY: "",
      RELAYHUB_EMAIL_FROM: "",
      RELAYHUB_MAILPIT_URL: "http://127.0.0.1:8025",
    }),
  ).toThrow();
});

it.skipIf(!process.env.RELAYHUB_TEST_MAILPIT_URL)(
  "delivers confirmation, outage and recovery into an actual local Mailpit inbox",
  async () => {
    const config = parseConfig({
      ...process.env,
      RESEND_API_KEY: "",
      RELAYHUB_EMAIL_FROM: "",
      RELAYHUB_MAILPIT_URL: process.env.RELAYHUB_TEST_MAILPIT_URL,
    });
    const origin = config.RELAYHUB_MAILPIT_URL;
    const send = (mail: NoticeMail) => sendMail(mail, config);
    async function inbox() {
      const response = await fetch(
        origin +
          "/api/v1/search?" +
          new URLSearchParams({ query: "to:" + email }),
        { redirect: "error" },
      );
      expect(response.ok).toBe(true);
      const result = (await response.json()) as {
        messages: { ID: string; Subject: string }[];
      };
      return result.messages;
    }
    async function readMessage(id: string) {
      const response = await fetch(
        origin + "/api/v1/message/" + encodeURIComponent(id),
        { redirect: "error" },
      );
      expect(response.ok).toBe(true);
      return (await response.json()) as { Text: string; HTML: string };
    }
    await changeDestinationEmail(scope, { action: "enable" }, "en");
    await dispatchDestinationEmail(send);
    const [confirmation] = await inbox();
    expect(confirmation.Subject).toBe("RelayHub email confirmation");
    const confirmationMail = await readMessage(confirmation.ID);
    const code = confirmationMail.Text.match(/\b\d{8}\b/)?.[0] ?? "";
    expect(code).toHaveLength(8);
    // The recipient must see the same code in either MIME part, before disclosing any destination name.
    const htmlText = confirmationMail.HTML.replace(/<[^>]+>/g, "");
    expect(htmlText.includes(code)).toBe(true);
    expect(htmlText.includes("Billing")).toBe(false);
    await changeDestinationEmail(scope, { action: "confirm", code }, "en");
    const incident = await openIncident();
    await db.destinationIncident.update({
      where: { id: incident.id },
      data: { resolvedAt: new Date() },
    });
    await dispatchDestinationEmail(send);
    await dispatchDestinationEmail(send);
    const delivered = await inbox();
    const subjects = delivered.map((message) => message.Subject).sort();
    expect(subjects).toEqual(
      [
        "RelayHub email confirmation",
        "RelayHub · Destination outage · Billing",
        "RelayHub · Destination recovered · Billing",
      ].sort(),
    );
    const destinationUrl =
      config.RELAYHUB_BASE_URL +
      "/workspace/" +
      org +
      "/destinations/" +
      destination;
    for (const message of delivered) {
      if (message.ID === confirmation.ID) {
        continue;
      }
      const incidentMail = await readMessage(message.ID);
      expect(incidentMail.Text).toContain("Billing");
      expect(incidentMail.HTML).toContain("Billing");
      expect(incidentMail.Text).toContain(destinationUrl);
      // Match a quoted HTML link target, including single-quoted attributes.
      const links = Array.from(
        incidentMail.HTML.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi),
        (attribute) => attribute[1],
      );
      expect(links).toContain(destinationUrl);
    }
  },
);
