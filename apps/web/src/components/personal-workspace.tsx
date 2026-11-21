import type { ReactNode } from "react";
import Link from "next/link";
import { getLocale } from "../server/locale";
import { InterfaceIcon, type IconName } from "./interface-icon";
import { SectionGuide } from "./section-guide";
import styles from "./personal-workspace.module.css";

const sections = [
  {
    id: "organizations",
    href: "/workspace",
    icon: "workspace",
    en: "Organizations",
    it: "Organizzazioni",
  },
  {
    id: "profile",
    href: "/workspace/profile",
    icon: "account",
    en: "Profile",
    it: "Profilo",
  },
  {
    id: "security",
    href: "/workspace/security",
    icon: "security",
    en: "Security",
    it: "Sicurezza",
  },
] as const satisfies readonly {
  id: string;
  href: string;
  icon: IconName;
  en: string;
  it: string;
}[];

export async function PersonalWorkspace({
  current,
  title,
  guideTitle,
  guide,
  children,
}: {
  current: (typeof sections)[number]["id"];
  title: string;
  guideTitle: string;
  guide: string;
  children: ReactNode;
}) {
  const { t } = await getLocale();
  return (
    <main id="main" className={styles.layout}>
      <aside className={styles.rail}>
        <nav
          className={styles.nav}
          aria-label={t("Personal workspace", "Area personale")}
        >
          {sections.map((section) => (
            <Link
              href={section.href}
              key={section.id}
              aria-current={(current === section.id && "page") || undefined}
            >
              <InterfaceIcon name={section.icon} />
              {t(section.en, section.it)}
            </Link>
          ))}
        </nav>
        <div className={styles.guide}>
          <SectionGuide title={guideTitle}>{guide}</SectionGuide>
        </div>
      </aside>
      <div className={styles.content}>
        <h1 className={styles.heading}>{title}</h1>
        <div className={styles.body}>{children}</div>
      </div>
    </main>
  );
}
