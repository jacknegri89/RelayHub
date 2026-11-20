import { getLocale } from "../../server/locale";
import { LanguageSwitch } from "../../components/locale";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Brand } from "../../components/brand";
import { ActionForm } from "../../components/forms";
import { AuthTrace } from "../../components/auth-trace";
import { PageHeading } from "../../components/page-heading";
import { issueFormProof } from "../../server/form-proof";
import { PolicyLinks } from "../../components/policy-links";

type AuthParams = { params: Promise<{ authPage: string }> };

export async function generateMetadata({ params }: AuthParams) {
  const { authPage } = await params;
  const { t } = await getLocale();
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
  if (!["login", "register", "verify"].includes(authPage)) {
    notFound();
  }
  await connection();
  const registering = authPage === "register";
  const verifying = authPage === "verify";
  let title = t("Sign in", "Accedi");
  let endpoint = "/api/auth/sign-in/email";
  let passwordAutocomplete = "current-password";
  if (registering) {
    title = t("Create an account", "Crea un account");
    endpoint = "/api/auth/sign-up/email";
    passwordAutocomplete = "new-password";
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
          <AuthCaption step={step} />
          <AuthTrace step={step} />
          <p>
            {t(
              "Accept signed events, route them to your destinations, and inspect every attempt.",
              "Ricevi eventi firmati, inviali alle tue destinazioni e controlla ogni tentativo di consegna.",
            )}
          </p>
        </div>
      </aside>
      <section className="auth-content">
        <div className="auth-panel">
          <PageHeading title={title} />
          {verifying && <VerifySignIn />}
          {!verifying && (
            <ActionForm endpoint={endpoint} label={title} nextPath="/workspace">
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
                  required
                />
              </label>
            </ActionForm>
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

async function AuthCaption({
  step,
}: {
  step: "login" | "register" | "verify";
}) {
  const { t } = await getLocale();
  if (step === "verify") {
    return (
      <p className="auth-caption">
        {t("One more ", "Serve una ")}
        <em>{t("signature.", "seconda firma.")}</em>
      </p>
    );
  }
  if (step === "register") {
    return (
      <p className="auth-caption">
        {t("Open your ", "Apri il tuo ")}
        <em>relay.</em>
      </p>
    );
  }
  return (
    <p className="auth-caption">
      {t("Back on the ", "Di nuovo sulla ")}
      <em>{t("timeline.", "linea del tempo.")}</em>
    </p>
  );
}

async function VerifySignIn() {
  const { t } = await getLocale();
  return (
    <>
      <p>
        {t(
          "Enter the six-digit code from your authenticator app.",
          "Inserisci il codice a sei cifre generato dalla tua app di autenticazione.",
        )}
      </p>
      <ActionForm
        endpoint="/api/auth/two-factor/verify-totp"
        label={t("Verify code", "Verifica codice")}
        nextPath="/workspace"
      >
        <label>
          {t("Authenticator code", "Codice di autenticazione")}
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
        </label>
      </ActionForm>
      <details className="factor-details">
        <summary>
          {t("Use a recovery code", "Usa un codice di recupero")}
        </summary>
        <ActionForm
          endpoint="/api/auth/two-factor/verify-backup-code"
          label={t("Verify recovery code", "Verifica codice di recupero")}
          nextPath="/workspace"
        >
          <label>
            {t("Recovery code", "Codice di recupero")}
            <input
              name="code"
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              required
            />
          </label>
        </ActionForm>
      </details>
      <p>
        <Link href="/login">{t("Back to sign in", "Torna all’accesso")}</Link>
      </p>
    </>
  );
}
