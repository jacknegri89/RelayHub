import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { auth } from "../apps/web/src/server/auth";
import { issueFormProof } from "../apps/web/src/server/form-proof";
import { hashedResetIdentifier } from "../apps/web/src/server/account-mail";
import { POST as accountPost } from "../apps/web/src/app/api/account-email/[action]/route";
import { POST as authPost } from "../apps/web/src/app/api/auth/[...all]/route";

const { background, captureUrl } = vi.hoisted(() => {
  const captureUrl = process.env.RELAYHUB_TEST_MAILPIT_URL;
  vi.stubEnv("RELAYHUB_ACCOUNT_EMAIL", "1");
  vi.stubEnv("RELAYHUB_MAILPIT_URL", captureUrl ?? "http://127.0.0.1:58025");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("RELAYHUB_EMAIL_FROM", "");
  vi.stubEnv("TRUST_PROXY", "1");
  return { captureUrl, background: [] as (() => Promise<void>)[] };
});
vi.mock("../apps/web/src/server/account-mail-task", () => ({
  scheduleAccountMail: (task: () => Promise<void>) => background.push(task),
}));

const config = settings();
if (
  !config.isDemo ||
  !["127.0.0.1", "localhost", "postgres"].includes(
    new URL(config.DATABASE_URL).hostname,
  )
) {
  throw new Error(
    "Account email tests require an isolated local demo database.",
  );
}
const run = randomUUID();
const origin = config.RELAYHUB_BASE_URL;
const password = randomUUID();
const db = database();
const recipients: string[] = [];
const captured: { email: string; subject: string; text: string }[] = [];
const captureIds = new Set<string>();
const nativeFetch = globalThis.fetch;
let requestNumber = 0;

beforeAll(() => {
  if (!captureUrl) {
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) !== config.RELAYHUB_MAILPIT_URL + "/api/v1/send") {
          throw new Error("Unexpected outbound email test request");
        }
        const mail = JSON.parse(String(init?.body));
        captured.unshift({
          email: mail.To[0].Email,
          subject: mail.Subject,
          text: mail.Text,
        });
        return Response.json({ ID: randomUUID() });
      },
    );
  }
});
afterAll(async () => {
  try {
    const users = await db.user.findMany({
      where: { email: { in: recipients } },
      select: { id: true },
    });
    for (const user of users) {
      await db.verification.deleteMany({
        where: {
          OR: [{ value: user.id }, { id: "relayhub-mailbox:" + user.id }],
        },
      });
    }
    await db.user.deleteMany({ where: { email: { in: recipients } } });
    for (const email of recipients) {
      const suffix = createHash("sha256").update(email).digest("hex");
      await db.requestCounter.deleteMany({
        where: {
          OR: ["verify", "reset"].map((action) => ({
            key: { startsWith: "account-email:" + action + ":" + suffix + ":" },
          })),
        },
      });
    }
    if (captureUrl && captureIds.size) {
      await nativeFetch(captureUrl + "/api/v1/messages", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ IDs: [...captureIds] }),
      });
    }
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await db.$disconnect();
  }
});

function address(label: string) {
  const email = label + "-" + run + "@relayhub.example";
  recipients.push(email);
  return email;
}
function proof(path: string) {
  return issueFormProof(path, Date.now() - 1000);
}
function request(
  path: string,
  body: object,
  cookie = "",
  requestOrigin = origin,
) {
  requestNumber++;
  return new Request(origin + path, {
    method: "POST",
    headers: {
      origin: requestOrigin,
      "content-type": "application/json",
      cookie,
      "x-real-ip":
        "2001:db8:" + run.slice(0, 4) + "::" + requestNumber.toString(16),
    },
    body: JSON.stringify(body),
  });
}
function post(action: string, body: object, cookie = "") {
  return accountPost(request("/api/account-email/" + action, body, cookie), {
    params: Promise.resolve({ action }),
  });
}
async function flushMail() {
  for (const task of background.splice(0)) {
    await task();
  }
}
async function signup(email: string) {
  const path = "/api/auth/sign-up/email";
  return authPost(
    request(
      path,
      { email, password, name: "Account mail test", formProof: proof(path) },
      "relayhub_lang=it",
    ),
  );
}
function cookieFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}
async function signin(email: string, currentPassword = password) {
  return auth().api.signInEmail({
    body: { email, password: currentPassword },
    asResponse: true,
  });
}
function forgot(email: string) {
  return post(
    "request-reset",
    { email, formProof: proof("/api/account-email/request-reset") },
    "relayhub_lang=it",
  );
}
async function messages(email: string) {
  if (!captureUrl) {
    return captured.filter((mail) => mail.email === email);
  }
  const response = await nativeFetch(
    captureUrl + "/api/v1/search?query=" + encodeURIComponent("to:" + email),
  );
  const data = (await response.json()) as { messages: { ID: string }[] };
  return Promise.all(
    data.messages.map(async (mail) => {
      captureIds.add(mail.ID);
      const item = await nativeFetch(captureUrl + "/api/v1/message/" + mail.ID);
      const content = (await item.json()) as { Subject: string; Text: string };
      return { subject: content.Subject, text: content.Text };
    }),
  );
}
async function tokenFromInbox(email: string, path: string) {
  const mail = (await messages(email)).find((item) =>
    item.text.includes("/" + path + "#"),
  );
  if (!mail) {
    throw new Error("Missing account email in isolated mailbox");
  }
  const link = mail.text
    .split(/\s+/)
    .find((word) => word.startsWith(origin + "/" + path + "#"));
  if (!link) {
    throw new Error("Missing account link");
  }
  return new URL(link).hash.slice(1);
}

