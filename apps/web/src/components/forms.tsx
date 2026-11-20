"use client";
import { useLocale } from "./locale";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Motion } from "./motion";

type FormValues = Record<string, string | boolean>;
type Result = {
  id?: string;
  secret?: string;
  eventId?: string;
  twoFactorRedirect?: boolean;
};
const messages: Record<string, [string, string]> = {
  api_key_limit: [
    "Revoke an unused API key before creating another.",
    "Revoca una chiave API inutilizzata prima di crearne un’altra.",
  ],
  invalid_mailbox_code: [
    "The email code is incorrect or expired. Check it and try again.",
    "Il codice email è errato o scaduto. Controllalo e riprova.",
  ],
  mailbox_rate_limited: [
    "The confirmation email limit has been reached. Try again in an hour.",
    "Hai raggiunto il limite di email di conferma. Riprova tra un’ora.",
  ],
  mail_unavailable: [
    "The email sender is unavailable.",
    "Il mittente email non è disponibile.",
  ],
  permission_denied: [
    "Your role does not allow this action.",
    "Il tuo ruolo non consente questa azione.",
  ],
  rate_limited: [
    "Too many requests. Wait a minute and try again.",
    "Troppe richieste. Attendi un minuto e riprova.",
  ],
  invalid_credentials: [
    "Check your email address and password.",
    "Verifica l’indirizzo email e la password.",
  ],
  INVALID_EMAIL_OR_PASSWORD: [
    "Check your email address and password.",
    "Verifica l’indirizzo email e la password.",
  ],
  USER_ALREADY_EXISTS: [
    "This email address cannot be registered.",
    "Questo indirizzo email non può essere registrato.",
  ],
  INVALID_CODE: [
    "The code did not match. Try again.",
    "Il codice non corrisponde. Riprova.",
  ],
  INVALID_BACKUP_CODE: [
    "The recovery code did not match or was already used.",
    "Il codice di recupero è errato o è già stato utilizzato.",
  ],
  INVALID_TWO_FACTOR_COOKIE: [
    "This verification step expired. Sign in again.",
    "La verifica è scaduta. Accedi di nuovo.",
  ],
  ACCOUNT_TEMPORARILY_LOCKED: [
    "Too many failed codes. Wait before trying again.",
    "Troppi codici errati. Attendi prima di riprovare.",
  ],
  invalid_factor: [
    "Check the code or password and try again.",
    "Controlla il codice o la password e riprova.",
  ],
  destination_not_allowed: [
    "Use an approved HTTPS hostname or the configured demo receiver.",
    "Usa un dominio HTTPS autorizzato o il destinatario di prova configurato.",
  ],
  registered_user_not_found: [
    "This ID does not match a registered account.",
    "Questo ID non corrisponde a un account registrato.",
  ],
  delivery_is_not_failed: [
    "Only failed deliveries can be retried.",
    "Puoi riprovare soltanto le consegne fallite.",
  ],
  test_route_unavailable: [
    "Enable the destination and add a route for this event type first.",
    "Attiva la destinazione e aggiungi una regola per questo tipo di evento.",
  ],
  source_unavailable: [
    "Enable the source before requesting a test.",
    "Attiva la sorgente prima di inviare una prova.",
  ],
  resource_not_found: [
    "This resource is unavailable.",
    "Questa risorsa non è disponibile.",
  ],
  invalid_configuration: [
    "Check the form fields and try again.",
    "Controlla i campi del modulo e riprova.",
  ],
  authentication_required: [
    "Sign in again to continue.",
    "Accedi di nuovo per continuare.",
  ],
  request_failed: [
    "The request failed. Check your input and try again.",
    "Richiesta non riuscita. Controlla i dati e riprova.",
  ],
  network_failed: [
    "Could not reach RelayHub. Try again.",
    "Connessione a RelayHub non riuscita. Riprova.",
  ],
  saved: ["Saved.", "Modifiche salvate."],
  form_not_ready: [
    "Wait a moment and retry. Reload the form if it has been open for a long time.",
    "Attendi un momento e riprova. Se il modulo è aperto da molto, ricarica la pagina.",
  ],
};

export function ActionForm({
  endpoint,
  label,
  children,
  fields = {},
  confirm,
  nextPath,
  onId,
  className,
  disabled = false,
  secretLabel,
}: {
  endpoint: string;
  label: string;
  children?: ReactNode;
  fields?: FormValues;
  confirm?: string;
  disabled?: boolean;
  secretLabel?: string;
  nextPath?: string;
  onId?: string;
  className?: string;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [secret, setSecret] = useState("");
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled || (confirm && !window.confirm(confirm))) {
      return;
    }
    const form = event.currentTarget;
    const values = { ...fields, ...Object.fromEntries(new FormData(form)) };
    if (form.elements.namedItem("enabled")) {
      values.enabled = values.enabled === "on";
    }
    if (values.secret === "") {
      delete values.secret;
    }

    setPending(true);
    setMessage("");
    setSecret("");
    setFailed(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const result: Result & { error?: string; code?: string } =
        await response.json();
      if (!response.ok) {
        setFailed(true);
        setMessage(result.error ?? result.code ?? "request_failed");
        if (result.error === "invalid_mailbox_code") {
          router.refresh();
        }
        return;
      }
      if (result.secret) {
        setSecret(result.secret);
      }
      if (result.twoFactorRedirect) {
        router.push("/verify");
      } else if (nextPath) {
        router.push(nextPath);
      } else if (onId && result.id) {
        router.push(onId + result.id);
      } else {
        setMessage("saved");
      }
      router.refresh();
    } catch {
      setFailed(true);
      setMessage("network_failed");
    } finally {
      setPending(false);
    }
  }

  const translatedMessage = messages[message] ?? messages.request_failed;
  let status = "status";
  let button = label;
  if (failed) {
    status = "alert";
  }
  if (pending) {
    button = t("Working…", "Attendi…");
  }
  return (
    <form className={className ?? "action-form"} onSubmit={submit}>
      {children}
      <button type="submit" disabled={pending || disabled}>
        {button}
      </button>
      {message && (
        <Motion kind="notice">
          <p
            className={(failed && "error-text") || "form-success"}
            role={status}
          >
            {t(...translatedMessage)}
          </p>
        </Motion>
      )}
      {secret && (
        <Motion kind="notice">
          <SecretReveal secret={secret} label={secretLabel} />
        </Motion>
      )}
    </form>
  );
}

function SecretReveal({ secret, label }: { secret: string; label?: string }) {
  const { t } = useLocale();
  const [status, setStatus] = useState<"copied" | "select">();
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setStatus("copied");
    } catch {
      setStatus("select");
    }
  }
  return (
    <div className="secret">
      <label>
        {label ?? t("Signing secret", "Chiave di firma")}{" "}
        <input
          readOnly
          value={secret}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <span className="muted">
        {t(
          "Save this secret now. It is shown once.",
          "Salva subito questa chiave. Viene mostrata una sola volta.",
        )}
      </span>
      <button type="button" onClick={copy}>
        {t("Copy secret", "Copia chiave")}
      </button>
      <p role="status">
        {status === "copied" && t("Copied.", "Chiave copiata.")}
        {status === "select" &&
          t(
            "Select the secret to copy it.",
            "Seleziona la chiave per copiarla.",
          )}
      </p>
    </div>
  );
}
