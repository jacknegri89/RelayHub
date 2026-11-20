import { database } from "@relayhub/db";
import { issueRegistrationInvite } from "@relayhub/db/registration-invites";

try {
  const { code, expiresAt } = await issueRegistrationInvite();
  process.stdout.write(JSON.stringify({ code, expiresAt }) + "\n");
} finally {
  await database().$disconnect();
}
