"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ActionForm } from "./forms";
import { useLocale } from "./locale";
import styles from "./account-security.module.css";

export function VerifySignIn() {
  const { t } = useLocale();
  const [method, setMethod] = useState<"authenticator" | "recovery">(
    "authenticator",
  );
  const codeInput = useRef<HTMLInputElement>(null);
  const changedMethod = useRef(false);

  useEffect(() => {
    if (changedMethod.current) {
      codeInput.current?.focus();
    }
  }, [method]);

  const options = {
    authenticator: {
      endpoint: "/api/auth/two-factor/verify-totp",
      label: t("Authenticator code", "Codice di autenticazione"),
      submit: t("Verify code", "Verifica codice"),
      hint: t(
        "Enter the six digits shown beside RelayHub in your authenticator app.",
        "Inserisci le sei cifre che vedi accanto a RelayHub nell’app di autenticazione.",
      ),
      alternative: "recovery",
      switchLabel: t("Use a recovery code", "Usa un codice di recupero"),
      field: {
        inputMode: "numeric",
        autoComplete: "one-time-code",
        maxLength: 6,
        pattern: "[0-9]{6}",
        placeholder: "123456",
        className: styles.code,
      },
    },
    recovery: {
      endpoint: "/api/auth/two-factor/verify-backup-code",
      label: t("Recovery code", "Codice di recupero"),
      submit: t("Verify recovery code", "Verifica codice di recupero"),
      hint: t(
        "Enter one of the codes you saved during setup. Each code works once.",
        "Inserisci uno dei codici salvati durante la configurazione. Ogni codice è valido una sola volta.",
      ),
      alternative: "authenticator",
      switchLabel: t(
        "Use an authenticator code",
        "Usa l’app di autenticazione",
      ),
      field: {
        inputMode: "text",
        autoComplete: "off",
        maxLength: 64,
        placeholder: t("One of your saved codes", "Uno dei codici salvati"),
      },
    },
  } as const;
  const active = options[method];
  return (
    <div className={styles.challenge}>
      <p id="challenge-help">{active.hint}</p>
      <ActionForm
        key={method}
        endpoint={active.endpoint}
        label={active.submit}
        nextPath="/workspace"
      >
        <label>
          {active.label}
          <input
            ref={codeInput}
            name="code"
            aria-describedby="challenge-help"
            {...active.field}
            spellCheck={false}
            required
          />
        </label>
      </ActionForm>
      <button
        className={styles.switch}
        type="button"
        onClick={() => {
          changedMethod.current = true;
          setMethod(active.alternative);
        }}
      >
        {active.switchLabel}
      </button>
      <Link href="/login">{t("Back to sign in", "Torna all’accesso")}</Link>
    </div>
  );
}
