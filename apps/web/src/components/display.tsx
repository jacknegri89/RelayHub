import { getLocale } from "../server/locale";

const italianStates: Record<string, string> = {
  pending: "in attesa",
  queued: "in coda",
  delivering: "in consegna",
  retry_scheduled: "nuovo tentativo programmato",
  delivered: "consegnato",
  failed: "fallito",
  cancelled: "annullato",
  unrouted: "senza destinazione",
  partial: "parziale",
  in_progress: "in corso",
  enabled: "attivo",
  disabled: "disattivato",
  success: "riuscito",
  retry: "da riprovare",
  http_error: "errore HTTP",
  policy_blocked: "bloccato dalle regole di sicurezza",
  decryption_error: "errore di decifratura",
  lease_expired: "tempo di elaborazione scaduto",
  owner: "proprietario",
  admin: "amministratore",
  viewer: "lettore",
};

export function stateLabel(
  value: string,
  t: (en: string, it: string) => string,
) {
  const readable = value.replaceAll("_", " ");
  return t(readable, italianStates[value] ?? readable);
}

export async function Status({ value }: { value: string }) {
  const { t } = await getLocale();
  return (
    <span className="status" data-status={value}>
      {stateLabel(value, t)}
    </span>
  );
}

export function ShortId({ id }: { id: string }) {
  return <code title={id}>{id.slice(0, 8)}</code>;
}

export async function Time({ value }: { value: Date }) {
  const { locale } = await getLocale();
  const timestamp = new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "UTC",
    hourCycle: "h23",
  }).format(value);
  return (
    <time dateTime={value.toISOString()} title={value.toISOString()}>
      {timestamp} UTC
    </time>
  );
}
