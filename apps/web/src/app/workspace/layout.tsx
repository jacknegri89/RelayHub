import { getLocale } from "../../server/locale";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../server/auth";
import { LanguageSwitch } from "../../components/locale";
import { Brand } from "../../components/brand";
import { ActionForm } from "../../components/forms";
import { PolicyLinks } from "../../components/policy-links";
import Link from "next/link";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = await getLocale();
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (!session) {
    redirect("/login");
  }
  return (
    <>
      <header className="topbar">
        <Link
          href="/"
          aria-label={t("RelayHub home", "Pagina iniziale di RelayHub")}
        >
          <Brand />
        </Link>
        <div className="account">
          <span>{session.user.email}</span>
          <LanguageSwitch />
          <Link href="/workspace/security">{t("Security", "Sicurezza")}</Link>
          <ActionForm
            endpoint="/api/auth/sign-out"
            label={t("Sign out", "Esci")}
            nextPath="/login"
          />
        </div>
      </header>
      {children}
      <footer className="workspace-footer">
        <PolicyLinks />
      </footer>
    </>
  );
}
