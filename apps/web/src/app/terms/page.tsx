import Link from "next/link";
import { PolicyPage } from "../../components/policy-page";
import { getLocale } from "../../server/locale";
import { publicPageMetadata } from "../../server/public-metadata";

export async function generateMetadata() {
  const { t } = await getLocale();
  return publicPageMetadata(
    "/terms",
    t("Demo terms", "Condizioni della demo"),
    t(
      "How to use the hosted portfolio demo with test data.",
      "Come usare la demo portfolio ospitata con dati di prova.",
    ),
  );
}

export default async function DemoTerms() {
  const { t } = await getLocale();
  return (
    <PolicyPage
      title={t("Demo terms", "Condizioni della demo")}
      guideTitle={t("Using the demo", "Uso della demo")}
      sections={[
        ["service", t("Hosted service", "Servizio ospitato")],
        ["events", t("Test events", "Eventi di prova")],
        ["workspace", t("Your workspace", "La tua area di lavoro")],
      ]}
    >
      <p>{t("Updated 22 November 2026", "Aggiornate il 22 novembre 2026")}</p>
      <h2 id="service">{t("What you can try", "Cosa puoi provare")}</h2>
      <p>
        {t(
          "Giacomo Negri makes this free portfolio demo available at relayhub-webhooks.vercel.app. You can use the public simulator without an account. Register to configure test sources, route signed events and inspect their deliveries. Availability and retention are limited. Keep a separate copy of anything you need for your own tests.",
          "Giacomo Negri mette a disposizione questa demo portfolio gratuita su relayhub-webhooks.vercel.app. Puoi usare il simulatore pubblico senza un account. Registrandoti puoi configurare sorgenti di prova, instradare eventi firmati e verificarne la consegna. Disponibilità e conservazione sono limitate. Tieni una copia separata di ciò che ti serve per i tuoi test.",
        )}
      </p>
      <h2 id="events">
        {t("Use fictional webhook data", "Usa dati fittizi nei webhook")}
      </h2>
      <p>
        {t(
          "Use a test system and destinations you control or have permission to contact. Send fictional orders and events. Keep customer details, real order data, passwords, API keys, payment details and health data out of bodies, URLs and names. Use the dedicated signing secret in the integration settings. Before connecting GitHub, check the repository, commit authors and messages included in push events.",
          "Usa un sistema di prova e destinazioni che controlli o che hai il permesso di contattare. Invia ordini ed eventi fittizi. Escludi da contenuti, URL e nomi i dati di clienti, ordini reali, password, chiavi API, dati di pagamento e sanitari. Usa il segreto di firma dedicato nelle impostazioni dell’integrazione. Prima di collegare GitHub, controlla repository, autori e messaggi dei commit inclusi nei push.",
        )}
      </p>
      <p>
        {t(
          "For accidental submissions, disable the source and contact the operator with the event ID and time. If the event has already reached your destination, check that copy too.",
          "In caso di invio accidentale disattiva la sorgente e segnala al gestore l’ID evento e l’orario. Se l’evento ha già raggiunto la tua destinazione, verifica anche quella copia.",
        )}{" "}
        <a href="mailto:negrigiacomo435@gmail.com">negrigiacomo435@gmail.com</a>
        .
      </p>
      <h2 id="workspace">
        {t("Managing and leaving a workspace", "Gestire e lasciare uno spazio")}
      </h2>
      <p>
        {t(
          "Give members only the access they need. Keep account credentials, signing secrets and read keys private. A delayed response can cause another delivery of the same event. Use the delivery ID to avoid acting twice. Account closure and data export are available from your profile. These terms apply to the hosted demo and preserve your mandatory legal rights.",
          "Concedi ai membri solo gli accessi necessari. Custodisci credenziali, segreti di firma e chiavi di lettura. Una risposta tardiva può causare un nuovo tentativo per lo stesso evento. Usa l’ID di consegna per evitare di eseguire un’operazione due volte. Dal profilo puoi esportare i dati e chiudere l’account. Queste condizioni riguardano la demo ospitata e lasciano impregiudicati i tuoi diritti inderogabili.",
        )}{" "}
        <Link href="/privacy#rights">
          {t("Account data and rights", "Dati dell’account e diritti")}
        </Link>
        .
      </p>
    </PolicyPage>
  );
}
