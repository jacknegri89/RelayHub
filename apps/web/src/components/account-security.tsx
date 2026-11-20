"use client";
import { useLocale } from "./locale";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "./forms";

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
};
type Enrollment = { totpURI: string; backupCodes: string[] };

export function AccountSecurity({ enabled }: { enabled: boolean }) {
  const { t } = useLocale();
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment>();
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

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
    <section className="panel security-panel" aria-labelledby="mfa-title">
      <h2 id="mfa-title">
        {t("Two-factor authentication", "Autenticazione a due fattori")}
      </h2>
      {recoveryCodes.length > 0 && (
        <RecoveryCodes
          codes={recoveryCodes}
          onDone={() => setRecoveryCodes([])}
        />
      )}
      {enabled && recoveryCodes.length === 0 && (
        <>
          <p role="status">
            {t(
              "Enabled. Your authenticator or a recovery code is required at sign-in.",
              "Attiva. Per accedere serve l’app di autenticazione o un codice di recupero.",
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
          >
            <PasswordInput />
          </ActionForm>
        </>
      )}
      {!enabled && recoveryCodes.length === 0 && (
        <form className="action-form" onSubmit={submit}>
          {!enrollment && (
            <>
              <p>
                {t(
                  "Require a code from your authenticator app after entering your password.",
                  "Dopo la password, ti verrà chiesto un codice generato dall’app di autenticazione.",
                )}
              </p>
              <PasswordInput />
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
            />
          )}
          {error && (
            <p role="alert" className="error-text">
              {t(...setupErrors[error])}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

function PasswordInput() {
  const { t } = useLocale();
  return (
    <label>
      {t("Current password", "Password attuale")}
      <input
        name="password"
        type="password"
        autoComplete="current-password"
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
}: {
  uri: string;
  pending: boolean;
}) {
  const { t } = useLocale();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [qrReady, setQrReady] = useState(false);
  const secret = new URL(uri).searchParams.get("secret") ?? "";

  useEffect(() => {
    let active = true;
    const surface = canvas.current;
    void import("qrcode")
      .then(async ({ toCanvas }) => {
        if (!active || !surface) {
          return;
        }
        await toCanvas(surface, uri, { width: 192, margin: 3 });
        if (active) {
          setQrReady(true);
        }
      })
      .catch(() => {
        // The manual setup key is always available.
      });
    return () => {
      active = false;
    };
  }, [uri]);

  return (
    <>
      <p>
        {t(
          "Scan the QR code with your authenticator app or enter the setup key as a time-based account.",
          "Scansiona il codice QR con l’app di autenticazione oppure inserisci la chiave per configurare un account basato sul tempo.",
        )}
      </p>
      <canvas
        ref={canvas}
        hidden={!qrReady}
        role="img"
        aria-label={t(
          "Authenticator setup QR code",
          "Codice QR per configurare l’app di autenticazione",
        )}
      />
      <label>
        {t("Manual setup key", "Chiave di configurazione manuale")}
        <input
          readOnly
          value={secret}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <label>
        {t("Authenticator code", "Codice di autenticazione")}
        <input
          name="code"
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
  return (
    <>
      <p role="status">
        {t(
          "Two-factor authentication is enabled. Save these recovery codes in a safe place. Each code works once.",
          "L’autenticazione a due fattori è attiva. Conserva questi codici di recupero in un luogo sicuro. Ogni codice è valido una sola volta.",
        )}
      </p>
      <ul className="recovery-codes">
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onDone}>
        {t("I saved my recovery codes", "Ho salvato i codici di recupero")}
      </button>
    </>
  );
}
