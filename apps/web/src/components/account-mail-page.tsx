import Link from "next/link";
import { getLocale } from "../server/locale";
import { issueFormProof } from "../server/form-proof";
import { AuthShell } from "./auth-shell";
import { ActionForm } from "./forms";
import { AccountLinkForm } from "./account-link-form";

export function accountMailTitle(
  page: string,
  t: (en: string, it: string) => string,
) {
  if (page === "confirm-email") {
    return t("Confirm your email", "Conferma il tuo indirizzo email");
  }
  if (page === "reset-password") {
    return t("Choose a new password", "Scegli una nuova password");
  }
  return t("Forgot your password?", "Password dimenticata?");
}

export async function AccountMailPage({ page }: { page: string }) {
  const { t } = await getLocale();
  const forgot = page === "forgot-password";
  const verifying = page === "confirm-email";
  let guide = t(
    "Use your verified account email. After changing your password, sign in again with your usual second factor if enabled.",
    "Usa l’indirizzo verificato dell’account. Dopo il cambio password, accedi di nuovo con il secondo fattore se è attivo.",
  );
  if (verifying) {
    guide = t(
      "Confirm only if you created this account. Verification lets you use your email to recover your password.",
      "Conferma solo se hai creato tu questo account. La verifica ti permette di usare l’email per recuperare la password.",
    );
  }
  const endpoint = "/api/account-email/request-reset";
  return (
    <AuthShell title={accountMailTitle(page, t)} description={guide}>
      {forgot && (
        <ActionForm
          endpoint={endpoint}
          label={t("Request reset link", "Richiedi link di recupero")}
          successMessage="reset_requested"
        >
          <input
            type="hidden"
            name="formProof"
            value={issueFormProof(endpoint)}
          />
          <div hidden>
            <label>
              {t("Company website", "Sito aziendale")}{" "}
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <label>
            Email{" "}
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              placeholder={t("you@example.com", "nome@example.com")}
            />
          </label>
        </ActionForm>
      )}
      {!forgot && <AccountLinkForm resetting={!verifying} />}
      <p>
        <Link href="/login">{t("Back to sign in", "Torna all’accesso")}</Link>
      </p>
    </AuthShell>
  );
}
