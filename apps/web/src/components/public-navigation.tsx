import Link from "next/link";
import { Brand } from "./brand";
import { InterfaceIcon } from "./interface-icon";
import { LanguageSwitch } from "./locale";
import { PolicyLinks } from "./policy-links";
import { getLocale } from "../server/locale";
import styles from "../app/landing.module.css";

export async function PublicHeader({
  signedIn,
  guide = false,
}: {
  signedIn: boolean;
  guide?: boolean;
}) {
  const { t } = await getLocale();
  let navigationHref = "/login";
  let navigationLabel = t("Sign in", "Accedi");
  if (signedIn) {
    navigationHref = "/workspace/profile";
    navigationLabel = t("Profile", "Profilo");
    if (guide) {
      navigationHref = "/workspace";
      navigationLabel = t("Workspace", "Area di lavoro");
    }
  }
  let introActor: string | undefined = "header";
  let currentGuide: "page" | undefined;
  if (guide) {
    introActor = undefined;
    currentGuide = "page";
  }
  return (
    <header
      className={styles.header}
      data-intro={introActor}
      data-signed-in={signedIn}
    >
      <Link
        href="/"
        aria-label={t("RelayHub home", "Pagina iniziale di RelayHub")}
      >
        <Brand />
      </Link>
      <nav aria-label={t("Main navigation", "Navigazione principale")}>
        <Link
          className={styles.guideLink}
          href="/guide"
          aria-current={currentGuide}
          aria-label={t("Delivery guide", "Guida alle consegne")}
        >
          <InterfaceIcon name="guide" /> <span>{t("Guide", "Guida")}</span>
        </Link>
        <LanguageSwitch />
        <Link className={styles.navAccount} href={navigationHref}>
          {navigationLabel}
        </Link>
      </nav>
    </header>
  );
}

export async function PublicFooter() {
  const { t } = await getLocale();
  return (
    <footer className={styles.footer}>
      <Link
        href="/"
        aria-label={t("RelayHub home", "Pagina iniziale di RelayHub")}
      >
        <Brand />
      </Link>
      <PolicyLinks />
      <a href="https://github.com/jacknegri89/RelayHub">
        {t("Source on GitHub", "Codice su GitHub")}
      </a>
    </footer>
  );
}