it("binds expiring, replaceable verification to both the mailbox and its signed-in account", async () => {
  const email = address("verification");
  const first = await signup(email);
  expect(first.status).toBe(200);
  expect(first.headers.getSetCookie()).toHaveLength(0);
  expect(await first.json()).toEqual({ status: true });
  expect(await (await signup(email)).json()).toEqual({ status: true });
  await flushMail();
  expect((await messages(email))[0].subject).toContain("Conferma");
  const original = await tokenFromInbox(email, "confirm-email");
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  expect(user.emailVerified).toBe(false);
  const session = cookieFrom(await signin(email));
  const otherEmail = address("other");
  await signup(otherEmail);
  await flushMail();
  const otherSession = cookieFrom(await signin(otherEmail));
  expect((await post("confirm-verification", { token: original })).status).toBe(
    401,
  );
  expect(
    (await post("confirm-verification", { token: original }, otherSession))
      .status,
  ).toBe(400);
  await db.verification.update({
    where: { id: "relayhub-mailbox:" + user.id },
    data: { expiresAt: new Date(0) },
  });
  expect(
    (await post("confirm-verification", { token: original }, session)).status,
  ).toBe(400);
  expect((await post("request-verification", {}, session)).status).toBe(200);
  const replaced = await tokenFromInbox(email, "confirm-email");
  expect((await post("request-verification", {}, session)).status).toBe(200);
  expect((await post("request-verification", {}, session)).status).toBe(429);
  const current = await tokenFromInbox(email, "confirm-email");
  expect(
    (await post("confirm-verification", { token: replaced }, session)).status,
  ).toBe(400);
  const results = await Promise.all([
    post("confirm-verification", { token: current }, session),
    post("confirm-verification", { token: current }, session),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
  expect(
    (await db.user.findUniqueOrThrow({ where: { email } })).emailVerified,
  ).toBe(true);
});

it("keeps unknown and unverified reset requests uniform and enforces origin and public form checks", async () => {
  const legacy = address("legacy");
  await signup(legacy);
  await flushMail();
  const unknown = address("unknown");
  const knownResponse = await forgot(legacy);
  const unknownResponse = await forgot(unknown);
  expect([knownResponse.status, unknownResponse.status]).toEqual([202, 202]);
  expect(await knownResponse.json()).toEqual(await unknownResponse.json());
  await flushMail();
  expect(await messages(unknown)).toHaveLength(0);
  expect(await messages(legacy)).toHaveLength(1);
  expect(
    (await post("request-reset", { email: legacy, formProof: "invalid" }))
      .status,
  ).toBe(422);
  const path = "/api/account-email/request-reset";
  const foreign = request(
    path,
    { email: legacy, formProof: proof(path) },
    "",
    "https://other.example",
  );
  expect(
    (
      await accountPost(foreign, {
        params: Promise.resolve({ action: "request-reset" }),
      })
    ).status,
  ).toBe(403);
});

it("resets once, revokes sessions and outstanding links/challenges, and keeps MFA and recovery codes", async () => {
  const email = address("reset");
  await signup(email);
  await flushMail();
  const session = cookieFrom(await signin(email));
  const secondSession = cookieFrom(await signin(email));
  const token = await tokenFromInbox(email, "confirm-email");
  expect((await post("confirm-verification", { token }, session)).status).toBe(
    200,
  );
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const enabled = await auth().api.enableTwoFactor({
    headers: new Headers({ cookie: session }),
    body: { password },
  });
  // Model a previously confirmed enrollment; the browser suite covers real TOTP enrollment.
  await db.twoFactor.update({
    where: { userId: user.id },
    data: { verified: true },
  });
  await db.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: true },
  });
  const pending = cookieFrom(await signin(email));
  expect((await forgot(email)).status).toBe(202);
  await flushMail();
  const expired = await tokenFromInbox(email, "reset-password");
  await db.verification.updateMany({
    where: {
      value: user.id,
      identifier: hashedResetIdentifier("reset-password:" + expired),
    },
    data: { expiresAt: new Date(0) },
  });
  expect(
    (
      await post("reset-password", {
        token: expired,
        newPassword: randomUUID(),
      })
    ).status,
  ).toBe(400);
  expect((await forgot(email)).status).toBe(202);
  await flushMail();
  const sibling = await tokenFromInbox(email, "reset-password");
  expect((await forgot(email)).status).toBe(202);
  await flushMail();
  const current = await tokenFromInbox(email, "reset-password");
  expect(current === sibling).toBe(false);
  const count = (await messages(email)).length;
  expect((await forgot(email)).status).toBe(202);
  await flushMail();
  expect(await messages(email)).toHaveLength(count);
  expect(
    await db.verification.count({
      where: { value: user.id, identifier: { contains: current } },
    }),
  ).toBe(0);
  const newPassword = randomUUID();
  expect(
    (await post("reset-password", { token: current, newPassword: "short" }))
      .status,
  ).toBe(400);
  expect(
    (await post("reset-password", { token: "a".repeat(24), newPassword }))
      .status,
  ).toBe(400);
  const results = await Promise.all([
    post("reset-password", { token: current, newPassword }),
    post("reset-password", { token: current, newPassword }),
    post("reset-password", { token: sibling, newPassword: password }),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([
    200, 400, 400,
  ]);
  expect(
    (await post("reset-password", { token: sibling, newPassword: password }))
      .status,
  ).toBe(400);
  for (const cookie of [session, secondSession]) {
    expect(
      await auth().api.getSession({ headers: new Headers({ cookie }) }),
    ).toBeNull();
  }
  expect((await signin(email)).status).toBe(401);
  if (enabled.method !== "totp") {
    throw new Error("Expected authenticator enrollment");
  }
  const code = enabled.backupCodes[0];
  const oldChallenge = await auth().api.verifyBackupCode({
    body: { code },
    headers: new Headers({ cookie: pending }),
    asResponse: true,
  });
  expect(oldChallenge.status).toBe(401);
  const challenge = await signin(email, newPassword);
  expect(await challenge.clone().json()).toMatchObject({
    twoFactorRedirect: true,
  });
  const confirmed = await auth().api.verifyBackupCode({
    body: { code },
    headers: new Headers({ cookie: cookieFrom(challenge) }),
    asResponse: true,
  });
  expect(confirmed.status).toBe(200);
});

it("keeps exactly one active reset link across concurrent requests", async () => {
  const email = address("concurrent-reset");
  await signup(email);
  await flushMail();
  const session = cookieFrom(await signin(email));
  const verification = await tokenFromInbox(email, "confirm-email");
  expect(
    (await post("confirm-verification", { token: verification }, session))
      .status,
  ).toBe(200);
  await Promise.all([forgot(email), forgot(email)]);
  await Promise.all(background.splice(0).map((task) => task()));
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  expect(
    await db.verification.count({
      where: { value: user.id, identifier: { startsWith: "relayhub-reset:" } },
    }),
  ).toBe(1);
  const tokens: string[] = [];
  for (const message of await messages(email)) {
    const link = message.text
      .split(/\s+/)
      .find((word) => word.startsWith(origin + "/reset-password#"));
    if (link) {
      tokens.push(new URL(link).hash.slice(1));
    }
  }
  expect(tokens.length).toBe(2);
  const results = await Promise.all(
    tokens.map((token) =>
      post("reset-password", { token, newPassword: randomUUID() }),
    ),
  );
  expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
});
