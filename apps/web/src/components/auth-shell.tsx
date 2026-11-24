import type { ReactNode } from "react";
import Link from "next/link";
import { getLocale } from "../server/locale";
import { Brand } from "./brand";
import { LanguageSwitch } from "./locale";
import { PageHeading } from "./page-heading";

export async function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { t } = await getLocale();
  return (
    <main id="main" className="auth-shell" tabIndex={-1}>
      <header className="auth-header">
        <Link
          href="/"
          aria-label={t("RelayHub home", "Pagina iniziale di RelayHub")}
        >
          <Brand />
        </Link>
        <LanguageSwitch />
      </header>
      <div className="auth-content">
        <div className="auth-panel">
          <PageHeading title={title} description={description} />
          {children}
        </div>
      </div>
    </main>
  );
}
