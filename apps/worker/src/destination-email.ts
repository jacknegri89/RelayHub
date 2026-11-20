import { database, Prisma } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { log } from "@relayhub/shared/log";
import {
  CONFIRMATION_MINUTES,
  mailboxCode,
} from "@relayhub/shared/notification-email";

const HTTP_TIMEOUT_MS = 5_000;
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
export type NoticeMail = {
  to: string;
  subject: string;
  text: string;
  key: string;
};
type SendResult = { status: number; retryAfterMs?: number };
type Transport = (mail: NoticeMail) => Promise<SendResult>;

function buildMail(row: Envelope): NoticeMail {
  const it = row.locale === "it";
  const t = (en: string, italian: string) => {
    if (it) {
      return italian;
    }
    return en;
  };
  const base = {
    to: row.email,
    key: "relayhub/" + row.subscriptionId + "/" + row.eventKey,
  };
  if (row.kind === "confirmation") {
    const code = mailboxCode(row.subscriptionId, row.email);
    const instruction = t(
      "Enter this code in RelayHub to enable destination alerts.",
      "Inserisci questo codice in RelayHub per attivare gli avvisi della destinazione.",
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
        t(
          "If you did not request this, you can ignore this email.",
          "Se non hai richiesto il codice, puoi ignorare questa email.",
        ),
      ].join("\n\n"),
    };
  }
  const name = row.destinationName.replace(/[\r\n\t]+/g, " ");
  let title = t("Destination outage", "Guasto della destinazione");
  let description = t(
    "Three consecutive outbound attempts failed.",
    "Tre tentativi di invio consecutivi sono falliti.",
  );
  if (row.kind === "recovery") {
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
  };
}

async function sendWithResend(mail: NoticeMail): Promise<SendResult> {
  const config = settings();
  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    headers: {
      authorization: "Bearer " + config.RESEND_API_KEY,
      "content-type": "application/json",
      "idempotency-key": mail.key,
    },
    body: JSON.stringify({
      from: config.RELAYHUB_EMAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
    }),
  });
  const after = result.headers.get("retry-after");
  await result.body?.cancel();
  if (after && /^\d+$/.test(after)) {
    return { status: result.status, retryAfterMs: Number(after) * 1000 };
  }
  return { status: result.status };
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
  send: Transport = sendWithResend,
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
  const expired =
    now.getTime() - claim.firstAttemptAt.getTime() >= IDEMPOTENCY_WINDOW_MS;
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
  let result: SendResult = { status: 0 };
  try {
    result = await send(
      buildMail({ ...message, ...sub, subscriptionId: sub.id }),
    );
  } catch {
    // A transport timeout can happen after acceptance. Replay with the original idempotency key.
  }
  const accepted = result.status >= 200 && result.status < 300;
  const transient =
    result.status === 0 ||
    result.status >= 500 ||
    [408, 409, 429].includes(result.status);
  if (accepted || !transient) {
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
  const deadline = claim.firstAttemptAt.getTime() + IDEMPOTENCY_WINDOW_MS;
  const nextAttemptAt = new Date(Math.min(next, deadline));
  await db.destinationEmailMessage.updateMany({
    where: marker,
    data: { nextAttemptAt },
  });
  return true;
}
