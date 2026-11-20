import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { settings } from "@relayhub/shared/config";
import {
  isJson,
  signatureMatches,
  validTimestamp,
} from "@relayhub/shared/protocol";
import { log } from "@relayhub/shared/log";

const config = settings();
const secret = config.DEMO_RECEIVER_SECRET;
if (!config.isDemo || !secret) {
  throw new Error("Mock receiver requires demo mode and a signing secret");
}

const modes = new Set([
  "success",
  "transient",
  "busy",
  "timeout",
  "slow",
  "permanent",
]);
const receipts = new Map<string, { count: number; accepted: boolean }>();
const MAX_TRACKED = 10_000;

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
  const timestamp = request.headers["x-relayhub-timestamp"];
  const provided = request.headers["x-relayhub-signature"];
  if (
    typeof id !== "string" ||
    !z.uuid().safeParse(id).success ||
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
  if (
    !signatureMatches(signingSecret, timestamp, Buffer.concat(chunks), provided)
  ) {
    response.writeHead(401).end();
    return;
  }
  await answer(id, mode, response);
}

async function answer(id: string, mode: string, response: ServerResponse) {
  const receipt = receipts.get(id) ?? { count: 0, accepted: false };
  if (receipt.accepted) {
    response.writeHead(200).end("duplicate");
    return;
  }
  if (!receipts.has(id) && receipts.size >= MAX_TRACKED) {
    response.writeHead(503).end();
    return;
  }
  receipt.count += 1;
  receipts.set(id, receipt);
  let status = 200;
  if (mode === "transient" && receipt.count <= 2) {
    status = 500;
  } else if (mode === "busy" && receipt.count === 1) {
    status = 429;
    response.setHeader("Retry-After", "2");
  } else if (mode === "permanent") {
    status = 400;
  } else if (mode === "timeout") {
    await delay(config.DELIVERY_TIMEOUT_MS + 1500);
  } else if (mode === "slow") {
    await delay(Math.floor(config.DELIVERY_TIMEOUT_MS / 2));
  }
  if (response.destroyed) {
    return;
  }
  if (status === 200) {
    receipt.accepted = true;
  }
  log("info", "demo_receiver_attempt", {
    deliveryId: id,
    status,
    attempt: receipt.count,
  });
  response.writeHead(status).end();
}

const server = createServer((request, response) => {
  void receive(request, response, secret).catch(() => {
    log("error", "demo_receiver_request_failed");
    response.destroy();
  });
});
server.requestTimeout = 15_000;
server.listen(3001, process.env.RECEIVER_BIND ?? "127.0.0.1");
