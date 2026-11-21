import { database, Prisma } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { log } from "@relayhub/shared/log";
import { renderMail } from "@relayhub/shared/mail-layout";
import {
  sendMail,
  type NoticeMail,
  type MailResult,
} from "@relayhub/shared/mail";
import {
  CONFIRMATION_MINUTES,
  mailboxCode,
} from "@relayhub/shared/notification-email";

const LEASE_MS = 30_000;
// Resend retains request keys for 24 hours. Keep all ambiguous retries inside that window.
const IDEMPOTENCY_WINDOW_MS = 23 * 60 * 60_000;
const MAX_BACKOFF_MS = 15 * 60_000;

type Envelope = {
  subscriptionId: string;
  destinationId: string;
  organizationId: string;
  email: string;
  locale: string;
  eventKey: string;
  kind: string;
  destinationName: string;
  occurredAt: Date;
};
type Transport = (mail: NoticeMail) => Promise<MailResult>;

function buildMail(row: Envelope): NoticeMail {
  let locale: "it" | "en" = "en";
  if (row.locale === "it") {
    locale = "it";
  }
  const t = (en: string, italian: string) => {
    if (locale === "it") {
      return italian;
    }
    return en;
  };
  const base = {
    to: row.email,
    key: "relayhub/" + row.subscriptionId + "/" + row.eventKey,
  };
  const section = t("Delivery alerts", "Avvisi di consegna");
  if (row.kind === "confirmation") {
    const code = mailboxCode(row.subscriptionId, row.email);
    const instruction = t(
      "Enter this code in RelayHub to enable destination alerts.",
      "Inserisci questo codice in RelayHub per attivare gli avvisi della destinazione.",
    );
    const footer = t(
      "If you did not request this, you can ignore this email.",
      "Se non hai richiesto il codice, puoi ignorare questa email.",
    );
    return {
      ...base,
      subject: t("RelayHub email confirmation", "Conferma email di RelayHub"),
      text: [
        instruction,
        code,
        t("Minutes before the code expires", "Minuti di validità del codice") +
          " · " +
          CONFIRMATION_MINUTES,
        footer,
      ].join("\n\n"),
      html: renderMail({
        locale,
        kind: "code",
        section,
        title: t("Activate delivery alerts", "Attiva gli avvisi di consegna"),
        description: instruction,
        preview: instruction,
        code: {
          label: t("Confirmation code", "Codice di conferma"),
          value: code,
        },
        expiry: t(
          `The code is valid for ${CONFIRMATION_MINUTES} minutes from your request.`,
          `Il codice è valido per ${CONFIRMATION_MINUTES} minuti dalla richiesta.`,
        ),
        footer,
      }),
    };
  }
  const name = row.destinationName.replace(/[\r\n\t]+/g, " ");
  let kind: "outage" | "recovery" = "outage";
  let title = t("Destination outage", "Guasto della destinazione");
  let description = t(
    "Three consecutive outbound attempts failed.",
    "Tre tentativi di invio consecutivi sono falliti.",
  );
  if (row.kind === "recovery") {
    kind = "recovery";
    title = t("Destination recovered", "Destinazione ripristinata");
    description = t(
      "The destination returned a successful HTTP response.",
      "La destinazione ha restituito una risposta HTTP riuscita.",
    );
  }
  const url =
    settings().RELAYHUB_BASE_URL +
    "/workspace/" +
    row.organizationId +
    "/destinations/" +
    row.destinationId;
  const timestamp = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(row.occurredAt);
  return {
    ...base,
    subject: "RelayHub · " + title + " · " + name,
    text: [
      name,
      description,
      row.occurredAt.toISOString(),
      t(
        "View the destination or turn off its emails",
        "Apri la destinazione o disattiva le sue email",
      ),
      url,
    ].join("\n\n"),
    html: renderMail({
      locale,
      kind,
      section,
      title,
      description,
      preview: name + " · " + description,
      details: [
        { label: t("Destination", "Destinazione"), value: name },
        { label: t("Detected at", "Rilevato il"), value: timestamp + " UTC" },
      ],
      action: { label: t("View destination", "Apri la destinazione"), url },
      footer: t(
        "You receive these alerts because you subscribed to this destination. You can turn them off in its settings.",
        "Ricevi questi avvisi perché li hai attivati per questa destinazione. Puoi disattivarli dalle sue impostazioni.",
      ),
    }),
  };
}

