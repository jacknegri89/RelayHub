import { createHmac } from "node:crypto";
import { settings } from "./config";

export const LAB_ORGANIZATION_ID = "cf05b6fb-a970-43a6-a7c0-ab3c9b7e2600";
export const LAB_SOURCE_ID = "3462afd8-1df8-4213-9cbb-591cf45c5488";
export const LAB_DESTINATION_ID = "78560a6f-de5d-4566-8ce3-59aa27d20e97";

export function lostResponseReceiverUrl(config = settings()) {
  let origin = config.RELAYHUB_BASE_URL;
  if (config.isDemo && config.DEMO_LOST_RESPONSE_ORIGIN) {
    origin = config.DEMO_LOST_RESPONSE_ORIGIN;
  }
  return origin + "/api/receiver/lost-response";
}

export function lostResponseSigningSecret() {
  return createHmac("sha256", settings().BETTER_AUTH_SECRET)
    .update("relayhub:lost-response:receiver:v1")
    .digest("base64url");
}
