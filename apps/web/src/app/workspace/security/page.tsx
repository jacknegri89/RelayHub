import { getLocale } from "../../../server/locale";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../../server/auth";
import { AccountSecurity } from "../../../components/account-security";
import { PageHeading } from "../../../components/page-heading";
import { SectionGuide } from "../../../components/section-guide";
import { accountEmailConfigured } from "@relayhub/shared/mail";
import { ActionForm } from "../../../components/forms";

export async function generateMetadata() {
  const { t } = await getLocale();
  return { title: t("Account security", "Sicurezza dell’account") };
}

export default async function SecurityPage() {
  const { t } = await getLocale();
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }
  return (
    <main id="main" className="guided-page">
      <SectionGuide
        title={t(
          "Keep access to your account",
          "Proteggi l’accesso al tuo account",
        )}
      >
        {t(
          "An authenticator app generates a fresh code for each sign-in. During setup, confirm a code and save your recovery codes somewhere you can reach if you lose your phone.",
          "L’app di autenticazione genera i codici per l’accesso. Durante la configurazione, conferma un codice e conserva quelli di recupero in un luogo accessibile anche se perdi il telefono.",
        )}
      </SectionGuide>
      <div>
        <PageHeading title={t("Account security", "Sicurezza dell’account")} />
        {accountEmailConfigured() && (
          <section>
            <h2>{t("Account email", "Email dell’account")}</h2>
            {session.user.emailVerified && (
              <p>
                {t("Verified address", "Indirizzo verificato")} ·{" "}
                {session.user.email}
              </p>
            )}
            {!session.user.emailVerified && (
              <>
                <p>
                  {t(
                    "Verify your address to enable password recovery.",
                    "Verifica il tuo indirizzo per attivare il recupero password.",
                  )}{" "}
                  {session.user.email}
                </p>
                <ActionForm
                  endpoint="/api/account-email/request-verification"
                  label={t("Send verification link", "Invia link di verifica")}
                  successMessage="verification_requested"
                />
              </>
            )}
          </section>
        )}
        <AccountSecurity enabled={Boolean(session.user.twoFactorEnabled)} />
      </div>
    </main>
  );
}
