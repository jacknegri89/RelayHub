import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const password = randomBytes(24).toString("hex");
const lines = [
  "RELAYHUB_MODE=demo",
  "RELAYHUB_BASE_URL=http://localhost:3000",
  "POSTGRES_PASSWORD=" + password,
  "DATABASE_URL=postgresql://relayhub:" +
    password +
    "@127.0.0.1:55432/relayhub",
  "REDIS_URL=redis://127.0.0.1:56379",
  "BETTER_AUTH_SECRET=" + randomBytes(32).toString("hex"),
  "ACTIVE_KEY_ID=v1",
  "ENCRYPTION_KEYS=v1:" + randomBytes(32).toString("hex"),
  "DEMO_RECEIVER_URL=http://127.0.0.1:3001",
  "DEMO_RECEIVER_SECRET=" + randomBytes(32).toString("hex"),
];
try {
  writeFileSync(".env", lines.join("\n") + "\n", { flag: "wx", mode: 0o600 });
  console.log("Created .env with fresh local demo credentials.");
} catch (error) {
  if (error.code !== "EEXIST") {
    throw error;
  }
  console.log(".env already exists.");
}
