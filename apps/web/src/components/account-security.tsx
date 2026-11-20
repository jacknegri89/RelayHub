"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "./forms";

type Enrollment = { totpURI: string; backupCodes: string[] };

export function AccountSecurity({ enabled }: { enabled: boolean }) {
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
        let message = "Enter your current password and try again.";
        if (enrollment) {
          message = "Enter the current six-digit code from your authenticator.";
        }
        if (response.status === 429) {
          message = "Too many attempts. Wait a minute before trying again.";
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
      setError("Could not reach RelayHub. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel security-panel" aria-labelledby="mfa-title">
      <h2 id="mfa-title">Two-factor authentication</h2>
      {recoveryCodes.length > 0 && (
        <RecoveryCodes
          codes={recoveryCodes}
          onDone={() => setRecoveryCodes([])}
        />
      )}
      {enabled && recoveryCodes.length === 0 && (
        <>
          <p role="status">
            Enabled. Your authenticator or a recovery code is required at
            sign-in.
          </p>
          <ActionForm
            endpoint="/api/auth/two-factor/disable"
            label="Disable two-factor authentication"
            confirm="Disable two-factor authentication and invalidate your recovery codes?"
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
                Require a code from your authenticator app after entering your
                password.
              </p>
              <PasswordInput />
              <button type="submit" disabled={pending}>
                Set up authenticator
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
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

function PasswordInput() {
  return (
    <label>
      Current password
      <input
        name="password"
        type="password"
        autoComplete="current-password"
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
        Scan the QR code with your authenticator app or enter the setup key as a
        time-based account.
      </p>
      <canvas
        ref={canvas}
        hidden={!qrReady}
        role="img"
        aria-label="Authenticator setup QR code"
      />
      <label>
        Manual setup key
        <input
          readOnly
          value={secret}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <label>
        Authenticator code
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
        />
      </label>
      <button type="submit" disabled={pending}>
        Enable two-factor authentication
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
  return (
    <>
      <p role="status">
        Two-factor authentication is enabled. Save these recovery codes in a
        safe place. Each code works once.
      </p>
      <ul className="recovery-codes">
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onDone}>
        I saved my recovery codes
      </button>
    </>
  );
}
