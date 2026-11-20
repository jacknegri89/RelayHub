"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ActionForm } from "./forms";
import { useLocale } from "./locale";

export function AccountLinkForm({ resetting }: { resetting: boolean }) {
  const { t } = useLocale();
  const [token, setToken] = useState<string>();
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (fragment) {
      window.history.replaceState(null, "", window.location.pathname);
      setToken(fragment);
    } else {
      setToken((previous) => previous ?? "");
    }
  }, []);
  if (token === undefined) {
    return null;
  }
  if (complete) {
    let message = t(
      "Your email is verified.",
      "Il tuo indirizzo email è verificato.",
    );
    if (resetting) {
      message = t(
        "Your password has been changed. Sign in again.",
        "La password è stata cambiata. Accedi di nuovo.",
      );
    }
    return <p role="status">{message}</p>;
  }
  if (!token) {
    return (
      <p role="alert">
        {t(
          "Open the complete link from the email.",
          "Apri il link completo ricevuto via email.",
        )}
      </p>
    );
  }
  let endpoint = "/api/account-email/confirm-verification";
  let label = t("Confirm my email", "Conferma il mio indirizzo");
  if (resetting) {
    endpoint = "/api/account-email/reset-password";
    label = t("Save new password", "Salva la nuova password");
  }
  return (
    <>
      {!resetting && (
        <p>
          {t(
            "Sign in to the account that requested this message, then return here.",
            "Accedi all’account che ha richiesto il messaggio, poi torna qui.",
          )}{" "}
          <Link href="/login" target="_blank" rel="noopener">
            {t("Sign in in a new tab", "Accedi in una nuova scheda")}
          </Link>
        </p>
      )}
      <ActionForm
        endpoint={endpoint}
        label={label}
        fields={{ token }}
        onSuccess={() => {
          setToken("");
          setComplete(true);
        }}
      >
        {resetting && (
          <label>
            {t("New password", "Nuova password")}{" "}
            <input
              type="password"
              name="newPassword"
              minLength={12}
              maxLength={128}
              required
              autoComplete="new-password"
              placeholder={t("At least 12 characters", "Almeno 12 caratteri")}
            />
          </label>
        )}
      </ActionForm>
    </>
  );
}
