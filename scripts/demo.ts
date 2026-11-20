import { randomUUID } from "node:crypto";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { decrypt } from "@relayhub/shared/encryption";
import { sampleEvent, submitSigned } from "./demo-fixtures";

const supported = new Set([
  "success",
  "transient",
  "busy",
  "timeout",
  "lost-response",
  "slow",
  "permanent",
  "duplicate",
]);
const scenario = process.argv[2] ?? "success";
if (!settings().isDemo || !supported.has(scenario)) {
  throw new Error("Select a supported demo scenario.");
}
const db = database();
const sourceId = "ed373340-2825-4f7d-8576-1d44021b238d";
try {
  const source = await db.webhookSource.findUnique({
    where: { id: sourceId },
    select: { secret: true },
  });
  if (!source) {
    throw new Error("Run pnpm seed inside the environment first.");
  }
  const secret = decrypt(source.secret, "source:" + sourceId).toString("utf8");
  const eventId = "demo-" + randomUUID();
  let submits = 1;
  let eventType = "demo." + scenario;
  if (scenario === "duplicate") {
    submits = 6;
    eventType = "demo.success";
  }
  const body = sampleEvent(eventType, eventId);
  const results = await Promise.all(
    Array.from({ length: submits }, () =>
      submitSigned(sourceId, secret, eventId, body),
    ),
  );
  for (const result of results) {
    console.log(result.status, await result.json());
    if (!result.ok) {
      process.exitCode = 1;
    }
  }
} finally {
  await db.$disconnect();
}
