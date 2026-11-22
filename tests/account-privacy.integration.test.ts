import { randomUUID } from "node:crypto";
import { afterAll, expect, it, onTestFinished, vi } from "vitest";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { POST } from "../apps/web/src/app/api/profile/privacy/route";
import { auth } from "../apps/web/src/server/auth";
import { getAccountDeletionPlan } from "../apps/web/src/server/account-privacy";
import { sendVerificationLink } from "../apps/web/src/server/account-mail";
import { profileEditToken } from "../apps/web/src/server/form-proof";

vi.hoisted(() => {
  vi.stubEnv("RELAYHUB_ACCOUNT_EMAIL", "0");
  vi.stubEnv("TRUST_PROXY", "1");
});
const config = settings();
const databaseUrl = new URL(config.DATABASE_URL);
const localHosts = ["localhost", "127.0.0.1", "postgres"];
if (
  !config.isDemo ||
  !localHosts.includes(databaseUrl.hostname) ||
  databaseUrl.searchParams.has("host")
) {
  throw new Error(
    "Account privacy integration tests require an isolated local demo database.",
  );
}
const db = database();
const users: string[] = [];
const organizations: string[] = [];
const origin = config.RELAYHUB_BASE_URL;
const endpoint = "/api/profile/privacy";

async function signup() {
  const email = "privacy-" + randomUUID() + "@relayhub.example";
  const password = randomUUID();
  const created = await auth().api.signUpEmail({
    body: { email, password, name: "Privacy fixture" },
    asResponse: true,
  });
  expect(created.ok).toBe(true);
  const cookie = sessionCookie(created);
  const session = await auth().api.getSession({
    headers: new Headers({ cookie }),
  });
  if (!session) {
    throw new Error("Missing fixture session");
  }
  users.push(session.user.id);
  return {
    userId: session.user.id,
    email,
    password,
    cookie,
    sessionId: session.session.id,
    csrfToken: profileEditToken(session.session.id).toString("hex"),
  };
}
type Actor = Awaited<ReturnType<typeof signup>>;

function sessionCookie(reply: Response) {
  return reply.headers
    .getSetCookie()
    .map((part) => part.split(";")[0])
    .join("; ");
}

