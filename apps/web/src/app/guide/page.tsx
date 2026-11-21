import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "../../server/auth";
import { getLocale } from "../../server/locale";
import { PublicFooter, PublicHeader } from "../../components/public-navigation";
import { JourneyStory } from "../../components/journey-story";
import styles from "../landing.module.css";

export async function generateMetadata() {
  const { t } = await getLocale();
  return {
    title: t("Delivery guide", "Guida alle consegne"),
    description: t(
      "Follow a webhook through verification, routing, delivery and retries.",
      "Segui un webhook dalla verifica della firma alla consegna e ai nuovi tentativi.",
    ),
  };
}

export default async function DeliveryGuide() {
  const { t } = await getLocale();
  const session = await auth().api.getSession({ headers: await headers() });
  const ledger = [
    {
      key: "signature",
      label: t("Signature", "Firma"),
      value: "HMAC-SHA256",
      text: t(
        "RelayHub checks GitHub’s signature on the original request body. For RelayHub v1, the signature also covers the timestamp, with a five-minute window by default.",
        "RelayHub verifica la firma di GitHub sul corpo originale della richiesta. Per il formato RelayHub v1, la firma copre anche il timestamp, con una finestra predefinita di cinque minuti.",
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
    <div className={styles.landing}>
      <PublicHeader signedIn={Boolean(session)} guide />
      <main id="main">
        <header className={styles.guideIntro}>
          <Link className={styles.backToSimulator} href="/#simulator">
            ← {t("Back to the simulator", "Torna al simulatore")}
          </Link>
          <h1>{t("Delivery guide", "Guida alle consegne")}</h1>
          <p>
            {t(
              "Follow an order from the shop to its destinations. See how to read a response and when RelayHub tries again.",
              "Segui un ordine dal negozio alle destinazioni. Scopri come leggere la risposta e quando RelayHub riprova.",
            )}
          </p>
          <nav aria-label={t("On this page", "In questa pagina")}>
            <a href="#journey">{t("Follow one event", "Segui un evento")} ↓</a>
            <a href="#ledger-title">
              {t("Read a delivery", "Leggi una consegna")} ↓
            </a>
          </nav>
        </header>
        <JourneyStory />
        <section className={styles.ledger} aria-labelledby="ledger-title">
          <div className={styles.ledgerHead}>
            <h2 id="ledger-title">
              {t("How to read a delivery.", "Come leggere una consegna.")}
            </h2>
            <p className={styles.sectionNote}>
              {t(
                "First check whether RelayHub accepted the event. Then check each destination separately. A sender can receive a 202 while the warehouse is still offline.",
                "Controlla prima se RelayHub ha accettato l’evento, poi l’esito di ogni destinazione. Il mittente può ricevere un 202 anche se il magazzino è ancora offline.",
              )}
            </p>
            <Link className={styles.guideExamples} href="/#webhooks">
              {t("See webhook examples", "Vedi gli esempi di webhook")} →
            </Link>
          </div>
          <div className={styles.ledgerRows}>
            {ledger.map((row) => (
              <details key={row.key}>
                <summary>
                  <strong>{row.label}</strong>
                  <span>{row.value}</span>
                </summary>
                <p>{row.text}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
