import { randomUUID } from "node:crypto";
import { settings } from "@relayhub/shared/config";
import { signature } from "@relayhub/shared/protocol";

export async function submitSigned(
  sourceId: string,
  secret: string,
  externalId: string,
  body: string,
) {
  const { RELAYHUB_BASE_URL } = settings();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bytes = Buffer.from(body);
  return fetch(RELAYHUB_BASE_URL + "/api/webhooks/" + sourceId, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-relayhub-event-id": externalId,
      "x-relayhub-timestamp": timestamp,
      "x-relayhub-signature": signature(secret, timestamp, bytes),
    },
    body,
  });
}

export function sampleEvent(type: string, id: string = randomUUID()) {
  return JSON.stringify({
    type,
    id,
    demo: true,
    order: { reference: "DEMO-100", currency: "EUR" },
  });
}
