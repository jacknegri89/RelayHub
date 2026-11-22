import { verifyPassword } from "better-auth/crypto";
import { database, Prisma } from "@relayhub/db";
import { HttpError } from "./http";

type Transaction = Prisma.TransactionClient;
type Identity = { userId: string; sessionId: string };
type Choices = {
  deleteOrganizations: string[];
  successors: { organizationId: string; userId: string }[];
};
const MFA_FRESHNESS_MS = 10 * 60_000;
const TRANSACTION_TIMEOUT_MS = 30_000;
const erasedIdentity = "deleted-account";

export async function getAccountDeletionPlan(
  userId: string,
  tx: Transaction = database(),
) {
  const organizations = await tx.organization.findMany({
    where: {
      members: {
        some: { userId, role: "owner" },
        none: { userId: { not: userId }, role: "owner" },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      members: {
        where: { userId: { not: userId } },
        select: { user: { select: { id: true, name: true } } },
        orderBy: [{ user: { name: "asc" } }, { userId: "asc" }],
      },
    },
  });
  return organizations.map(({ id, name, members }) => ({
    id,
    name,
    members: members.map(({ user }) => user),
  }));
}

async function verifyIdentity(
  tx: Transaction,
  identity: Identity,
  password: string,
) {
  // A concurrent password reset, session revocation or MFA change must finish first or wait for this action.
  const [record] = await tx.$queryRaw<
    {
      password: string | null;
      twoFactorEnabled: boolean;
      createdAt: Date;
      updatedAt: Date;
    }[]
  >`
    SELECT a.password, u."twoFactorEnabled", s."createdAt", u."updatedAt"
    FROM "User" u JOIN "Session" s ON s."userId" = u.id
    JOIN "Account" a ON a."userId" = u.id AND a."providerId" = 'credential'
    WHERE u.id = ${identity.userId} AND s.id = ${identity.sessionId}
      AND s."expiresAt" > CURRENT_TIMESTAMP
    FOR UPDATE OF u FOR SHARE OF a,s`;
  if (!record) {
    throw new HttpError(401, "authentication_required");
  }
  if (
    !record.password ||
    !(await verifyPassword({ hash: record.password, password }))
  ) {
    throw new HttpError(403, "invalid_password");
  }
  // A session created before MFA enrollment also needs a new MFA sign-in.
  if (
    record.twoFactorEnabled &&
    (Date.now() - record.createdAt.getTime() > MFA_FRESHNESS_MS ||
      record.createdAt < record.updatedAt)
  ) {
    throw new HttpError(403, "fresh_login_required");
  }
}

async function exportAccount(tx: Transaction, userId: string) {
  // Select fields explicitly so new credentials or other members' data cannot enter an export.
  const account = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      createdAt: true,
      updatedAt: true,
      twoFactorEnabled: true,
      accounts: {
        select: { providerId: true, createdAt: true, updatedAt: true },
      },
      sessions: {
        select: {
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          ipAddress: true,
          userAgent: true,
        },
      },
      memberships: {
        select: {
          organization: { select: { id: true, name: true } },
          role: true,
          createdAt: true,
          destinationEmailSubscriptions: {
            select: {
              destinationId: true,
              email: true,
              locale: true,
              verifiedAt: true,
              messages: {
                select: {
                  kind: true,
                  occurredAt: true,
                  attempts: true,
                  finishedAt: true,
                  failed: true,
                },
              },
            },
          },
        },
      },
    },
  });
  const audit = await tx.auditLog.findMany({
    where: { OR: [{ actorId: userId }, { resourceId: userId }] },
    orderBy: { createdAt: "asc" },
    select: {
      action: true,
      organizationId: true,
      createdAt: true,
      actorId: true,
      resourceId: true,
    },
  });
  const activity = audit.map(({ actorId, resourceId, ...entry }) => ({
    ...entry,
    performedByMe: actorId === userId,
    concernsMyAccount: resourceId === userId,
  }));
  return { exportedAt: new Date(), account, activity };
}

