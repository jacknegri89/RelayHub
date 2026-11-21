import { randomUUID } from "node:crypto";
import { database, Prisma } from "@relayhub/db";
import { storeEvent } from "@relayhub/db/events";
import { settings } from "@relayhub/shared/config";
import {
  DestinationBlocked,
  destinationUrl,
} from "@relayhub/shared/destinations";
import { encrypt, newSecret } from "@relayhub/shared/encryption";
import { type Permission, type Role, can } from "@relayhub/shared/access";
import type { Command } from "./commands";
import { HttpError } from "./http";
import { retryDelivery, retryRecoveryBatch } from "./recovery-deliveries";

type Scope = { organizationId: string; actorId: string };
type Transaction = Prisma.TransactionClient;

export function permissionFor(command: Command): Permission {
  if (
    command.action.startsWith("member_") ||
    command.action === "organization_rename"
  ) {
    return "manage_members";
  }
  return "configure";
}

export async function manage(
  scope: Scope,
  command: Command,
  correlationId: string,
) {
  if (command.action === "test_delivery") {
    return testDelivery(scope, command, correlationId);
  }
  try {
    return await database().$transaction(async (tx) => {
      const members = await tx.$queryRaw<{ role: Role }[]>`
        SELECT "role" FROM "OrganizationMember"
        WHERE "organizationId" = ${scope.organizationId} AND "userId" = ${scope.actorId} FOR SHARE
      `;
      if (!members[0] || !can(members[0].role, permissionFor(command))) {
        throw new HttpError(403, "permission_denied");
      }
      const result = await applyCommand(tx, scope, command);
      if (
        "queued" in result &&
        Array.isArray(result.queued) &&
        result.queued.length === 0
      ) {
        return result;
      }
      await tx.auditLog.create({
        data: { ...scope, action: command.action, resourceId: result.id },
      });
      return result;
    });
  } catch (error) {
    if (error instanceof DestinationBlocked) {
      throw new HttpError(422, "destination_not_allowed");
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new HttpError(404, "resource_not_found");
    }
    throw error;
  }
}

async function applyCommand(
  tx: Transaction,
  scope: Scope,
  command: Exclude<Command, { action: "test_delivery" }>,
) {
  const { organizationId } = scope;
  switch (command.action) {
    case "source_create": {
      const id = randomUUID();
      const secret = newSecret();
      await tx.webhookSource.create({
        data: {
          id,
          organizationId,
          name: command.name,
          provider: command.provider ?? "relayhub",
          secret: encrypt(Buffer.from(secret), "source:" + id),
        },
      });
      return {
        id,
        secret,
        endpoint: settings().RELAYHUB_BASE_URL + "/api/webhooks/" + id,
      };
    }
    case "source_update":
      await tx.webhookSource.update({
        where: { id: command.id, organizationId },
        data: { name: command.name, enabled: command.enabled },
      });
      return { id: command.id };
    case "source_rotate": {
      const secret = newSecret();
      await tx.webhookSource.update({
        where: { id: command.id, organizationId },
        data: { secret: encrypt(Buffer.from(secret), "source:" + command.id) },
      });
      return { id: command.id, secret };
    }
    case "destination_create":
    case "destination_update":
      return saveDestination(tx, organizationId, command);
    case "route_save":
    case "route_remove":
      return saveRoute(tx, organizationId, command);
    case "delivery_retry":
      return retryDelivery(tx, organizationId, command.id);
    case "delivery_retry_group":
      return retryRecoveryBatch(
        tx,
        { organizationId, destinationId: command.destinationId },
        scope.actorId,
        command.incidentId,
        command.deliveryIds,
      );
    case "member_save":
    case "member_remove":
      return manageMember(tx, organizationId, command);
    case "organization_rename":
      await tx.organization.update({
        where: { id: organizationId },
        data: { name: command.name },
      });
      return { id: organizationId };
  }
}

