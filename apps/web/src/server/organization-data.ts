import type { Prisma } from "@relayhub/db";

export async function eraseOrganization(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  // Fence incoming events before deleting their deliveries, attempts, outbox rows and receiver records.
  await tx.$queryRaw`SELECT id FROM "WebhookSource" WHERE "organizationId" = ${organizationId} ORDER BY id FOR UPDATE`;
  await tx.webhookEvent.deleteMany({ where: { organizationId } });
  await tx.webhookSource.deleteMany({ where: { organizationId } });
  await tx.webhookDestination.deleteMany({ where: { organizationId } });
  await tx.organization.delete({ where: { id: organizationId } });
}