async function lockMemberships(tx: Transaction, userId: string) {
  // Parent locks fence new memberships. Existing rows also fence role edits and removal during the handover.
  await tx.$queryRaw`
    SELECT o.id FROM "Organization" o JOIN "OrganizationMember" m ON m."organizationId" = o.id
    WHERE m."userId" = ${userId} ORDER BY o.id FOR UPDATE OF o`;
  await tx.$queryRaw`
    SELECT m."userId" FROM "OrganizationMember" m WHERE m."organizationId" IN
      (SELECT "organizationId" FROM "OrganizationMember" WHERE "userId" = ${userId})
    ORDER BY m."organizationId", m."userId" FOR UPDATE OF m`;
}

async function applyOwnershipChoices(
  tx: Transaction,
  userId: string,
  choices: Choices,
) {
  await lockMemberships(tx, userId);
  const plan = await getAccountDeletionPlan(userId, tx);
  const deletions = new Set(choices.deleteOrganizations);
  const transfers = new Map(
    choices.successors.map((choice) => [choice.organizationId, choice.userId]),
  );
  if (
    plan.length !==
    choices.deleteOrganizations.length + choices.successors.length
  ) {
    throw new HttpError(409, "organization_plan_changed");
  }
  for (const organization of plan) {
    if (!organization.members.length && deletions.has(organization.id)) {
      await eraseSoloOrganization(tx, organization.id);
      continue;
    }
    const successor = transfers.get(organization.id);
    if (
      !successor ||
      !organization.members.some((member) => member.id === successor)
    ) {
      throw new HttpError(409, "organization_plan_changed");
    }
    await tx.organizationMember.update({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: successor,
        },
      },
      data: { role: "owner" },
    });
    await tx.auditLog.create({
      data: {
        organizationId: organization.id,
        actorId: erasedIdentity,
        action: "ownership_transfer",
        resourceId: successor,
      },
    });
  }
}

async function eraseSoloOrganization(tx: Transaction, organizationId: string) {
  // Fence incoming events before deleting their deliveries, attempts, outbox rows and receiver records.
  await tx.$queryRaw`SELECT id FROM "WebhookSource" WHERE "organizationId" = ${organizationId} ORDER BY id FOR UPDATE`;
  await tx.webhookEvent.deleteMany({ where: { organizationId } });
  await tx.webhookSource.deleteMany({ where: { organizationId } });
  await tx.webhookDestination.deleteMany({ where: { organizationId } });
  await tx.organization.delete({ where: { id: organizationId } });
}

async function eraseAccount(tx: Transaction, userId: string, choices: Choices) {
  await applyOwnershipChoices(tx, userId, choices);
  await tx.auditLog.updateMany({
    where: { actorId: userId },
    data: { actorId: erasedIdentity },
  });
  await tx.auditLog.updateMany({
    where: { resourceId: userId },
    data: { resourceId: erasedIdentity },
  });
  // Verification tokens have no foreign key. The same mailbox may register a new, unrelated account.
  await tx.verification.deleteMany({
    where: {
      OR: [{ value: userId }, { identifier: "relayhub-mailbox:" + userId }],
    },
  });
  // RequestCounter stores account-scoped keys as <operation>:<uuid>:<time bucket>.
  await tx.requestCounter.deleteMany({
    where: { key: { contains: ":" + userId + ":" } },
  });
  await tx.user.delete({ where: { id: userId } });
  return { status: true };
}

export async function handleAccountPrivacy(
  identity: Identity,
  password: string,
  choices?: Choices,
) {
  try {
    return await database().$transaction(
      async (tx) => {
        await verifyIdentity(tx, identity, password);
        if (choices) {
          return eraseAccount(tx, identity.userId, choices);
        }
        return exportAccount(tx, identity.userId);
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      throw new HttpError(409, "organization_plan_changed");
    }
    throw error;
  }
}
