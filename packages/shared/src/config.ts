import { z } from "zod";

function integer(defaultValue: number, min: number, max: number) {
  return z.coerce.number().int().min(min).max(max).default(defaultValue);
}

const schema = z.object({
  RELAYHUB_MODE: z.enum(["demo", "production"]).default("production"),
  RELAYHUB_BASE_URL: z.url(),
  RELAYHUB_PREVIOUS_ORIGIN: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  DATABASE_URL: z.url().regex(/^postgres(?:ql)?:\/\//),
  REDIS_URL: z.url().regex(/^rediss?:\/\//),
  BETTER_AUTH_SECRET: z.string().min(32),
  ACTIVE_KEY_ID: z.string().regex(/^[\w-]{1,32}$/),
  ENCRYPTION_KEYS: z.string().min(1),
  DESTINATION_HOSTS: z.string().default(""),
  DEMO_RECEIVER_URL: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  DEMO_RECEIVER_SECRET: z
    .union([z.string().min(32), z.literal("")])
    .optional()
    .transform((value) => value || undefined),
  TRUST_PROXY: z.enum(["0", "1"]).default("0"),
  VERIFICATION_RECEIVER_SECRET: z.string().min(32).optional(),
  RESEND_API_KEY: z.string().optional(),
  RELAYHUB_EMAIL_FROM: z.union([z.email(), z.literal("")]).optional(),
  PAYLOAD_LIMIT_BYTES: integer(262144, 1024, 1048576),
  WEBHOOK_WINDOW_SECONDS: integer(300, 30, 900),
  DELIVERY_TIMEOUT_MS: integer(5000, 500, 30000),
  MAX_ATTEMPTS: integer(5, 1, 20),
  WORKER_CONCURRENCY: integer(4, 1, 32),
  WORKER_HEALTH_PORT: integer(3002, 1024, 65535),
  RETENTION_DAYS: integer(30, 1, 365),
});

export function parseConfig(environment: Record<string, string | undefined>) {
  const parsed = schema.safeParse(environment);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join("."));
    throw new Error("Invalid configuration: " + fields.join(", "));
  }
  const config = parsed.data;
  if (Boolean(config.RESEND_API_KEY) !== Boolean(config.RELAYHUB_EMAIL_FROM)) {
    throw new Error(
      "Configure RESEND_API_KEY and RELAYHUB_EMAIL_FROM together",
    );
  }
  const origin = new URL(config.RELAYHUB_BASE_URL);
  const isDemo = config.RELAYHUB_MODE === "demo";
  if (
    config.RELAYHUB_BASE_URL !== origin.origin ||
    origin.username ||
    origin.password
  ) {
    throw new Error("RELAYHUB_BASE_URL must be an origin");
  }
  if (!isDemo && origin.protocol !== "https:") {
    throw new Error("HTTPS is required outside demo mode");
  }
  if (isDemo && !["localhost", "127.0.0.1"].includes(origin.hostname)) {
    throw new Error("Demo mode requires a loopback RELAYHUB_BASE_URL");
  }
  if (config.RELAYHUB_PREVIOUS_ORIGIN) {
    const previousOrigin = new URL(config.RELAYHUB_PREVIOUS_ORIGIN);
    if (
      isDemo ||
      previousOrigin.protocol !== "https:" ||
      previousOrigin.port ||
      previousOrigin.origin !== config.RELAYHUB_PREVIOUS_ORIGIN ||
      previousOrigin.origin === origin.origin
    ) {
      throw new Error(
        "RELAYHUB_PREVIOUS_ORIGIN must be a separate HTTPS origin",
      );
    }
  }
  const keys = new Map<string, Buffer>();
  for (const entry of config.ENCRYPTION_KEYS.split(",")) {
    const [id, encoded, extra] = entry.split(":");
    if (
      !/^[\w-]{1,32}$/.test(id) ||
      !/^[a-f0-9]{64}$/i.test(encoded ?? "") ||
      extra ||
      keys.has(id)
    ) {
      throw new Error("Invalid ENCRYPTION_KEYS");
    }
    keys.set(id, Buffer.from(encoded, "hex"));
  }
  if (!keys.has(config.ACTIVE_KEY_ID)) {
    throw new Error("ACTIVE_KEY_ID is missing from ENCRYPTION_KEYS");
  }
  if (
    config.DEMO_RECEIVER_URL &&
    (!isDemo ||
      !/^http:\/\/(?:127\.0\.0\.1|mock-receiver):[1-9]\d{0,4}$/.test(
        config.DEMO_RECEIVER_URL,
      ))
  ) {
    throw new Error("Invalid DEMO_RECEIVER_URL");
  }
  const hosts = new Set(
    config.DESTINATION_HOSTS.toLowerCase()
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean),
  );
  return { ...config, keys, hosts, isDemo };
}

let cached: ReturnType<typeof parseConfig> | undefined;
export function settings() {
  cached ??= parseConfig(process.env);
  return cached;
}