async function saveDestination(
  tx: Transaction,
  organizationId: string,
  command: Extract<
    Command,
    { action: "destination_create" | "destination_update" }
  >,
) {
  const checked = destinationUrl(command.url);
  let suppliedSecret = command.secret;
  if (checked.isVerificationReceiver) {
    suppliedSecret = settings().VERIFICATION_RECEIVER_SECRET;
  }
  if (checked.isDemo) {
    suppliedSecret = settings().DEMO_RECEIVER_SECRET;
    if (!suppliedSecret) {
      throw new HttpError(422, "demo_receiver_not_configured");
    }
  }
  if (command.action === "destination_create") {
    const id = randomUUID();
    const secret = suppliedSecret ?? newSecret();
    await tx.webhookDestination.create({
      data: {
        id,
        organizationId,
        name: command.name,
        url: checked.url.href,
        secret: encrypt(Buffer.from(secret), "destination:" + id),
      },
    });
    if (!suppliedSecret) {
      return { id, secret };
    }
    return { id };
  }
  const { id, name, enabled } = command;
  await tx.webhookDestination.update({
    where: { id, organizationId },
    data: {
      name,
      enabled,
      url: checked.url.href,
      ...(suppliedSecret && {
        secret: encrypt(Buffer.from(suppliedSecret), "destination:" + id),
      }),
    },
  });
  return { id };
}

async function saveRoute(
  tx: Transaction,
  organizationId: string,
  command: Extract<Command, { action: "route_save" | "route_remove" }>,
) {
  const { sourceId, destinationId, eventType } = command;
  const source = await tx.webhookSource.findUnique({
    where: { id: sourceId, organizationId },
    select: { id: true },
  });
  const destination = await tx.webhookDestination.findUnique({
    where: { id: destinationId, organizationId },
    select: { id: true },
  });
  if (!source || !destination) {
    throw new HttpError(404, "resource_not_found");
  }
  const route = { sourceId, destinationId, eventType };
  if (command.action === "route_remove") {
    await tx.subscription.deleteMany({ where: { ...route, organizationId } });
  } else {
    await tx.subscription.upsert({
      where: { sourceId_destinationId_eventType: route },
      create: { ...route, organizationId },
      update: {},
    });
  }
  return { id: destinationId };
}

async function manageMember(
  tx: Transaction,
  organizationId: string,
  command: Extract<Command, { action: "member_save" | "member_remove" }>,
) {
  if (command.action === "member_remove") {
    const deleted = await tx.organizationMember.deleteMany({
      where: { organizationId, userId: command.id, role: { not: "owner" } },
    });
    if (!deleted.count) {
      throw new HttpError(404, "member_not_found");
    }
    return { id: command.id };
  }
  const user = await tx.user.findUnique({
    where: { id: command.accountId },
    select: { id: true },
  });
  if (!user) {
    throw new HttpError(404, "registered_user_not_found");
  }
  const key = { organizationId, userId: user.id };
  const member = await tx.organizationMember.findUnique({
    where: { organizationId_userId: key },
  });
  if (member?.role === "owner") {
    throw new HttpError(409, "owner_role_is_fixed");
  }
  await tx.organizationMember.upsert({
    where: { organizationId_userId: key },
    create: { ...key, role: command.role },
    update: { role: command.role },
  });
  return { id: user.id };
}

async function testDelivery(
  scope: Scope,
  command: Extract<Command, { action: "test_delivery" }>,
  correlationId: string,
) {
  const { organizationId, actorId } = scope;
  const source = await database().webhookSource.findUnique({
    where: { id: command.sourceId, organizationId },
    select: { secret: true },
  });
  if (!source) {
    throw new HttpError(404, "resource_not_found");
  }
  const externalId = "test-" + randomUUID();
  const result = await storeEvent({
    sourceId: command.sourceId,
    organizationId,
    sourceSecret: source.secret,
    externalId,
    eventType: command.eventType,
    correlationId,
    testDestinationId: command.destinationId,
    body: Buffer.from(
      JSON.stringify({
        type: command.eventType,
        relayHubTest: true,
        id: externalId,
      }),
    ),
    actorId,
  });
  if (result.kind !== "accepted") {
    throw new HttpError(409, result.kind);
  }
  return { id: result.eventId, eventId: result.eventId };
}
