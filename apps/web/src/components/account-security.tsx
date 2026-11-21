"use client";
import { useLocale } from "./locale";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "./forms";
import { InterfaceIcon } from "./interface-icon";
import styles from "./account-security.module.css";

const setupErrors: Record<string, [string, string]> = {
  password: [
    "Enter your current password and try again.",
    "Inserisci la password attuale e riprova.",
  ],
  code: [
    "Enter the current six-digit code from your authenticator.",
    "Inserisci il codice a sei cifre mostrato dall’app di autenticazione.",
  ],
  limit: [
    "Too many attempts. Wait a minute before trying again.",
    "Troppi tentativi. Attendi un minuto e riprova.",
  ],
  network: [
    "Could not reach RelayHub. Try again.",
    "Connessione a RelayHub non riuscita. Riprova.",
  ],
  unavailable: [
    "RelayHub could not complete this step. Try again.",
    "RelayHub non è riuscito a completare il passaggio. Riprova.",
  ],
};
type Enrollment = { totpURI: string; backupCodes: string[] };

export function AccountSecurity({ enabled }: { enabled: boolean }) {
  const { t } = useLocale();
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment>();
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const title = useRef<HTMLHeadingElement>(null);
  // A successful code check precedes the refreshed session reaching this component.
  const protectedAccount = enabled || recoveryCodes !== undefined;
  const showCodes = Boolean(recoveryCodes?.length);
  let status = t("Off", "Disattivata");
  if (protectedAccount) {
    status = t("Enabled", "Attiva");
  } else if (enrollment) {
    status = t("Awaiting code", "In attesa del codice");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    let action = "enable";
    if (enrollment) {
      action = "verify-totp";
    }
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/two-factor/" + action, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        let message = "password";
        if (enrollment) {
          message = "code";
        }
        if (response.status === 429) {
          message = "limit";
        }
        if (response.status >= 500) {
          message = "unavailable";
        }
        setError(message);
        return;
      }
      if (enrollment) {
        setRecoveryCodes(enrollment.backupCodes);
        setEnrollment(undefined);
        router.refresh();
        return;
      }
      const setup: Enrollment = await response.json();
      form.reset();
      setEnrollment(setup);
    } catch {
      setError("network");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="mfa-title">
      <header className={styles.header}>
        <div className={styles.identity}>
          <InterfaceIcon name="security" />
          <h2 id="mfa-title" ref={title} tabIndex={-1}>
            {t("Two-factor authentication", "Autenticazione a due fattori")}
          </h2>
        </div>
        <span
          className={styles.status}
          data-active={protectedAccount}
          data-pairing={Boolean(enrollment)}
        >
          {status}
        </span>
      </header>
      <div className={styles.body}>
        {showCodes && recoveryCodes && (
          <RecoveryCodes
            codes={recoveryCodes}
            onDone={() => {
              setRecoveryCodes([]);
              title.current?.focus();
            }}
          />
        )}
        {protectedAccount && !showCodes && (
          <>
            <h3>{t("How you sign in", "Come accedi al tuo account")}</h3>
            <dl className={styles.methods}>
              <div>
                <dt>{t("After your password", "Dopo la password")}</dt>
                <dd>
                  {t(
                    "Six-digit authenticator code",
                    "Codice a sei cifre dell’app",
                  )}
                </dd>
              </div>
              <div>
                <dt>{t("Without your authenticator", "Se non hai l’app")}</dt>
                <dd>
                  {t(
                    "One of your saved recovery codes",
                    "Uno dei tuoi codici di recupero",
                  )}
                </dd>
              </div>
            </dl>
            <details className={styles.disable}>
              <summary>
                {t(
                  "Turn off the extra sign-in step",
                  "Disattiva il secondo passaggio",
                )}
              </summary>
              <p>
                {t(
                  "Turning this off also invalidates your recovery codes.",
                  "Se disattivi il secondo passaggio, i codici di recupero perderanno validità.",
                )}
              </p>
              <ActionForm
                endpoint="/api/auth/two-factor/disable"
                label={t(
                  "Disable two-factor authentication",
                  "Disattiva l’autenticazione a due fattori",
                )}
                confirm={t(
                  "Disable two-factor authentication and invalidate your recovery codes?",
                  "Vuoi disattivare l’autenticazione a due fattori e invalidare i codici di recupero?",
                )}
                onSuccess={() => {
                  setRecoveryCodes(undefined);
                  router.refresh();
                }}
              >
                <PasswordInput />
              </ActionForm>
            </details>
          </>
        )}
        {!protectedAccount && (
          <form className={styles.enrollment} onSubmit={submit}>
            {!enrollment && (
              <>
                <h3>
                  {t(
                    "Connect an authenticator app",
                    "Collega un’app di autenticazione",
                  )}
                </h3>
                <p>
                  {t(
                    "Confirm your password to get a QR code. You can scan it with the authenticator you already use.",
                    "Conferma la password per ottenere un codice QR. Puoi scansionarlo con l’app di autenticazione che usi già.",
                  )}
                </p>
                <PasswordInput invalid={error === "password"} />
                <button type="submit" disabled={pending}>
                  {pending && t("Working…", "Attendi…")}
                  {!pending &&
                    t(
                      "Set up authenticator",
                      "Configura l’app di autenticazione",
                    )}
                </button>
              </>
            )}
            {enrollment && (
              <AuthenticatorSetup
                key={enrollment.totpURI}
                uri={enrollment.totpURI}
                pending={pending}
                invalid={error === "code"}
              />
            )}
            {error && (
              <p id="enrollment-error" role="alert" className="error-text">
                {t(...setupErrors[error])}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}

function PasswordInput({ invalid = false }: { invalid?: boolean }) {
  const { t } = useLocale();
  return (
    <label>
      {t("Current password", "Password attuale")}
      <input
        name="password"
        type="password"
        autoComplete="current-password"
        aria-invalid={invalid || undefined}
        aria-describedby={(invalid && "enrollment-error") || undefined}
        placeholder={t("Your account password", "La password del tuo account")}
        minLength={12}
        maxLength={128}
        required
      />
    </label>
  );
}

function AuthenticatorSetup({
  uri,
  pending,
  invalid,
}: {
  uri: string;
  pending: boolean;
  invalid: boolean;
}) {
  const { t } = useLocale();
  const canvas = useRef<HTMLCanvasElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [qrState, setQrState] = useState("loading");
  const secret = new URL(uri).searchParams.get("secret") ?? "";

  useEffect(() => {
    let active = true;
    heading.current?.focus();
    const surface = canvas.current;
    void import("qrcode")
      .then(async ({ toCanvas }) => {
        if (!active || !surface) {
          return;
        }
        await toCanvas(surface, uri, { width: 192, margin: 4 });
        if (active) {
          setQrState("ready");
        }
      })
      .catch(() => {
        if (active) {
          setQrState("failed");
        }
      });
    return () => {
      active = false;
    };
  }, [uri]);

  return (
    <>
      <section
        className={styles.setupStep}
        aria-labelledby="pair-authenticator"
      >
        <h3 id="pair-authenticator" ref={heading} tabIndex={-1}>
          {t(
            "Add RelayHub to your authenticator",
            "Aggiungi RelayHub all’app di autenticazione",
          )}
        </h3>
        <p>
          {t(
            "Scan this QR code inside the app. If you are on the same phone, enter the setup key instead.",
            "Scansiona il codice QR dall’app. Se stai usando lo stesso telefono, inserisci la chiave manualmente.",
          )}
        </p>
        <canvas
          className={styles.qr}
          ref={canvas}
          hidden={qrState !== "ready"}
          role="img"
          aria-label={t(
            "Authenticator setup QR code",
            "Codice QR per configurare l’app di autenticazione",
          )}
        />
        <details className={styles.manual} open={qrState === "failed"}>
          <summary>
            {t("Enter a setup key instead", "Inserisci la chiave manualmente")}
          </summary>
          <p>
            {t(
              "In your app, add a time-based account named RelayHub and paste this key.",
              "Nell’app aggiungi un account basato sul tempo, chiamalo RelayHub e incolla la chiave.",
            )}
          </p>
          <label>
            {t("Manual setup key", "Chiave di configurazione manuale")}
            <input
              readOnly
              value={secret}
              autoComplete="off"
              spellCheck={false}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
        </details>
      </section>
      <section
        className={styles.setupStep}
        aria-labelledby="confirm-authenticator"
      >
        <h3 id="confirm-authenticator">
          {t("Confirm the connection", "Conferma il collegamento")}
        </h3>
        <p>
          {t(
            "Enter the six digits currently shown beside RelayHub in the app.",
            "Inserisci le sei cifre che vedi adesso accanto a RelayHub nell’app.",
          )}
        </p>
        <label>
          {t("Authenticator code", "Codice di autenticazione")}
          <input
            className={styles.code}
            name="code"
            aria-invalid={invalid || undefined}
            aria-describedby={(invalid && "enrollment-error") || undefined}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            placeholder="123456"
            maxLength={6}
            required
          />
        </label>
        <button type="submit" disabled={pending}>
          {pending && t("Working…", "Attendi…")}
          {!pending &&
            t(
              "Enable two-factor authentication",
              "Attiva l’autenticazione a due fattori",
            )}
        </button>
      </section>
    </>
  );
}

function RecoveryCodes({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const { t } = useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <div className={styles.recovery}>
      <h3 ref={heading} tabIndex={-1}>
        {t("Save your recovery codes", "Salva i codici di recupero")}
      </h3>
      <p role="status">
        {t(
          "Two-factor authentication is enabled. Store these codes somewhere other than your authenticator. Each works once, and you can only see them here until you leave this step.",
          "L’autenticazione a due fattori è attiva. Conserva i codici in un posto diverso dall’app. Puoi vederli solo in questo passaggio e usarli una volta ciascuno.",
        )}
      </p>
      <ul
        className={styles.codes}
        aria-label={t("Recovery codes", "Codici di recupero")}
      >
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onDone}>
        {t("I saved my recovery codes", "Ho salvato i codici di recupero")}
      </button>
    </div>
  );
}
