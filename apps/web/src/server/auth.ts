import { betterAuth } from "better-auth/minimal";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { twoFactor } from "better-auth/plugins/two-factor";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";

function makeAuth() {
  const config = settings();
  return betterAuth({
    appName: "RelayHub",
    baseURL: config.RELAYHUB_BASE_URL,
    secret: config.BETTER_AUTH_SECRET,
    database: prismaAdapter(database(), { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    plugins: [
      twoFactor({
        backupCodeOptions: { storeBackupCodes: "encrypted" },
        twoFactorCookieMaxAge: 300,
      }),
    ],
    advanced: {
      useSecureCookies: config.RELAYHUB_BASE_URL.startsWith("https:"),
      database: { generateId: "uuid" },
      ipAddress: {
        disableIpTracking: config.TRUST_PROXY !== "1",
        ipAddressHeaders: ["x-real-ip"],
      },
    },
    rateLimit: { enabled: false },
    logger: { disabled: true },
  });
}

let instance: ReturnType<typeof makeAuth> | undefined;
export function auth() {
  instance ??= makeAuth();
  return instance;
}