function post(actor: Actor, input: object, requestOrigin = origin) {
  const request = new Request(origin + endpoint, {
    method: "POST",
    headers: {
      cookie: actor.cookie,
      origin: requestOrigin,
      "content-type": "application/json",
      "x-real-ip": "2001:db8::" + actor.userId.slice(0, 4),
    },
    body: JSON.stringify({
      password: actor.password,
      csrfToken: actor.csrfToken,
      ...input,
    }),
  });
  return POST(request);
}
function erase(
  actor: Actor,
  deleteOrganizations: string[] = [],
  successors: { organizationId: string; userId: string }[] = [],
) {
  return post(actor, {
    action: "delete",
    confirm: true,
    deleteOrganizations,
    successors,
  });
}
async function workspace(owner: Actor, member?: Actor) {
  const record = await db.organization.create({
    data: {
      name: "Fixture " + randomUUID(),
      members: { create: { userId: owner.userId, role: "owner" } },
    },
  });
  organizations.push(record.id);
  if (member) {
    await db.organizationMember.create({
      data: {
        organizationId: record.id,
        userId: member.userId,
        role: "viewer",
      },
    });
  }
  return record;
}
afterAll(async () => {
  const group = { organizationId: { in: organizations } };
  await db.webhookEvent.deleteMany({ where: group });
  await db.webhookSource.deleteMany({ where: group });
  await db.webhookDestination.deleteMany({ where: group });
  await db.organization.deleteMany({ where: { id: { in: organizations } } });
  await db.verification.deleteMany({ where: { value: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
  vi.unstubAllEnvs();
});

it("requires the session, origin, CSRF, current password and explicit deletion confirmation", async () => {
  const actor = await signup();
  // Keep all five attempts in one bucket when the suite starts near a minute boundary.
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now());
  onTestFinished(() => clock.mockRestore());
  const input = { action: "export" };
  expect((await post({ ...actor, cookie: "" }, input)).status).toBe(401);
  expect((await post(actor, input, "https://different.example")).status).toBe(
    403,
  );
  expect(
    (await post(actor, { ...input, csrfToken: randomUUID() })).status,
  ).toBe(403);
  expect((await post(actor, { ...input, userId: randomUUID() })).status).toBe(
    422,
  );
  expect((await post(actor, { action: "delete" })).status).toBe(422);
  expect(
    await (await post(actor, { ...input, password: randomUUID() })).json(),
  ).toEqual({ error: "invalid_password" });
  for (let attempt = 1; attempt < 5; attempt++) {
    expect(
      (await post(actor, { ...input, password: randomUUID() })).status,
    ).toBe(403);
  }
  expect((await post(actor, input)).status).toBe(429);
  expect(await db.user.count({ where: { id: actor.userId } })).toBe(1);
});

it("requires a fresh sign-in after enabling MFA and when an MFA session ages", async () => {
  const actor = await signup();
  const enrollment = await auth().api.enableTwoFactor({
    headers: new Headers({ cookie: actor.cookie }),
    body: { password: actor.password },
  });
  if (enrollment.method !== "totp") {
    throw new Error("Fixture requires an authenticator");
  }
  await db.twoFactor.update({
    where: { userId: actor.userId },
    data: { verified: true },
  });
  await db.user.update({
    where: { id: actor.userId },
    data: { twoFactorEnabled: true },
  });
  expect(await (await erase(actor)).json()).toEqual({
    error: "fresh_login_required",
  });
  await db.session.update({
    where: { id: actor.sessionId },
    data: { createdAt: new Date(Date.now() - 11 * 60_000) },
  });
  expect(await (await post(actor, { action: "export" })).json()).toEqual({
    error: "fresh_login_required",
  });
  const challenge = await auth().api.signInEmail({
    body: { email: actor.email, password: actor.password },
    asResponse: true,
  });
  expect(await challenge.json()).toMatchObject({ twoFactorRedirect: true });
  const proof = await auth().api.verifyBackupCode({
    headers: new Headers({ cookie: sessionCookie(challenge) }),
    body: { code: enrollment.backupCodes[0] },
    asResponse: true,
  });
  const cookie = sessionCookie(proof);
  const signedIn = await auth().api.getSession({
    headers: new Headers({ cookie }),
  });
  if (!signedIn) {
    throw new Error("Expected a fresh session after recovery code");
  }
  const fresh = {
    ...actor,
    cookie,
    csrfToken: profileEditToken(signedIn.session.id).toString("hex"),
  };
  expect((await erase(fresh)).status).toBe(200);
  expect(await db.twoFactor.count({ where: { userId: actor.userId } })).toBe(0);
});

it("exports own records and hands over shared workspaces while erasing the sole workspace and all credentials", async () => {
  const actor = await signup();
  const successor = await signup();
  const outsider = await signup();
  const solo = await workspace(actor);
  const shared = await workspace(actor, successor);
  const other = await workspace(outsider, actor);
  const source = await db.webhookSource.create({
    data: {
      organizationId: solo.id,
      name: "Private source",
      secret: randomUUID(),
    },
  });
  const destination = await db.webhookDestination.create({
    data: {
      organizationId: solo.id,
      name: "Private destination",
      url: "https://example.org",
      secret: randomUUID(),
    },
  });
  const payload = "Private fixture " + randomUUID();
  const event = await db.webhookEvent.create({
    data: {
      organizationId: solo.id,
      sourceId: source.id,
      externalId: randomUUID(),
      eventType: "order.created",
      payloadSize: payload.length,
      payloadHash: randomUUID(),
      payload,
      correlationId: randomUUID(),
    },
  });
  const delivery = await db.delivery.create({
    data: {
      organizationId: solo.id,
      eventId: event.id,
      destinationId: destination.id,
    },
  });
  await db.deliveryAttempt.create({
    data: { deliveryId: delivery.id, number: 1 },
  });
  await db.outboxEntry.create({
    data: {
      deliveryId: delivery.id,
      generation: 1,
      availableAt: new Date(),
      publishAfter: new Date(),
    },
  });
  const sharedDest = await db.webhookDestination.create({
    data: {
      organizationId: shared.id,
      name: "Shared dest",
      url: "https://example.org",
      secret: randomUUID(),
    },
  });
  const subscription = await db.destinationEmailSubscription.create({
    data: {
      organizationId: shared.id,
      userId: actor.userId,
      destinationId: sharedDest.id,
      email: actor.email,
      locale: "it",
      messages: {
        create: {
          kind: "outage",
          eventKey: randomUUID(),
          destinationName: "Shared dest",
          occurredAt: new Date(),
        },
      },
    },
  });
  const membershipAudit = await db.auditLog.create({
    data: {
      organizationId: shared.id,
      actorId: actor.userId,
      action: "member_save",
      resourceId: successor.userId,
    },
  });
  const otherAudit = await db.auditLog.create({
    data: {
      organizationId: other.id,
      actorId: outsider.userId,
      action: "member_save",
      resourceId: actor.userId,
    },
  });
  const unrelatedToken = randomUUID();
  await db.verification.createMany({
    data: [
      {
        identifier: "relayhub-mailbox:" + actor.userId,
        value: randomUUID(),
        expiresAt: new Date(),
      },
      { identifier: randomUUID(), value: actor.userId, expiresAt: new Date() },
      {
        identifier: unrelatedToken,
        value: outsider.userId,
        expiresAt: new Date(),
      },
    ],
  });
  const download = await post(actor, { action: "export" });
  expect(download.status).toBe(200);
  expect(download.headers.get("cache-control")).toBe("no-store");
  expect(download.headers.get("content-disposition")).toContain(
    "relayhub-account.json",
  );
  const exported = await download.text();
  expect(JSON.parse(exported)).toMatchObject({
    account: { email: actor.email, memberships: expect.any(Array) },
    activity: expect.any(Array),
  });
  for (const forbidden of [
    actor.password,
    actor.cookie,
    successor.userId,
    successor.email,
    outsider.userId,
    outsider.email,
    payload,
    source.secret,
    sharedDest.secret,
    unrelatedToken,
    '"password"',
    '"token"',
  ]) {
    expect(exported).not.toContain(forbidden);
  }
  expect(JSON.parse(exported).activity).toHaveLength(2);
  const plan = await getAccountDeletionPlan(actor.userId);
  expect(plan).toEqual(
    expect.arrayContaining([
      { id: solo.id, name: solo.name, members: [] },
      {
        id: shared.id,
        name: shared.name,
        members: [{ id: successor.userId, name: "Privacy fixture" }],
      },
    ]),
  );
  expect(plan).toHaveLength(2);
  expect((await erase(actor, [solo.id, shared.id])).status).toBe(409);
  expect(
    (
      await erase(
        actor,
        [solo.id],
        [{ organizationId: shared.id, userId: outsider.userId }],
      )
    ).status,
  ).toBe(409);
  expect(await db.delivery.count({ where: { id: delivery.id } })).toBe(1);
  const erased = await erase(
    actor,
    [solo.id],
    [{ organizationId: shared.id, userId: successor.userId }],
  );
  expect(erased.status).toBe(200);
  expect(erased.headers.getSetCookie()).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/session_token=;.*Max-Age=0/i),
    ]),
  );
  expect((await post(actor, { action: "export" })).status).toBe(401);
  expect(await db.organization.count({ where: { id: solo.id } })).toBe(0);
  expect(
    await db.deliveryAttempt.count({ where: { deliveryId: delivery.id } }),
  ).toBe(0);
  expect(
    await db.outboxEntry.count({ where: { deliveryId: delivery.id } }),
  ).toBe(0);
  expect(
    await db.organizationMember.findFirst({
      where: { organizationId: shared.id, userId: successor.userId },
    }),
  ).toMatchObject({ role: "owner" });
  expect(
    await db.organizationMember.findFirst({
      where: { organizationId: other.id, userId: outsider.userId },
    }),
  ).toMatchObject({ role: "owner" });
  expect(
    await db.organizationMember.count({ where: { userId: actor.userId } }),
  ).toBe(0);
  expect(
    await db.webhookDestination.count({ where: { id: sharedDest.id } }),
  ).toBe(1);
  expect(
    await db.destinationEmailMessage.count({
      where: { subscriptionId: subscription.id },
    }),
  ).toBe(0);
  expect(
    await db.auditLog.findUnique({ where: { id: membershipAudit.id } }),
  ).toMatchObject({ actorId: "deleted-account", resourceId: successor.userId });
  expect(
    await db.auditLog.findUnique({ where: { id: otherAudit.id } }),
  ).toMatchObject({ actorId: outsider.userId, resourceId: "deleted-account" });
  expect(await db.account.count({ where: { userId: actor.userId } })).toBe(0);
  expect(await db.session.count({ where: { userId: actor.userId } })).toBe(0);
  expect(
    await db.verification.count({
      where: {
        OR: [
          { value: actor.userId },
          { identifier: "relayhub-mailbox:" + actor.userId },
        ],
      },
    }),
  ).toBe(0);
  expect(
    await db.verification.count({ where: { identifier: unrelatedToken } }),
  ).toBe(1);
  await sendVerificationLink({
    id: actor.userId,
    email: actor.email,
    emailVerified: false,
  });
  const authentication = await auth().$context;
  await authentication.internalAdapter.createVerificationValue({
    identifier: "reset-password:" + randomUUID(),
    value: actor.userId,
    expiresAt: new Date(),
  });
  expect(
    await db.verification.count({
      where: {
        OR: [
          { value: actor.userId },
          { identifier: "relayhub-mailbox:" + actor.userId },
        ],
      },
    }),
  ).toBe(0);
});

it("keeps an owner if two co-owners try to leave concurrently without confirming workspace deletion", async () => {
  const first = await signup();
  const second = await signup();
  const shared = await workspace(first);
  await db.organizationMember.create({
    data: { organizationId: shared.id, userId: second.userId, role: "owner" },
  });
  const results = await Promise.all([erase(first), erase(second)]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  expect(
    await db.organizationMember.count({
      where: { organizationId: shared.id, role: "owner" },
    }),
  ).toBe(1);
});
