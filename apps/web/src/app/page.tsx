import { getLocale } from "../server/locale";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "../server/auth";
import { SpacetimeHero } from "../components/spacetime-hero";
import { WebhookExamples } from "../components/webhook-examples";
import { ApiExplorer } from "../components/api-explorer";
import { PublicFooter, PublicHeader } from "../components/public-navigation";
import { GuideBookmarks } from "../components/guide-bookmarks";
import { InterfaceIcon } from "../components/interface-icon";
import styles from "./landing.module.css";
import { publicPageMetadata } from "../server/public-metadata";

export async function generateMetadata() {
  const { t } = await getLocale();
  return publicPageMetadata(
    "/",
    t("Webhook delivery and monitoring", "Consegna e monitoraggio dei webhook"),
    t(
      "Receive signed webhooks, route them to your endpoints and follow every delivery attempt.",
      "Ricevi webhook firmati, instradali ai tuoi endpoint e segui ogni tentativo di consegna.",
    ),
  );
}

export default async function Home() {
  const { t } = await getLocale();
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  let accountHref = "/register";
  let accountLabel = t("Create an account", "Crea un account");
  if (session) {
    accountHref = "/workspace";
    accountLabel = t("Open workspace", "Apri area di lavoro");
  }

  return (
    <div className={styles.landing}>
      <GuideBookmarks />
      <PublicHeader signedIn={Boolean(session)} />
      <main id="main" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <h1 id="hero-title">
            {t(
              "Send one webhook to multiple services",
              "Invia un webhook a più servizi",
            )}
          </h1>
          <div className={styles.copy}>
            <p className={styles.lede}>
              {t(
                "RelayHub checks the signature and tracks delivery to each destination. If a service goes offline, RelayHub retries that delivery.",
                "RelayHub verifica la firma e registra l’esito di ogni consegna. Se un servizio va offline, riprova la consegna a quel destinatario.",
              )}
            </p>
            <div className={styles.actions}>
              <Link className={styles.primary} href={accountHref}>
                {accountLabel} <InterfaceIcon name="arrow" />
              </Link>
              <a className={styles.secondary} href="#webhooks">
                {t("View examples", "Vedi esempi")}
                <InterfaceIcon name="arrowDown" />
              </a>
            </div>
          </div>
        </section>

        <div className={styles.bench}>
          <SpacetimeHero />
          <aside className={styles.notes} aria-labelledby="order-test-title">
            <section>
              <h2 id="order-test-title">
                {t("Read the HTTP responses", "Leggi le risposte HTTP")}
              </h2>
              <p>
                {t(
                  "RelayHub returns 202 when it accepts the order. Each service returns its own response. A service that returns 204 has received its copy.",
                  "RelayHub risponde con 202 quando accetta l’ordine. Ogni servizio risponde per conto proprio. Il 204 conferma che il servizio ha ricevuto la sua copia.",
                )}
              </p>
              <Link className={styles.noteLink} href="/guide#journey">
                {t("Follow one event", "Segui un evento")}{" "}
                <InterfaceIcon name="arrow" />
              </Link>
              <div>
                <Link className={styles.noteLink} href="/lost-response">
                  {t("Try a lost response", "Prova una risposta persa")}{" "}
                  <InterfaceIcon name="arrow" />
                </Link>
              </div>
            </section>
            <section aria-labelledby="closing-title">
              <h2 id="closing-title" tabIndex={-1}>
                {t("Connect your app", "Collega la tua app")}
              </h2>
              <ol className={styles.setupSteps}>
                <li>
                  {t(
                    "Add a source for your sending app.",
                    "Aggiungi una sorgente per l’app che invia i webhook.",
                  )}
                </li>
                <li>
                  {t(
                    "Add the receiver’s URL as a destination and link it to the source.",
                    "Aggiungi l’URL del destinatario e collegalo alla sorgente.",
                  )}
                </li>
                <li>
                  {t(
                    "Send a signed event, then open Deliveries to see its outcome.",
                    "Invia un evento firmato e apri Consegne per vedere l’esito.",
                  )}
                </li>
              </ol>
              <a className={styles.noteLink} href="#api-explorer">
                {t(
                  "Query events from your terminal",
                  "Consulta gli eventi dal terminale",
                )}{" "}
                <InterfaceIcon name="arrowDown" />
              </a>
            </section>
          </aside>
        </div>
        <WebhookExamples />
        <ApiExplorer />
      </main>
      <PublicFooter />
    </div>
  );
}
