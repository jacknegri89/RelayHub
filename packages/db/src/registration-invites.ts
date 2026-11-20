import { createHash, randomBytes } from "node:crypto";
import { database } from "./index";

const INVITE_LIFETIME_MS = 48 * 60 * 60 * 1000;

function digestCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export async function issueRegistrationInvite() {
  const code = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_LIFETIME_MS);
  await database().registrationInvite.create({
    data: { digest: digestCode(code), expiresAt },
  });
  return { code, expiresAt };
}

export async function claimRegistrationInvite(code: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) {
    return false;
  }
  const now = new Date();
  const claimed = await database().registrationInvite.updateMany({
    where: { digest: digestCode(code), expiresAt: { gt: now }, usedAt: null },
    data: { usedAt: now },
  });
  return claimed.count === 1;
}
