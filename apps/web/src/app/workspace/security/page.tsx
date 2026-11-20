import { getLocale } from "../../../server/locale";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../../server/auth";
import { AccountSecurity } from "../../../components/account-security";
import { PageHeading } from "../../../components/page-heading";
import { SectionGuide } from "../../../components/section-guide";

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
        <AccountSecurity enabled={Boolean(session.user.twoFactorEnabled)} />
      </div>
    </main>
  );
}