type Claim = { id: bigint; attempts: number; firstAttemptAt: Date };
async function claimEmail(now: Date, organizationId?: string) {
  const leaseEnd = new Date(now.getTime() + LEASE_MS);
  let scope = Prisma.empty;
  if (organizationId) {
    scope = Prisma.sql`AND EXISTS (SELECT 1 FROM "DestinationEmailSubscription" s
      WHERE s.id=m."subscriptionId" AND s."organizationId"=${organizationId})`;
  }
  // Preserve outage → recovery order per subscription while allowing other recipients to make progress.
  const [row] = await database().$queryRaw<Claim[]>`
    WITH candidate AS (
      SELECT m.id FROM "DestinationEmailMessage" m
      WHERE m."finishedAt" IS NULL AND m."nextAttemptAt" <= ${now} ${scope} AND NOT EXISTS (
        SELECT 1 FROM "DestinationEmailMessage" previous WHERE previous."subscriptionId"=m."subscriptionId"
          AND previous.id<m.id AND previous."finishedAt" IS NULL
      ) ORDER BY m."nextAttemptAt",m.id LIMIT 1 FOR UPDATE OF m SKIP LOCKED
    ) UPDATE "DestinationEmailMessage" m SET "nextAttemptAt"=${leaseEnd}, attempts=m.attempts+1,
      "firstAttemptAt"=COALESCE(m."firstAttemptAt",${now}) FROM candidate
      WHERE m.id=candidate.id RETURNING m.id,m.attempts,m."firstAttemptAt"`;
  return row;
}

export async function dispatchDestinationEmail(
  send: Transport = sendMail,
  now = new Date(),
  organizationId?: string,
) {
  const db = database();
  const claim = await claimEmail(now, organizationId);
  if (!claim) {
    return false;
  }
  const marker = { id: claim.id, attempts: claim.attempts, finishedAt: null };
  const message = await db.destinationEmailMessage.findFirst({
    where: marker,
    include: {
      subscription: {
        include: { member: { select: { user: { select: { email: true } } } } },
      },
    },
  });
  if (!message) {
    return true;
  }
  const sub = message.subscription;
  const deadline =
    Math.min(claim.firstAttemptAt.getTime(), message.occurredAt.getTime()) +
    IDEMPOTENCY_WINDOW_MS;
  const expired = now.getTime() >= deadline;
  if (
    expired ||
    sub.email !== sub.member.user.email ||
    (message.kind === "confirmation" &&
      (!sub.challengeExpiresAt ||
        sub.challengeExpiresAt <= now ||
        sub.verifiedAt))
  ) {
    await db.destinationEmailMessage.updateMany({
      where: marker,
      data: { finishedAt: now, failed: true },
    });
    return true;
  }
  let result: MailResult = { status: 0 };
  try {
    const mail = buildMail({ ...message, ...sub, subscriptionId: sub.id });
    result = await send(mail);
    // Resend may already have accepted the text-only payload before the template upgrade.
    if (
      claim.attempts > 1 &&
      result.status === 409 &&
      result.permanentConflict
    ) {
      result = { status: 0 };
      result = await send({
        to: mail.to,
        key: mail.key,
        subject: mail.subject,
        text: mail.text,
      });
    }
  } catch {
    // A transport timeout can happen after acceptance. Replay with the original idempotency key.
  }
  const accepted = result.status >= 200 && result.status < 300;
  const transient =
    result.status === 0 ||
    result.status >= 500 ||
    (result.status === 409 && !result.permanentConflict) ||
    [408, 429].includes(result.status);
  if (accepted || !transient || result.uncertain) {
    await db.destinationEmailMessage.updateMany({
      where: marker,
      data: { finishedAt: now, failed: !accepted },
    });
    if (!accepted) {
      log("error", "destination_email_rejected", { status: result.status });
    }
    return true;
  }
  const backoff = Math.min(
    MAX_BACKOFF_MS,
    30_000 * 2 ** Math.min(claim.attempts - 1, 8),
  );
  const next = now.getTime() + Math.max(backoff, result.retryAfterMs ?? 0);
  const nextAttemptAt = new Date(Math.min(next, deadline));
  await db.destinationEmailMessage.updateMany({
    where: marker,
    data: { nextAttemptAt },
  });
  return true;
}
