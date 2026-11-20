import { database } from "@relayhub/db";
import { can, type Permission } from "@relayhub/shared/access";
import { auth } from "./auth";
import { HttpError } from "./http";

export async function requireSession(headers: Headers) {
  const session = await auth().api.getSession({ headers });
  if (!session) {
    throw new HttpError(401, "authentication_required");
  }
  return session;
}

export async function requireOrganization(
  headers: Headers,
  organizationId: string,
  permission: Permission,
) {
  const session = await requireSession(headers);
  const membership = await database().organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: session.user.id },
    },
    include: { organization: true },
  });
  if (!membership) {
    throw new HttpError(404, "organization_not_found");
  }
  if (!can(membership.role, permission)) {
    throw new HttpError(403, "permission_denied");
  }
  return { session, membership };
}
