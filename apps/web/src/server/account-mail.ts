import { createHash, randomBytes } from "node:crypto";
import { database } from "@relayhub/db";
import { withinLimit } from "@relayhub/db/rate-limit";
import { settings } from "@relayhub/shared/config";
import { log } from "@relayhub/shared/log";
import { sendMail } from "@relayhub/shared/mail";
import { renderMail } from "@relayhub/shared/mail-layout";
import { languageCookie, translator } from "../locale";
import { HttpError } from "./http";

const MAX_REQUESTS_PER_HOUR = 3;
type Mailbox = { id: string; email: string; emailVerified: boolean };

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashedResetIdentifier(identifier: string) {
  return "relayhub-reset:" + digest(identifier);
}

export function allowAccountMail(action: "verify" | "reset", email: string) {
  const key = "account-email:" + action + ":" + digest(email.toLowerCase());
  return withinLimit(key, MAX_REQUESTS_PER_HOUR, 3600);
}

async function deliverLink(
  user: Mailbox,
  page: "confirm-email" | "reset-password",
  token: string,
  headers?: Headers,
) {
  const cookie = headers?.get("cookie") ?? "";
  const italian = cookie
    .split(";")
    .some((part) => part.trim() === languageCookie + "=it");
  let locale: "en" | "it" = "en";
  if (italian) {
    locale = "it";
  }
  const t = translator(locale);
  let subject = t(
    "Confirm your RelayHub email",
    "Conferma il tuo indirizzo email su RelayHub",
  );
  let instructions = t(
    "Open this link while signed in to the same RelayHub account. Confirm only if you created this account.",
    "Apri il link dopo aver effettuato l’accesso allo stesso account RelayHub. Conferma solo se hai creato tu questo account.",
  );
  let title = t(
    "Confirm your email address",
    "Conferma il tuo indirizzo email",
  );
  let button = t("Confirm my address", "Conferma il mio indirizzo");
  let description = t(
    "Sign in to the RelayHub account you created, then use the button below to confirm this address.",
    "Accedi all’account RelayHub che hai creato, poi usa il pulsante qui sotto per confermare questo indirizzo.",
  );
  if (page === "reset-password") {
    subject = t(
      "Reset your RelayHub password",
      "Reimposta la password di RelayHub",
    );
    instructions = t(
      "Open this link to choose a new password.",
      "Apri il link per scegliere una nuova password.",
    );
    title = t("Reset your password", "Reimposta la password");
    button = t("Choose a new password", "Scegli una nuova password");
    description = t(
      "You requested a password reset for your RelayHub account. Use this link to choose a new password.",
      "Hai richiesto il recupero del tuo account RelayHub. Da qui puoi scegliere una nuova password.",
    );
  }
  const config = settings();
  // Fragments stay in the browser. Link scanners can open the page without consuming the token.
  const url = config.RELAYHUB_BASE_URL + "/" + page + "#" + token;
  const expiry =
    t("Valid for", "Valido per") +
    " " +
    config.RELAYHUB_ACCOUNT_LINK_MINUTES +
    t(" minutes.", " minuti.");
  const footer = t(
    "If you did not request this, ignore this email.",
    "Se non lo hai richiesto tu, ignora questo messaggio.",
  );
  try {
    const result = await sendMail({
      to: user.email,
      subject,
      text: [instructions, url, expiry, footer].join("\n\n"),
      html: renderMail({
        locale,
        kind: "account",
        section: t("Account security", "Sicurezza account"),
        title,
        description,
        preview: title + ". " + expiry,
        footer,
        action: { label: button, url },
        expiry,
      }),
      key: "account/" + page + "/" + digest(token),
    });
    if (result.status >= 200 && result.status < 300) {
      return;
    }
    log("error", "account_email_declined", { status: result.status });
  } catch {
    log("error", "account_email_transport_failed");
  }
  throw new HttpError(503, "mail_unavailable");
}

export async function sendVerificationLink(user: Mailbox, headers?: Headers) {
  if (user.emailVerified) {
    return;
  }
  if (!(await allowAccountMail("verify", user.email))) {
    throw new HttpError(429, "account_email_limit");
  }
  const token = randomBytes(32).toString("base64url");
  const id = "relayhub-mailbox:" + user.id;
  const value = digest(user.email + ":" + token);
  const expiresAt = new Date(
    Date.now() + settings().RELAYHUB_ACCOUNT_LINK_MINUTES * 60_000,
  );
  // Only the latest link can be used, and it is bound to the account's current address.
  await database().verification.upsert({
    where: { id },
    create: { id, identifier: id, value, expiresAt },
    update: { value, expiresAt },
  });
  await deliverLink(user, "confirm-email", token, headers);
}

export async function confirmMailbox(user: Mailbox, token: string) {
  const id = "relayhub-mailbox:" + user.id;
  const value = digest(user.email + ":" + token);
  await database().$transaction(async (tx) => {
    const spent = await tx.verification.deleteMany({
      where: { id, value, expiresAt: { gt: new Date() } },
    });
    if (spent.count !== 1) {
      throw new HttpError(400, "account_link_invalid");
    }
    const updated = await tx.user.updateMany({
      where: { id: user.id, email: user.email, emailVerified: false },
      data: { emailVerified: true },
    });
    if (updated.count !== 1) {
      throw new HttpError(400, "account_link_invalid");
    }
  });
}

export async function sendResetLink(
  user: Mailbox,
  token: string,
  headers?: Headers,
) {
  if (user.emailVerified) {
    await deliverLink(user, "reset-password", token, headers);
  }
}
