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
import { settings } from "@relayhub/shared/config";
import {
  changeDestinationEmail,
  emailPreference,
} from "../apps/web/src/server/destination-email";
import {
  dispatchDestinationEmail as dispatchQueuedEmail,
  type NoticeMail,
} from "../apps/worker/src/destination-email";

// The test provider below records messages locally. A demo guard protects real subscriptions.
vi.hoisted(() => {
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
function dispatchDestinationEmail(
  send?: Parameters<typeof dispatchQueuedEmail>[0],
  now = new Date(),
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
  const claimTime = new Date();
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

it("calls the fixed provider with plain text and stops uncertain retries before its deduplication expires", async () => {
  await db.user.update({ where: { id: user }, data: { emailVerified: true } });
  await changeDestinationEmail(scope, { action: "enable" }, "en");
  await openIncident();
  const provider = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error("timeout"))
    .mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", provider);
  const now = new Date();
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
  expect(provider.mock.calls[1][1]?.body).toBe(request?.body);
  expect(
    new Headers(provider.mock.calls[1][1]?.headers).get("idempotency-key"),
  ).toBe(headers.get("idempotency-key"));
  await db.destinationIncident.updateMany({
    where: { organizationId: org, destinationId: destination },
    data: { resolvedAt: new Date() },
  });
  provider.mockRejectedValue(new Error("uncertain response"));
  const start = new Date();
  await dispatchDestinationEmail(undefined, start);
  await dispatchDestinationEmail(
    undefined,
    new Date(start.getTime() + 24 * 60 * 60_000),
  );
  expect(provider).toHaveBeenCalledTimes(3);
  expect(await emailPreference(scope)).toBe("activeWithFailure");
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
