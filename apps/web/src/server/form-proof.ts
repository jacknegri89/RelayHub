import { createHmac, timingSafeEqual } from "node:crypto";
import { settings } from "@relayhub/shared/config";

export const MIN_FORM_TIME_MS = 600;
const MAX_FORM_TIME_MS = 24 * 60 * 60 * 1000;

function sign(action: string, time: string) {
  return createHmac("sha256", settings().BETTER_AUTH_SECRET)
    .update("form:" + action + ":" + time)
    .digest("hex");
}

export function issueFormProof(action: string, now = Date.now()) {
  const time = String(now);
  return time + "." + sign(action, time);
}

export function validFormProof(
  action: string,
  proof: string,
  now = Date.now(),
) {
  const [time, digest] = proof.split(".");
  if (!/^\d{13}\.[a-f0-9]{64}$/.test(proof)) {
    return false;
  }
  const age = now - Number(time);
  return (
    age >= MIN_FORM_TIME_MS &&
    age <= MAX_FORM_TIME_MS &&
    timingSafeEqual(Buffer.from(digest), Buffer.from(sign(action, time)))
  );
}
