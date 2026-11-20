import { createHmac } from "node:crypto";
import { settings } from "./config";

export const CONFIRMATION_MINUTES = 30;
export const MAX_CONFIRMATION_CHECKS = 8;

// A random subscription ID changes on renewal; the mailbox code never goes into the queue or logs.
export function mailboxCode(subscriptionId: string, email: string) {
  const digest = createHmac("sha256", settings().BETTER_AUTH_SECRET)
    .update(JSON.stringify(["relayhub.mailbox.v1", subscriptionId, email]))
    .digest();
  return (digest.readUInt32BE() % 100_000_000).toString().padStart(8, "0");
}

export { mailConfigured as destinationEmailConfigured } from "./mail";
