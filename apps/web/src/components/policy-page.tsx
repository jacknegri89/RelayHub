import { LanguageSwitch } from "./locale";
import { getLocale } from "../server/locale";
import Link from "next/link";
import { Brand } from "./brand";
import { PolicyLinks } from "./policy-links";
import type { ReactNode } from "react";

export async function PolicyPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { t } = await getLocale();
  return (
    <main id="main" className="policy-page">
      <header>
        <Link
          href="/"
          aria-label={t("RelayHub home", "Pagina iniziale di RelayHub")}
        >
          <Brand />
        </Link>
        <PolicyLinks />
        <LanguageSwitch />
      </header>
      <article>
        <h1>{title}</h1>
        {children}
      </article>
    </main>
  );
}
