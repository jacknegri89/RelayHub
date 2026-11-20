import { getLocale } from "../server/locale";
import { LanguageSwitch } from "../components/locale";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "../server/auth";
import { Brand } from "../components/brand";
import { RelaySignal } from "../components/relay-signal";
import { PolicyLinks } from "../components/policy-links";
import styles from "./landing.module.css";

export default async function Home() {
  const { t } = await getLocale();
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  let accountHref = "/register";
  let accountLabel = t("Create an account", "Crea un account");
  let navigationHref = "/login";
  let navigationLabel = t("Sign in", "Accedi");
  if (session) {
    accountHref = "/workspace";
    accountLabel = t("Open workspace", "Apri area di lavoro");
    navigationHref = accountHref;
    navigationLabel = accountLabel;
  }
  return (
    <div className={styles.landing}>
      <header className={styles.header}>
        <Link
          href="/"
          aria-label={t("RelayHub home", "Pagina iniziale di RelayHub")}
        >
          <Brand />
        </Link>
        <nav aria-label={t("Main navigation", "Navigazione principale")}>
          <a className={styles.navFlow} href="#delivery-flow">
            {t("Delivery flow", "Come funziona")}
          </a>
          <LanguageSwitch />
          <Link href={navigationHref}>
            {navigationLabel} <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </header>
      <main id="main">
        <section className={styles.hero}>
          <div className={styles.copy}>
            <h1>
              <span>
                <span data-relay-reveal>{t("Webhooks.", "Webhook.")}</span>
              </span>
              <span>
                <span data-relay-reveal>
                  {t("Under control.", "Sotto controllo.")}
                </span>
              </span>
            </h1>
            <p>
              {t(
                "Route signed events, watch every delivery, and recover from failed requests.",
                "Instrada gli eventi firmati, segui ogni consegna e riprova quelle che non sono andate a buon fine.",
              )}
            </p>
            <div className={styles.actions}>
              <Link href={accountHref}>
                {accountLabel} <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
          <RelaySignal />
        </section>
        <section className={styles.flow} aria-labelledby="delivery-flow">
          <h2 id="delivery-flow">
            {t("From source", "Dalla sorgente")}
            <br />
            {t("to receiver.", "a destinazione.")}
          </h2>
          <ol data-relay-flow>
            <li>
              <div>
                <strong>{t("Receive", "Ricevi")}</strong>
                <p>
                  {t(
                    "Verify the signature and accept each event once.",
                    "Verifica la firma e accetta ogni evento una sola volta.",
                  )}
                </p>
              </div>
            </li>
            <li>
              <div>
                <strong>{t("Route", "Instrada")}</strong>
                <p>
                  {t(
                    "Match event types to destinations and queue the deliveries.",
                    "Associa ogni tipo di evento alle sue destinazioni e metti in coda le consegne.",
                  )}
                </p>
              </div>
            </li>
            <li>
              <div>
                <strong>{t("Recover", "Riprova")}</strong>
                <p>
                  {t(
                    "Inspect each attempt and retry failures from the delivery log.",
                    "Controlla i singoli tentativi nel registro e riprova le consegne fallite.",
                  )}
                </p>
              </div>
            </li>
          </ol>
        </section>
      </main>
      <footer className={styles.footer}>
        <Link
          href="/"
          aria-label={t("RelayHub home", "Pagina iniziale di RelayHub")}
        >
          <Brand />
        </Link>
        <PolicyLinks />
        <Link href={accountHref}>
          {accountLabel} <span aria-hidden="true">↗</span>
        </Link>
      </footer>
    </div>
  );
}
