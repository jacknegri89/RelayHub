import { getLocale } from "../server/locale";
import { LanguageSwitch } from "../components/locale";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "../server/auth";
import { Brand } from "../components/brand";
import { SpacetimeHero } from "../components/spacetime-hero";
import { JourneyStory } from "../components/journey-story";
import { LandingMotion } from "../components/landing-motion";
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

  const ledger = [
    {
      key: "signature",
      label: t("Signature", "Firma"),
      value: "HMAC-SHA256 · v1",
      text: t(
        "Per-source secret over timestamp and raw body. Five-minute replay window by default.",
        "Chiave per sorgente su timestamp e corpo grezzo. Finestra anti-replay di cinque minuti, per impostazione predefinita.",
      ),
    },
    {
      key: "acceptance",
      label: t("Acceptance", "Accettazione"),
      value: "202 · 200",
      text: t(
        "New events answer 202 with their deliveries. A repeated event ID answers 200 and changes nothing.",
        "I nuovi eventi rispondono 202 con le loro consegne. Un ID evento ripetuto risponde 200 e non cambia nulla.",
      ),
    },
    {
      key: "delivery",
      label: t("Delivery", "Consegna"),
      value: t("At least once", "Almeno una volta"),
      text: t(
        "Every request carries X-RelayHub-Delivery-Id, stable across retries, so receivers can deduplicate.",
        "Ogni richiesta include X-RelayHub-Delivery-Id, stabile tra i tentativi, così il destinatario può evitare duplicati.",
      ),
    },
    {
      key: "retry",
      label: t("Retries", "Nuovi tentativi"),
      value: t("5 attempts", "5 tentativi"),
      text: t(
        "Up to five by default. 429 and 5xx answers back off exponentially with jitter and honour Retry-After; failed deliveries can be retried by hand.",
        "Fino a cinque per impostazione predefinita. Le risposte 429 e 5xx attendono in modo esponenziale con variazione casuale e rispettano Retry-After; le consegne fallite si possono riprovare a mano.",
      ),
    },
    {
      key: "privacy",
      label: t("Payloads", "Contenuti"),
      value: t("Encrypted at rest", "Cifrati a riposo"),
      text: t(
        "The workspace shows size and SHA-256, never the body. Signing secrets are encrypted too.",
        "L’area di lavoro mostra dimensione e SHA-256, mai il contenuto. Anche le chiavi di firma sono cifrate.",
      ),
    },
    {
      key: "access",
      label: t("Access", "Accesso"),
      value: t("Roles · 2FA", "Ruoli · 2FA"),
      text: t(
        "Owner, admin and viewer roles per organization, with authenticator codes and one-use recovery codes.",
        "Ruoli proprietario, amministratore e lettore per organizzazione, con codici di autenticazione e codici di recupero monouso.",
      ),
    },
  ];

  return (
    <LandingMotion className={styles.landing}>
      <header className={styles.header} data-intro="header">
        <Link
          href="/"
          aria-label={t("RelayHub home", "Pagina iniziale di RelayHub")}
        >
          <Brand />
        </Link>
        <nav aria-label={t("Main navigation", "Navigazione principale")}>
          <LanguageSwitch />
          <Link className={styles.navAccount} href={navigationHref}>
            {navigationLabel}
          </Link>
        </nav>
      </header>
      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.copy}>
            <p className={styles.kicker} data-intro="kicker">
              {t(
                "Webhook gateway for signed events",
                "Gateway per webhook firmati",
              )}
            </p>
            <h1 id="hero-title">
              <span className={styles.line}>
                <span data-intro="line">
                  {t("Every webhook,", "Ogni webhook,")}
                </span>
              </span>
              <span className={styles.line}>
                <span data-intro="line">
                  {t("from ", "dalla ")}
                  <em>{t("signature", "firma")}</em>
                </span>
              </span>
              <span className={styles.line}>
                <span data-intro="line">
                  {t("to ", "alla ")}
                  <em>{t("delivery.", "consegna.")}</em>
                </span>
              </span>
            </h1>
            <p className={styles.lede} data-intro="lede">
              {t(
                "RelayHub verifies each signed event, routes it to your endpoints and records every delivery attempt. When an endpoint fails, you watch the retry happen.",
                "RelayHub verifica ogni evento firmato, lo instrada ai tuoi endpoint e registra ogni tentativo di consegna. Quando un endpoint non risponde, vedi partire il nuovo tentativo.",
              )}
            </p>
            <div className={styles.actions} data-intro="actions">
              <Link className={styles.primary} href={accountHref}>
                {accountLabel}
                <span aria-hidden="true">→</span>
              </Link>
              <a className={styles.secondary} href="#journey">
                {t("Follow one event", "Segui un evento")}
              </a>
            </div>
          </div>
          <SpacetimeHero />
        </section>

        <JourneyStory />

        <section className={styles.ledger} aria-labelledby="ledger-title">
          <div className={styles.ledgerHead} data-reveal>
            <p className={styles.eyebrow}>{t("On the record", "Agli atti")}</p>
            <h2 id="ledger-title">
              {t(
                "What stays true for every event.",
                "Quello che vale per ogni evento.",
              )}
            </h2>
          </div>
          <dl className={styles.ledgerRows} data-reveal-list>
            {ledger.map((row) => (
              <div key={row.key}>
                <dt>{row.label}</dt>
                <dd className={styles.ledgerValue}>{row.value}</dd>
                <dd className={styles.ledgerText}>{row.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <div data-reveal>
            <h2 id="closing-title">
              {t(
                "Put your first event on the timeline.",
                "Metti il tuo primo evento sulla linea del tempo.",
              )}
            </h2>
            <p>
              {t(
                "Create an organization, add a source and a destination, then send a signed request. The workspace shows each attempt as it happens.",
                "Crea un’organizzazione, aggiungi una sorgente e una destinazione, poi invia una richiesta firmata. L’area di lavoro mostra ogni tentativo mentre avviene.",
              )}
            </p>
            <Link className={styles.primary} href={accountHref}>
              {accountLabel}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
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
        <a href="https://github.com/jacknegri89/RelayHub">
          {t("Source on GitHub", "Codice su GitHub")}
        </a>
      </footer>
    </LandingMotion>
  );
}
