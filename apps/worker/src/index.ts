import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { log } from "@relayhub/shared/log";
import { destinationEmailConfigured } from "@relayhub/shared/notification-email";
import { dispatchDestinationEmail } from "./destination-email";
import { processDelivery, type JobData } from "./delivery";
import { dispatch, QUEUE_NAME, recover, retainRecent } from "./dispatch";

const config = settings();
const publisher = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 2000,
  commandTimeout: 2000,
});
const consumer = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
for (const connection of [publisher, consumer]) {
  connection.on("error", () => log("error", "redis_connection_error"));
}

const queue = new Queue<JobData>(QUEUE_NAME, { connection: publisher });
const worker = new Worker<JobData>(
  QUEUE_NAME,
  (job) => processDelivery(job.data),
  {
    connection: consumer,
    concurrency: config.WORKER_CONCURRENCY,
  },
);
queue.on("error", () => log("error", "queue_error"));
worker.on("error", () => log("error", "worker_error"));
worker.on("failed", (job) =>
  log("error", "job_failed", { deliveryId: job?.data.deliveryId ?? "unknown" }),
);

let stopping = false;
let lastTick = 0;
const health = createServer(async (request, response) => {
  let code = 404;
  if (request.method === "GET" && request.url === "/live") {
    code = 200;
  }
  if (request.method === "GET" && request.url === "/ready") {
    code = 503;
    try {
      const fresh = Date.now() - lastTick < 20_000;
      if (
        !stopping &&
        fresh &&
        consumer.status === "ready" &&
        (await publisher.ping()) === "PONG"
      ) {
        await database().$queryRaw`SELECT 1`;
        code = 200;
      }
    } catch {
      code = 503;
    }
  }
  response.writeHead(code, { "cache-control": "no-store" }).end();
});
health.listen(config.WORKER_HEALTH_PORT, "127.0.0.1");

async function run() {
  let retainAt = 0;
  while (!stopping) {
    try {
      await recover();
      const now = Date.now();
      if (now >= retainAt) {
        await retainRecent(now);
        retainAt = now + 60_000;
      }
      if (publisher.status === "ready") {
        await dispatch(queue);
        lastTick = Date.now();
      }
    } catch {
      log("error", "dispatch_iteration_failed");
    }
    await delay(500);
  }
}

const running = run();
async function runEmail() {
  while (!stopping && destinationEmailConfigured()) {
    let idle = true;
    try {
      idle = !(await dispatchDestinationEmail());
    } catch {
      log("error", "destination_email_dispatch_failed");
    }
    let interval = 600;
    if (idle) {
      interval = 5000;
    }
    await delay(interval);
  }
}
const emailRunning = runEmail();
async function shutdown() {
  if (stopping) {
    return;
  }
  stopping = true;
  health.close();
  try {
    await Promise.all([running, emailRunning]);
    await worker.close();
    await queue.close();
    await database().$disconnect();
  } finally {
    publisher.disconnect();
    consumer.disconnect();
  }
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown().catch(() => {
      log("error", "shutdown_failed");
      process.exitCode = 1;
    });
  });
}
