import { getLocale } from "../../server/locale";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../server/auth";
import { LanguageSwitch } from "../../components/locale";
import { Brand } from "../../components/brand";
import { AccountMenu } from "../../components/account-menu";
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
        <div className="topbar-brand">
          <Link
            href="/"
            aria-label={t("RelayHub home", "Pagina iniziale di RelayHub")}
          >
            <Brand />
          </Link>
          <Link className="workspace-shortcut" href="/workspace">
            {t("Workspace", "Area di lavoro")}
          </Link>
        </div>
        <div className="account">
          <LanguageSwitch />
          <AccountMenu
            email={session.user.email}
            name={session.user.name}
            image={session.user.image}
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
