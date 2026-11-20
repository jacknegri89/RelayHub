import { betterAuth } from "better-auth/minimal";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { twoFactor } from "better-auth/plugins/two-factor";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { accountEmailConfigured } from "@relayhub/shared/mail";
import { scheduleAccountMail } from "./account-mail-task";
import {
  hashedResetIdentifier,
  sendResetLink,
  sendVerificationLink,
} from "./account-mail";

function makeAuth() {
  const config = settings();
  const mailEnabled = accountEmailConfigured();
  return betterAuth({
    appName: "RelayHub",
    baseURL: config.RELAYHUB_BASE_URL,
    secret: config.BETTER_AUTH_SECRET,
    database: prismaAdapter(database(), {
      provider: "postgresql",
      transaction: true,
    }),
    verification: {
      storeIdentifier: {
        default: "plain",
        overrides: {
          "reset-password:": {
            hash: async (identifier) => hashedResetIdentifier(identifier),
          },
        },
      },
    },
    emailVerification: {
      sendOnSignUp: mailEnabled,
      sendVerificationEmail: async ({ user }, request) => {
        if (mailEnabled) {
          // Scheduling after the response keeps a provider delay out of the public registration response.
          scheduleAccountMail(() =>
            sendVerificationLink(user, request?.headers),
          );
        }
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: !mailEnabled,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: config.RELAYHUB_ACCOUNT_LINK_MINUTES * 60,
      sendResetPassword: async ({ user, token }, request) => {
        if (mailEnabled) {
          await sendResetLink(user, token, request?.headers);
        }
      },
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
