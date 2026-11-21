import { getLocale } from "../../../server/locale";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../../server/auth";
import { AccountSecurity } from "../../../components/account-security";
import { PersonalWorkspace } from "../../../components/personal-workspace";

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
    <PersonalWorkspace
      current="security"
      title={t("Account security", "Sicurezza dell’account")}
      guideTitle={t(
        "Keep access to your account",
        "Proteggi l’accesso al tuo account",
      )}
      guide={t(
        "Your authenticator generates a new code for each sign-in. Keep your recovery codes somewhere you can reach if you lose access to the app.",
        "L’app di autenticazione genera i codici per l’accesso. Conserva i codici di recupero in un posto che puoi raggiungere anche se perdi il telefono.",
      )}
    >
      <AccountSecurity enabled={Boolean(session.user.twoFactorEnabled)} />
    </PersonalWorkspace>
  );
}
