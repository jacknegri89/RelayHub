import { getLocale } from "../../server/locale";
import { LanguageSwitch } from "../../components/locale";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Brand } from "../../components/brand";
import { ActionForm } from "../../components/forms";
import { VerifySignIn } from "../../components/verify-sign-in";
import { AuthTrace } from "../../components/auth-trace";
import { PageHeading } from "../../components/page-heading";
import { issueFormProof } from "../../server/form-proof";
import { PolicyLinks } from "../../components/policy-links";
import { SectionGuide } from "../../components/section-guide";
import {
  AccountMailPage,
  accountMailTitle,
} from "../../components/account-mail-page";
import { accountEmailConfigured } from "@relayhub/shared/mail";

type AuthParams = { params: Promise<{ authPage: string }> };
const mailPages = new Set([
  "forgot-password",
  "reset-password",
  "confirm-email",
]);

export async function generateMetadata({ params }: AuthParams) {
  const { authPage } = await params;
  const { t } = await getLocale();
  if (mailPages.has(authPage) && accountEmailConfigured()) {
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
  if (mailEnabled && mailPages.has(authPage)) {
    return <AccountMailPage page={authPage} />;
  }
  if (!["login", "register", "verify"].includes(authPage)) {
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
  let step: "login" | "register" | "verify" = "login";
  if (registering) {
    step = "register";
  }
  if (verifying) {
    title = t("Verify your sign-in", "Verifica il tuo accesso");
    step = "verify";
  }
  return (
    <main id="main" className="auth-shell">
      <aside className="auth-aside">
        <Link
          href="/"
          aria-label={t("RelayHub home", "Pagina iniziale di RelayHub")}
        >
          <Brand />
        </Link>
        <LanguageSwitch />

        <div className="auth-context">
          <AuthGuide step={step} />
          <AuthTrace step={step} />
        </div>
      </aside>
      <section className="auth-content">
        <div className="auth-panel">
          <PageHeading title={title} />
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
          <PolicyLinks />
        </div>
      </section>
    </main>
  );
}

async function AuthGuide({ step }: { step: "login" | "register" | "verify" }) {
  const { t } = await getLocale();
  if (step === "verify") {
    return (
      <SectionGuide
        title={t(
          "Have your phone ready",
          "Tieni a portata di mano il telefono",
        )}
      >
        {t(
          "Open the RelayHub entry in your authenticator app. If you have lost access to the app, use one of the recovery codes you saved during setup.",
          "Apri la voce RelayHub nell’app di autenticazione. Se hai perso l’accesso all’app, usa uno dei codici di recupero salvati durante la configurazione.",
        )}
      </SectionGuide>
    );
  }
  if (step === "register") {
    return (
      <SectionGuide
        title={t(
          "Open your first workspace",
          "Apri la tua prima area di lavoro",
        )}
      >
        {t(
          "Enter your name, email and a password of at least 12 characters. After registration, create an organization or share your account ID with the owner of an existing one.",
          "Inserisci nome, email e una password di almeno 12 caratteri. Dopo la registrazione puoi creare un’organizzazione o condividere l’ID del tuo account con il proprietario di una già esistente.",
        )}
      </SectionGuide>
    );
  }
  return (
    <SectionGuide
      title={t("Return to your workspace", "Rientra nella tua area di lavoro")}
    >
      {t(
        "Use the email and password you registered with. After signing in, choose the organization whose events you want to follow.",
        "Usa l’email e la password scelte durante la registrazione. Dopo l’accesso, scegli l’organizzazione di cui vuoi seguire gli eventi.",
      )}
    </SectionGuide>
  );
}
