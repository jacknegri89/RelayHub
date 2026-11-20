import { createHash } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { settings } from "@relayhub/shared/config";
import {
  deliverySignatureMatches,
  eventIdentifier,
  eventSchema,
  isJson,
  parseJson,
  validTimestamp,
} from "@relayhub/shared/protocol";
import { log } from "@relayhub/shared/log";
import { ReceiptStore } from "./ReceiptStore";

const config = settings();
const secret = config.DEMO_RECEIVER_SECRET;
if (!config.isDemo || !secret) {
  throw new Error("Mock receiver requires demo mode and a signing secret");
}
const store = new ReceiptStore(
  process.env.RECEIVER_DB_PATH ??
    join(homedir(), ".relayhub", "receiver.sqlite"),
  config.RETENTION_DAYS,
);
const modes = new Set([
  "success",
  "transient",
  "busy",
  "timeout",
  "lost-response",
  "slow",
  "permanent",
]);
const RESPONSE_GRACE_MS = 1500;

async function waitForResponse(response: ServerResponse, milliseconds: number) {
  if (response.destroyed) {
    return false;
  }
  const abort = new AbortController();
  const cancel = () => abort.abort();
  response.once("close", cancel);
  try {
    await delay(milliseconds, undefined, { signal: abort.signal });
  } catch (error) {
    if (!abort.signal.aborted) {
      throw error;
    }
  } finally {
    response.off("close", cancel);
  }
  return !response.destroyed;
}

async function receive(
  request: IncomingMessage,
  response: ServerResponse,
  signingSecret: string,
) {
  if (request.url === "/health" && request.method === "GET") {
    response.writeHead(200).end("demo receiver");
    return;
  }
  const mode = request.url?.split("/")[2] ?? "";
  if (
    request.method !== "POST" ||
    request.url !== "/hooks/" + mode ||
    !modes.has(mode)
  ) {
    response.writeHead(404).end();
    return;
  }
  const id = request.headers["x-relayhub-delivery-id"];
  const eventId = request.headers["x-relayhub-event-id"];
  const timestamp = request.headers["x-relayhub-timestamp"];
  const provided = request.headers["x-relayhub-delivery-signature"];
  if (
    typeof id !== "string" ||
    !z.uuid().safeParse(id).success ||
    typeof eventId !== "string" ||
    !eventIdentifier.safeParse(eventId).success ||
    typeof timestamp !== "string" ||
    !validTimestamp(timestamp, config.WEBHOOK_WINDOW_SECONDS) ||
    typeof provided !== "string" ||
    typeof request.headers["content-type"] !== "string" ||
    !isJson(request.headers["content-type"])
  ) {
    response.writeHead(401).end();
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > config.PAYLOAD_LIMIT_BYTES) {
      response.writeHead(413).end();
      return;
    }
    chunks.push(bytes);
  }
  const body = Buffer.concat(chunks);
  if (
    !deliverySignatureMatches(
      signingSecret,
      timestamp,
      id,
      eventId,
      body,
      provided,
    )
  ) {
    response.writeHead(401).end();
    return;
  }
  let isOrder = false;
  try {
    const event = eventSchema.parse(parseJson(body));
    isOrder =
      event.type === "order.created" ||
      (event.demo === true &&
        typeof event.order === "object" &&
        event.order !== null);
  } catch {
    response.writeHead(422).end();
    return;
  }
  // Hash identity and raw bytes to spot contradictory reuse without storing the event.
  const fingerprint = createHash("sha256")
    .update(eventId)
    .update("\0")
    .update(body)
    .digest("hex");
  if ((mode === "timeout" || mode === "slow") && !store.isAccepted(id)) {
    let waitMs = config.DELIVERY_TIMEOUT_MS + RESPONSE_GRACE_MS;
    if (mode === "slow") {
      waitMs = Math.floor(config.DELIVERY_TIMEOUT_MS / 2);
    }
    if (!(await waitForResponse(response, waitMs))) {
      return;
    }
  }
  const result = store.record({ id, fingerprint, isOrder }, mode);
  if (mode === "lost-response" && result.status === 200 && !result.duplicate) {
    // The order is durable. Even a client which keeps waiting receives no acknowledgement.
    await waitForResponse(
      response,
      config.DELIVERY_TIMEOUT_MS + RESPONSE_GRACE_MS,
    );
    response.destroy();
    return;
  }
  if (result.status === 429) {
    response.setHeader("Retry-After", "2");
  }
  log("info", "demo_receiver_attempt", {
    deliveryId: id,
    status: result.status,
    attempt: result.attempt,
  });
  if (result.duplicate) {
    response.writeHead(200).end("duplicate");
    return;
  }
  response.writeHead(result.status).end();
}

const server = createServer((request, response) => {
  void receive(request, response, secret).catch(() => {
    log("error", "demo_receiver_request_failed");
    response.destroy();
  });
});
server.requestTimeout = 15_000;
let port = 3001;
if (config.DEMO_RECEIVER_URL) {
  const receiverUrl = new URL(config.DEMO_RECEIVER_URL);
  port = Number(receiverUrl.port || "80");
}
server.listen(port, process.env.RECEIVER_BIND ?? "127.0.0.1");
server.on("close", () => store.close());
