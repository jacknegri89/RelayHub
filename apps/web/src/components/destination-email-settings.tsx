import { destinationEmailConfigured } from "@relayhub/shared/notification-email";
import { emailPreference, type EmailScope } from "../server/destination-email";
import { getLocale } from "../server/locale";
import { ActionForm } from "./forms";

export async function DestinationEmailSettings({
  email,
  ...scope
}: EmailScope & { email: string }) {
  const { t } = await getLocale();
  const configured = destinationEmailConfigured(email);
  const state = await emailPreference(scope);
  const active = state === "active" || state === "activeWithFailure";
  const endpoint =
    "/api/organizations/" +
    scope.organizationId +
    "/destinations/" +
    scope.destinationId +
    "/email";
  let text = t(
    "Receive an email at your account address when this destination has an outage and when it recovers.",
    "Ricevi un’email all’indirizzo del tuo account quando questa destinazione ha un guasto e quando si ripristina.",
  );
  if (active) {
    text = t(
      "Email alerts are on for your account.",
      "Gli avvisi email sono attivi per il tuo account.",
    );
  }
  if (state === "pending") {
    text = t(
      "Check your account email for an eight-digit confirmation code. It expires in 30 minutes.",
      "Controlla la casella email del tuo account e inserisci il codice di otto cifre. Scade dopo 30 minuti.",
    );
  }
  if (state === "expired") {
    text = t(
      "Request a new confirmation code to enable email alerts.",
      "Richiedi un nuovo codice di conferma per attivare gli avvisi email.",
    );
  }
  return (
    <section className="panel" aria-label={t("Email alerts", "Avvisi email")}>
      <h2>{t("Email alerts", "Avvisi email")}</h2>
      <p>{text}</p>
      {!configured && (
        <p className="muted">
          {t(
            "An administrator must configure the email sender before RelayHub can send notifications.",
            "Un amministratore deve configurare il mittente per consentire a RelayHub di inviare le notifiche.",
          )}
        </p>
      )}
      {state === "activeWithFailure" && (
        <p role="status">
          {t(
            "An alert could not be sent. Check the alert history for missed updates.",
            "Un avviso non è stato inviato. Controlla il registro degli avvisi per leggere gli aggiornamenti.",
          )}
        </p>
      )}
      {configured && (state === "off" || state === "expired") && (
        <ActionForm
          endpoint={endpoint}
          fields={{ action: "enable" }}
          label={t("Enable email alerts", "Attiva avvisi email")}
        />
      )}
      {configured && state === "pending" && (
        <ActionForm
          endpoint={endpoint}
          fields={{ action: "confirm" }}
          label={t("Confirm email alerts", "Conferma avvisi email")}
        >
          <label>
            {t("Email confirmation code", "Codice di conferma email")}
            <input
              name="code"
              required
              inputMode="numeric"
              placeholder={t("e.g. 12345678", "Es. 12345678")}
              autoComplete="one-time-code"
              minLength={8}
              maxLength={8}
              pattern="[0-9]{8}"
            />
          </label>
        </ActionForm>
      )}
      {state !== "off" && (
        <ActionForm
          endpoint={endpoint}
          fields={{ action: "disable" }}
          label={t("Turn off email alerts", "Disattiva avvisi email")}
        />
      )}
    </section>
  );
}
