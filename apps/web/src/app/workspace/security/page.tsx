import { getLocale } from "../../../server/locale";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../../server/auth";
import { AccountSecurity } from "../../../components/account-security";
import { PageHeading } from "../../../components/page-heading";

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
    <main id="main" className="security-page">
      <PageHeading title={t("Account security", "Sicurezza dell’account")} />
      <AccountSecurity enabled={Boolean(session.user.twoFactorEnabled)} />
    </main>
  );
}
