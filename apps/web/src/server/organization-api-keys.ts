import { createHash, randomBytes } from "node:crypto";
import { database } from "@relayhub/db";
import { z } from "zod";
import { clientAddress, HttpError } from "./http";
import { throttle } from "./rate";

export const ACTIVE_API_KEY_LIMIT = 20;
export const apiKeyCommand = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("create"),
    name: z.string().trim().min(1).max(80),
  }),
  z.strictObject({ action: z.literal("revoke"), id: z.uuid() }),
]);

function digest(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function manageApiKey(
  organizationId: string,
  actorId: string,
  command: z.infer<typeof apiKeyCommand>,
) {
  return database().$transaction(async (tx) => {
    // Lock the organization for the key count, and hold the membership check through the write.
    const owners = await tx.$queryRaw<{ id: string }[]>`
      SELECT o.id FROM "Organization" o JOIN "OrganizationMember" m ON m."organizationId"=o.id
      WHERE o.id=${organizationId} AND m."userId"=${actorId} AND m.role='owner'
      FOR UPDATE OF o FOR SHARE OF m`;
    if (!owners.length) {
      throw new HttpError(403, "permission_denied");
    }
    if (command.action === "revoke") {
      const removed = await tx.organizationApiKey.deleteMany({
        where: { organizationId, id: command.id },
      });
      if (!removed.count) {
        throw new HttpError(404, "resource_not_found");
      }
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: "api_key_revoke",
          resourceId: command.id,
        },
      });
      return { id: command.id };
    }
    if (
      (await tx.organizationApiKey.count({ where: { organizationId } })) >=
      ACTIVE_API_KEY_LIMIT
    ) {
      throw new HttpError(409, "api_key_limit");
    }
    const secret = "rh_read_" + randomBytes(32).toString("base64url");
    const key = await tx.organizationApiKey.create({
      data: { organizationId, name: command.name, digest: digest(secret) },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: "api_key_create",
        resourceId: key.id,
      },
    });
    return { id: key.id, secret };
  });
}

export async function requireReadKey(request: Request) {
  // Invalid credentials share an IP bucket. Random guesses cannot allocate a counter per token.
  await throttle("rest:ip:" + clientAddress(request), 600);
  const header = request.headers.get("authorization") ?? "";
  const schemeEnd = header.indexOf(" ");
  const token = header.slice(schemeEnd + 1);
  // Allow the exact RelayHub token format (32 random bytes in unpadded base64url).
  if (
    schemeEnd < 0 ||
    header.slice(0, schemeEnd).toLowerCase() !== "bearer" ||
    !/^rh_read_[A-Za-z0-9_-]{43}$/.test(token)
  ) {
    throw new HttpError(401, "invalid_api_key");
  }
  const key = await database().organizationApiKey.findUnique({
    where: { digest: digest(token) },
    select: { id: true, organizationId: true },
  });
  if (!key) {
    throw new HttpError(401, "invalid_api_key");
  }
  await throttle("rest:key:" + key.id, 120);
  return key.organizationId;
}
