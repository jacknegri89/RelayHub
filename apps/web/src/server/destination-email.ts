import { createHash, timingSafeEqual } from "node:crypto";
import { database, type Prisma } from "@relayhub/db";
import { withinLimit } from "@relayhub/db/rate-limit";
import {
  CONFIRMATION_MINUTES,
  MAX_CONFIRMATION_CHECKS,
  destinationEmailConfigured,
  mailboxCode,
} from "@relayhub/shared/notification-email";
import type { Locale } from "../locale";
import { HttpError } from "./http";

export type EmailScope = {
  organizationId: string;
  destinationId: string;
  userId: string;
};
export type EmailCommand =
  { action: "enable" | "disable" } | { action: "confirm"; code: string };

type Transaction = Prisma.TransactionClient;
type Mailbox = { email: string; emailVerified: boolean };
type Challenge = {
  challengeExpiresAt: Date | null;
  failedChecks: number;
  messages: { id: bigint }[];
};

function awaitingCode(subscription: Challenge, now: Date) {
  return Boolean(
    subscription.challengeExpiresAt &&
    subscription.challengeExpiresAt > now &&
    subscription.failedChecks < MAX_CONFIRMATION_CHECKS &&
    !subscription.messages.length,
  );
}

function readSubscription(tx: Transaction, scope: EmailScope) {
  return tx.destinationEmailSubscription.findFirst({
    where: scope,
    include: {
      messages: {
        where: { kind: "confirmation", failed: true },
        select: { id: true },
        take: 1,
      },
    },
  });
}
type CurrentSubscription = Awaited<ReturnType<typeof readSubscription>>;

export async function emailPreference(scope: EmailScope) {
  const subscription = await database().destinationEmailSubscription.findFirst({
    where: scope,
    select: {
      email: true,
      verifiedAt: true,
      challengeExpiresAt: true,
      failedChecks: true,
      member: { select: { user: { select: { email: true } } } },
      messages: { where: { failed: true }, select: { id: true }, take: 1 },
    },
  });
  if (!subscription || subscription.email !== subscription.member.user.email) {
    return "off";
  }
  if (subscription.verifiedAt) {
    if (subscription.messages.length) {
      return "activeWithFailure";
    }
    return "active";
  }
  if (!awaitingCode(subscription, new Date())) {
    return "expired";
  }
  return "pending";
}

async function confirmMailbox(
  tx: Transaction,
  current: CurrentSubscription,
  email: string,
  code: string,
  now: Date,
) {
  if (
    !current ||
    current.email !== email ||
    !awaitingCode(current, now) ||
    !/^\d{8}$/.test(code)
  ) {
    return "invalid_mailbox_code";
  }
  const expected = mailboxCode(current.id, current.email);
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(code))) {
    await tx.destinationEmailSubscription.update({
      where: { id: current.id },
      data: { failedChecks: { increment: 1 } },
    });
    return "invalid_mailbox_code";
  }
  await tx.destinationEmailSubscription.update({
    where: { id: current.id },
    data: { verifiedAt: now, challengeExpiresAt: null, failedChecks: 0 },
  });
  await tx.destinationEmailMessage.deleteMany({
    where: { subscriptionId: current.id, kind: "confirmation" },
  });
}

async function enableEmails(
  tx: Transaction,
  scope: EmailScope,
  current: CurrentSubscription,
  member: Mailbox,
  locale: Locale,
  now: Date,
) {
  if (
    current?.email === member.email &&
    (current.verifiedAt || awaitingCode(current, now))
  ) {
    return;
  }
  let expires: Date | null = null;
  let verifiedAt: Date | null = now;
  if (!member.emailVerified) {
    const mailbox = createHash("sha256")
      .update(member.email.toLowerCase())
      .digest("hex");
    if (!(await withinLimit("mailbox-code:" + mailbox, 3, 3600, tx))) {
      throw new HttpError(429, "mailbox_rate_limited");
    }
    expires = new Date(now.getTime() + CONFIRMATION_MINUTES * 60_000);
    verifiedAt = null;
  }
  await tx.destinationEmailSubscription.deleteMany({ where: scope });
  const subscription = await tx.destinationEmailSubscription.create({
    data: {
      ...scope,
      email: member.email,
      locale,
      verifiedAt,
      challengeExpiresAt: expires,
    },
  });
  if (expires) {
    await tx.destinationEmailMessage.create({
      data: {
        subscriptionId: subscription.id,
        eventKey: "confirmation",
        kind: "confirmation",
        destinationName: "",
        occurredAt: now,
      },
    });
  }
}

export async function changeDestinationEmail(
  scope: EmailScope,
  command: EmailCommand,
  locale: Locale,
) {
  const db = database();
  const problem = await db.$transaction(async (tx) => {
    // Serialize subscription changes per member; a removed membership cannot be recreated by an in-flight request.
    const [member] = await tx.$queryRaw<
      { email: string; emailVerified: boolean }[]
    >`
      SELECT u.email, u."emailVerified" FROM "OrganizationMember" m JOIN "User" u ON u.id=m."userId"
      JOIN "WebhookDestination" d ON d."organizationId"=m."organizationId" AND d.id=${scope.destinationId}
      WHERE m."organizationId"=${scope.organizationId} AND m."userId"=${scope.userId} FOR UPDATE OF u,m`;
    if (!member) {
      throw new HttpError(404, "resource_not_found");
    }
    if (command.action === "disable") {
      await tx.destinationEmailSubscription.deleteMany({ where: scope });
      return;
    }
    if (!destinationEmailConfigured(member.email)) {
      throw new HttpError(503, "mail_unavailable");
    }
    const current = await readSubscription(tx, scope);
    const now = new Date();
    if (command.action === "confirm") {
      return confirmMailbox(tx, current, member.email, command.code, now);
    }
    await enableEmails(tx, scope, current, member, locale, now);
  });
  if (problem) {
    throw new HttpError(422, problem);
  }
}
