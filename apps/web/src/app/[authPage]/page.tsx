import { getLocale } from "../../server/locale";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ActionForm } from "../../components/forms";
import { VerifySignIn } from "../../components/verify-sign-in";
import { issueFormProof } from "../../server/form-proof";
import { AuthShell } from "../../components/auth-shell";
import { PolicyLinks } from "../../components/policy-links";
import {
  AccountMailPage,
  accountMailTitle,
} from "../../components/account-mail-page";
import { accountEmailConfigured } from "@relayhub/shared/mail";
import { accountPages, accountMailPages } from "../../server/account-pages";

type AuthParams = { params: Promise<{ authPage: string }> };

export async function generateMetadata({ params }: AuthParams) {
  const { authPage } = await params;
  const { t } = await getLocale();
  if (accountMailPages.has(authPage) && accountEmailConfigured()) {
    return { title: accountMailTitle(authPage, t), robots: { index: false } };
  }
  if (authPage === "verify") {
    return {
      title: t("Verify your sign-in", "Verifica il tuo accesso"),
      description: t(
        "Complete your sign-in with an authenticator or recovery code.",
        "Completa l’accesso con l’app di autenticazione o un codice di recupero.",
      ),
    };
  }
  if (authPage === "register") {
    return {
      title: t("Create an account", "Crea un account"),
      description: t(
        "Create your RelayHub account to manage webhook deliveries.",
        "Crea il tuo account RelayHub per gestire le consegne dei webhook.",
      ),
    };
  }
  if (authPage === "login") {
    return {
      title: t("Sign in", "Accedi"),
      description: t(
        "Sign in to your RelayHub workspace.",
        "Accedi alla tua area di lavoro su RelayHub.",
      ),
    };
  }
  return { title: t("Page unavailable", "Pagina non disponibile") };
}

export default async function AuthPage({ params }: AuthParams) {
  const { t } = await getLocale();
  const { authPage } = await params;
  const mailEnabled = accountEmailConfigured();
  if (mailEnabled && accountMailPages.has(authPage)) {
    return <AccountMailPage page={authPage} />;
  }
  if (!accountPages.has(authPage)) {
    notFound();
  }
  await connection();
  const registering = authPage === "register";
  const verifying = authPage === "verify";
  let title = t("Sign in", "Accedi");
  let endpoint = "/api/auth/sign-in/email";
  let passwordAutocomplete = "current-password";
  let passwordHint = t("Your account password", "La password del tuo account");
  let nextPath = "/workspace";
  if (registering) {
    title = t("Create an account", "Crea un account");
    endpoint = "/api/auth/sign-up/email";
    passwordAutocomplete = "new-password";
    passwordHint = t("At least 12 characters", "Almeno 12 caratteri");
    if (mailEnabled) {
      nextPath = "/login";
    }
  }
  let description = t(
    "Open your organizations to manage webhooks and review deliveries.",
    "Accedi alle tue organizzazioni per gestire i webhook e consultare le consegne.",
  );
  if (registering) {
    description = t(
      "Create an organization for your webhooks or join an existing one.",
      "Crea un’organizzazione per i tuoi webhook o unisciti a una esistente.",
    );
  }
  if (verifying) {
    title = t("Verify your sign-in", "Verifica il tuo accesso");
    description = t(
      "Use the code from your authenticator app or one of your saved recovery codes.",
      "Usa il codice dell’app di autenticazione o uno dei codici di recupero salvati.",
    );
  }
  return (
    <AuthShell title={title} description={description}>
      {verifying && <VerifySignIn />}
      {!verifying && (
        <ActionForm endpoint={endpoint} label={title} nextPath={nextPath}>
          <input
            type="hidden"
            name="formProof"
            value={issueFormProof(endpoint)}
          />
          <div hidden>
            <label>
              {t("Company website", "Sito aziendale")}{" "}
              <input name="website" autoComplete="off" tabIndex={-1} />
            </label>
          </div>
          {registering && (
            <label>
              {t("Name", "Nome")}{" "}
              <input
                name="name"
                autoComplete="name"
                placeholder={t("e.g. Alex Rossi", "Es. Andrea Rossi")}
                maxLength={80}
                required
              />
            </label>
          )}
          <label>
            Email{" "}
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder={t("you@example.com", "nome@example.com")}
              maxLength={254}
              required
            />
          </label>
          <label>
            Password{" "}
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete={passwordAutocomplete}
              placeholder={passwordHint}
              required
            />
          </label>
          {registering && (
            <div>
              <p className="muted">
                {t(
                  "Use your own email for the account. Send only fictional data in demo webhooks.",
                  "Usa il tuo indirizzo email per l’account. Nei webhook della demo invia solo dati di fantasia.",
                )}
              </p>
              <PolicyLinks />
            </div>
          )}
        </ActionForm>
      )}
      {registering && mailEnabled && (
        <p>
          {t(
            "After registration, sign in and confirm your address using the link in your inbox.",
            "Dopo la registrazione, accedi e conferma l’indirizzo tramite il link ricevuto via email.",
          )}
        </p>
      )}
      {!registering && !verifying && mailEnabled && (
        <p>
          <Link href="/forgot-password">
            {t("Forgot your password?", "Password dimenticata?")}
          </Link>
        </p>
      )}
      {registering && (
        <p>
          {t("Already registered?", "Hai già un account?")}{" "}
          <Link href="/login">{t("Sign in", "Accedi")}</Link>
        </p>
      )}
      {!registering && !verifying && (
        <p>
          {t("New to RelayHub?", "È la prima volta su RelayHub?")}{" "}
          <Link href="/register">
            {t("Create an account", "Crea un account")}
          </Link>
        </p>
      )}
      {!registering && <PolicyLinks />}
    </AuthShell>
  );
}
