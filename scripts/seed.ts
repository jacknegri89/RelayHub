import { randomUUID } from "node:crypto";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { encrypt, newSecret } from "@relayhub/shared/encryption";
import { auth } from "../apps/web/src/server/auth";

const config = settings();
const password = process.env.DEMO_USER_PASSWORD;
if (
  !config.isDemo ||
  !config.DEMO_RECEIVER_URL ||
  !config.DEMO_RECEIVER_SECRET ||
  !password ||
  password.length < 12
) {
  throw new Error(
    "Seed requires demo mode, a configured receiver and DEMO_USER_PASSWORD (12+ characters).",
  );
}
const db = database();
const ownerEmail = "demo-owner@relayhub.example";
const organizationId = "8d57fce4-6c34-499a-a930-df5114443f0e";
const sourceId = "ed373340-2825-4f7d-8576-1d44021b238d";
try {
  const owner = await db.user.findUnique({
    where: { email: ownerEmail },
    select: { id: true },
  });
  let ownerId = owner?.id;
  if (!ownerId) {
    const result = await auth().api.signUpEmail({
      body: { name: "Demo Operator", email: ownerEmail, password },
    });
    ownerId = result.user.id;
  }
  await db.$transaction(async (tx) => {
    await tx.organization.upsert({
      where: { id: organizationId },
      create: {
        id: organizationId,
        name: "RelayHub Demo",
        members: { create: { userId: ownerId, role: "owner" } },
      },
      update: {},
    });
    await tx.webhookSource.upsert({
      where: { id: sourceId },
      create: {
        id: sourceId,
        organizationId,
        name: "Demo store",
        secret: encrypt(Buffer.from(newSecret()), "source:" + sourceId),
      },
      update: {},
    });
    for (const mode of [
      "success",
      "transient",
      "busy",
      "timeout",
      "lost-response",
      "slow",
      "permanent",
    ]) {
      const previous = await tx.webhookDestination.findFirst({
        where: { organizationId, name: "Demo " + mode },
        select: { id: true },
      });
      if (previous) {
        continue;
      }
      const id = randomUUID();
      await tx.webhookDestination.create({
        data: {
          id,
          organizationId,
          name: "Demo " + mode,
          url: config.DEMO_RECEIVER_URL + "/hooks/" + mode,
          secret: encrypt(
            Buffer.from(config.DEMO_RECEIVER_SECRET ?? ""),
            "destination:" + id,
          ),
          subscriptions: { create: { sourceId, eventType: "demo." + mode } },
        },
      });
    }
  });
  console.log(
    "Demo fixtures available. Sign in as " +
      ownerEmail +
      " using the supplied seed password.",
  );
} finally {
  await db.$disconnect();
}
