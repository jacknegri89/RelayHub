import { getLocale } from "../server/locale";
import { LanguageSwitch } from "../components/locale";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "../server/auth";
import { Brand } from "../components/brand";
import { SpacetimeHero } from "../components/spacetime-hero";
import { WebhookExamples } from "../components/webhook-examples";
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
      value: "202 · 200 · 409",
      text: t(
        "202 means a new event was accepted. While it is on record, the same source can resend the same ID and body for a 200. Reusing that ID with a different body gives a 409.",
        "202 indica che RelayHub ha accettato un nuovo evento. Finché è in archivio, la stessa sorgente può rinviare lo stesso ID e contenuto e ricevere un 200. Se cambia il contenuto, riceve un 409.",
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
        "For temporary failures such as a 503, RelayHub waits before trying again. After the automatic attempts run out, an admin can fix the destination and retry the delivery.",
        "Per errori temporanei come un 503, RelayHub attende prima di riprovare. Esauriti i tentativi automatici, un amministratore può correggere la destinazione e riavviare la consegna.",
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
            <h1 id="hero-title">
              <span className={styles.line}>
                <span data-intro="line">
                  {t("One webhook.", "Un webhook.")}
                </span>
              </span>
              <span className={styles.line}>
                <span data-intro="line">
                  <em>{t("Many destinations.", "Più destinazioni.")}</em>
                </span>
              </span>
            </h1>
            <p className={styles.lede} data-intro="lede">
              {t(
                "Use RelayHub when several apps need to act on the same event. It verifies the message from your app and forwards it to the services you choose. Your dashboard shows who received it and which deliveries need another attempt.",
                "RelayHub serve quando più app devono reagire allo stesso evento. Verifica la firma del messaggio e lo inoltra ai servizi che scegli. Nel pannello vedi chi l’ha ricevuto e quali consegne sono da riprovare.",
              )}
            </p>
            <div className={styles.useCase} data-intro="case">
              <h2>{t("When an order comes in", "Quando arriva un ordine")}</h2>
              <p>
                {t(
                  "Your shop sends the order once. The warehouse can pack it and the email service can notify the customer, even if billing is offline. RelayHub retries the billing delivery automatically.",
                  "Il negozio invia l’ordine una volta sola. Il magazzino può preparare il pacco e il servizio email avvisare il cliente anche se la fatturazione è offline. RelayHub ritenta quella consegna in automatico.",
                )}
              </p>
            </div>
            <div className={styles.actions} data-intro="actions">
              <a className={styles.primary} href="#webhooks">
                {t("Explore webhook examples", "Esplora gli esempi")}
                <span aria-hidden="true">↓</span>
              </a>
              <a className={styles.secondary} href="#journey">
                {t("Follow one event", "Segui un evento")}
              </a>
            </div>
          </div>
          <SpacetimeHero />
        </section>

        <WebhookExamples />
        <JourneyStory />

        <section className={styles.ledger} aria-labelledby="ledger-title">
          <div className={styles.ledgerHead} data-reveal>
            <h2 id="ledger-title">
              {t("How to read a delivery.", "Come leggere una consegna.")}
            </h2>
            <p className={styles.sectionNote}>
              {t(
                "First check whether RelayHub accepted the event. Then check each destination separately. A sender can receive a 202 while the warehouse is still offline.",
                "Controlla prima se RelayHub ha accettato l’evento, poi l’esito di ogni destinazione. Il mittente può ricevere un 202 anche se il magazzino è ancora offline.",
              )}
            </p>
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
            <div>
              <h2 id="closing-title">
                {t(
                  "Put your first event on the timeline.",
                  "Metti il tuo primo evento sulla linea del tempo.",
                )}
              </h2>
              <p>
                {t(
                  "A source is the app that sends the message. A destination is the web address where another app receives it. Connect them in your workspace to make your first delivery.",
                  "La sorgente è l’app che invia il messaggio. La destinazione è l’indirizzo web a cui lo riceve un’altra app. Collegale nell’area di lavoro per la tua prima consegna.",
                )}
              </p>
              <Link className={styles.primary} href={accountHref}>
                {accountLabel}
                <span aria-hidden="true">→</span>
              </Link>
            </div>
            <ol className={styles.setupSteps}>
              <li>
                {t(
                  "Create your organization and add a source.",
                  "Crea l’organizzazione e aggiungi una sorgente.",
                )}
              </li>
              <li>
                {t(
                  "Add a destination and link it to that source.",
                  "Aggiungi una destinazione e collegala alla sorgente.",
                )}
              </li>
              <li>
                {t(
                  "Send a request signed for RelayHub and open Deliveries to see the result.",
                  "Invia una richiesta firmata per RelayHub e apri Consegne per vedere l’esito.",
                )}
              </li>
            </ol>
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
