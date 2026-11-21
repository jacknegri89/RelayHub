import { getLocale } from "../server/locale";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "../server/auth";
import { SpacetimeHero } from "../components/spacetime-hero";
import { WebhookExamples } from "../components/webhook-examples";
import { ApiExplorer } from "../components/api-explorer";
import { PublicFooter, PublicHeader } from "../components/public-navigation";
import { LandingMotion } from "../components/landing-motion";
import styles from "./landing.module.css";

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
    <LandingMotion className={styles.landing}>
      <PublicHeader signedIn={Boolean(session)} />
      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <h1 id="hero-title">
            <span className={styles.line}>
              <span data-intro="line">{t("One webhook.", "Un webhook.")}</span>
            </span>
            <span className={styles.line}>
              <span data-intro="line">
                <em>{t("Many destinations.", "Più destinazioni.")}</em>
              </span>
            </span>
          </h1>
          <div className={styles.copy}>
            <p className={styles.lede} data-intro="lede">
              {t(
                "RelayHub verifies webhooks, forwards them to your services and retries when a receiver is offline. Track each delivery in your dashboard.",
                "RelayHub verifica i webhook, li inoltra ai tuoi servizi e riprova se un destinatario è offline. Nel pannello segui ogni consegna.",
              )}
            </p>
            <div className={styles.actions} data-intro="actions">
              <Link className={styles.primary} href={accountHref}>
                {accountLabel} <span aria-hidden="true">→</span>
              </Link>
              <a className={styles.secondary} href="#webhooks">
                {t("View examples", "Vedi esempi")}{" "}
                <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
        </section>

        <div className={styles.bench}>
          <SpacetimeHero />
          <aside className={styles.notes} aria-labelledby="order-test-title">
            <section>
              <h2 id="order-test-title">
                {t("One order, three outcomes", "Un ordine, tre esiti")}
              </h2>
              <p>
                {t(
                  "RelayHub’s 202 means it accepted the order. A 204 next to Warehouse, Billing or Email means that service received its copy. If Billing fails, the other copies stay delivered.",
                  "Il 202 di RelayHub indica che l’ordine è stato accettato. Il 204 accanto a Magazzino, Fatturazione o Email conferma che quel servizio ha ricevuto la sua copia. Un guasto alla fatturazione lascia valide le altre consegne.",
                )}
              </p>
              <Link className={styles.noteLink} href="/guide#journey">
                {t("Follow one event", "Segui un evento")}{" "}
                <span aria-hidden="true">→</span>
              </Link>
              <div>
                <Link className={styles.noteLink} href="/lost-response">
                  {t("Try a lost response", "Prova una risposta persa")}{" "}
                  <span aria-hidden="true">→</span>
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
                <span aria-hidden="true">↓</span>
              </a>
            </section>
          </aside>
        </div>
        <WebhookExamples />
        <ApiExplorer />
      </main>
      <PublicFooter />
    </LandingMotion>
  );
}
