import { LanguageSwitch } from "./locale";
import { getLocale } from "../server/locale";
import Link from "next/link";
import { Brand } from "./brand";
import { PolicyLinks } from "./policy-links";
import { InterfaceIcon } from "./interface-icon";
import type { ReactNode } from "react";

export async function PolicyPage({
  title,
  guideTitle,
  sections,
  children,
}: {
  title: string;
  guideTitle: string;
  sections: [string, string][];
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
      <div className="guided-page">
        <h1>{title}</h1>
        <aside className="section-guide policy-index">
          <InterfaceIcon name="guide" />
          <h2 id="policy-index-title">{guideTitle}</h2>
          <nav aria-labelledby="policy-index-title">
            {sections.map(([id, label]) => (
              <a href={"#" + id} key={id}>
                {label}
                <InterfaceIcon name="arrowDown" />
              </a>
            ))}
          </nav>
        </aside>
        <article>{children}</article>
      </div>
    </main>
  );
}
