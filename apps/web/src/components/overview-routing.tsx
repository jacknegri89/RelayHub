import Link from "next/link";
import { translator, type Locale } from "../locale";
import type { readOverview } from "../server/overview";
import { BrandMark } from "./brand";
import { InterfaceIcon } from "./interface-icon";
import styles from "./overview-routing.module.css";

type Network = Pick<
  Awaited<ReturnType<typeof readOverview>>,
  | "sources"
  | "destinations"
  | "activeRoutes"
  | "hasConfiguredSources"
  | "hasConfiguredDestinations"
>;

function setupStep(
  report: Network,
  awaitingEvent: boolean,
  t: ReturnType<typeof translator>,
) {
  if (!report.sources) {
    if (report.hasConfiguredSources) {
      return {
        text: t(
          "Enable a configured source to receive webhooks.",
          "Attiva una sorgente configurata per ricevere i webhook.",
        ),
        action: t("Manage sources", "Gestisci le sorgenti"),
        path: "/sources",
        viewer: t(
          "An administrator can enable a configured source.",
          "Un amministratore può attivare una sorgente configurata.",
        ),
      };
    }
    return {
      text: t(
        "Choose the app that sends your webhooks.",
        "Scegli l’app che invia i webhook.",
      ),
      action: t("Configure a source", "Configura una sorgente"),
      path: "/sources#create-source",
      viewer: t(
        "An administrator can configure a source to receive webhooks.",
        "Un amministratore può configurare una sorgente per ricevere i webhook.",
      ),
    };
  }
  if (!report.destinations) {
    if (report.hasConfiguredDestinations) {
      return {
        text: t(
          "Enable a configured destination to resume forwarding.",
          "Attiva una destinazione configurata per riprendere l’inoltro.",
        ),
        action: t("Manage destinations", "Gestisci le destinazioni"),
        path: "/destinations",
        viewer: t(
          "An administrator can enable a configured destination.",
          "Un amministratore può attivare una destinazione configurata.",
        ),
      };
    }
    return {
      text: t(
        "Choose where RelayHub should send events.",
        "Scegli dove inviare gli eventi ricevuti.",
      ),
      action: t("Configure a destination", "Configura una destinazione"),
      path: "/destinations#create-destination",
      viewer: t(
        "An administrator can configure a destination for incoming events.",
        "Un amministratore può configurare una destinazione per gli eventi ricevuti.",
      ),
    };
  }
  if (!report.activeRoutes) {
    return {
      text: t(
        "Link a source to a destination to forward events.",
        "Collega una sorgente a una destinazione per inoltrare gli eventi.",
      ),
      action: t("Set up routing", "Configura l’inoltro"),
      path: "/destinations",
      viewer: t(
        "An administrator can link the enabled sources and destinations.",
        "Un amministratore può collegare le sorgenti e le destinazioni attive.",
      ),
    };
  }
  if (awaitingEvent) {
    return {
      text: t(
        "Send a signed webhook from your app, or test a destination from RelayHub.",
        "Invia un webhook firmato dalla tua app oppure prova una destinazione da RelayHub.",
      ),
      action: t("See source endpoints", "Vedi gli endpoint"),
      path: "/sources",
      viewer: t(
        "Waiting for a webhook from an enabled source.",
        "In attesa di un webhook da una sorgente attiva.",
      ),
    };
  }
}

function SetupChecklist({
  report,
  locale,
}: {
  report: Network;
  locale: Locale;
}) {
  const t = translator(locale);
  const missing = t("To configure", "Da configurare");
  const disabled = t("To enable", "Da attivare");
  let routeStatus = t("Waiting for endpoints", "In attesa dei collegamenti");
  if (report.sources > 0 && report.destinations > 0) {
    routeStatus = t("To connect", "Da collegare");
  }
  const steps = [
    {
      name: t("Source", "Sorgente"),
      detail: t(
        "The app that signs and sends the event.",
        "L’app che firma e invia l’evento.",
      ),
      ready: report.sources > 0,
      configured: report.hasConfiguredSources,
    },
    {
      name: t("Destination", "Destinazione"),
      detail: t(
        "The URL that receives a copy.",
        "L’URL che riceve una copia dell’evento.",
      ),
      ready: report.destinations > 0,
      configured: report.hasConfiguredDestinations,
    },
    {
      name: t("Routing rule", "Regola di inoltro"),
      detail: t(
        "Which events go to that destination.",
        "Quali eventi inoltrare a quel destinatario.",
      ),
      ready: report.activeRoutes > 0,
      configured: false,
      pending: routeStatus,
    },
  ];
  const completed = steps.filter((step) => step.ready).length;
  return (
    <>
      <header className={styles.setupHeader}>
        <h2 id="routing-title">
          {t("Set up webhook delivery", "Prepara l’inoltro dei webhook")}
        </h2>
        <span>
          {completed} / {steps.length} {t("ready", "pronti")}
        </span>
      </header>
      <ol className={styles.checklist}>
        {steps.map((step) => {
          let status = step.pending ?? missing;
          if (step.ready) {
            status = t("Ready", "Pronta");
          } else if (step.configured) {
            status = disabled;
          }
          return (
            <li key={step.name} data-ready={step.ready}>
              <span className={styles.stepMarker} aria-hidden="true">
                {step.ready && "✓"}
              </span>
              <div>
                <strong>{step.name}</strong>
                <small>{status}</small>
                <p>{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

export function OverviewRouting({
  report,
  workspace,
  locale,
  editable,
  awaitingEvent = false,
}: {
  report: Network;
  workspace: string;
  locale: Locale;
  editable: boolean;
  awaitingEvent?: boolean;
}) {
  const t = translator(locale);
  const number = new Intl.NumberFormat(locale);
  const next = setupStep(report, awaitingEvent, t);
  let routeLabel = t("active routes", "regole attive");
  if (report.activeRoutes === 1) {
    routeLabel = t("active route", "regola attiva");
  }
  return (
    <section className={styles.map} aria-labelledby="routing-title">
      {awaitingEvent && <SetupChecklist report={report} locale={locale} />}
      {!awaitingEvent && (
        <>
          <h2 id="routing-title">
            {t("Webhook routing", "Percorso dei webhook")}
          </h2>
          <div className={styles.flow} data-connected={report.activeRoutes > 0}>
            <Link className={styles.node} href={workspace + "/sources"}>
              <span className={styles.icon} aria-hidden="true">
                <InterfaceIcon name="sources" />
              </span>
              <span>{t("Enabled sources", "Sorgenti attive")}</span>
              <strong>{number.format(report.sources)}</strong>
            </Link>
            <Link className={styles.hub} href={workspace + "/destinations"}>
              <span className={styles.icon}>
                <BrandMark size={26} />
              </span>
              <span>RelayHub</span>
              <small>
                <b>{number.format(report.activeRoutes)}</b> {routeLabel}
              </small>
            </Link>
            <Link className={styles.node} href={workspace + "/destinations"}>
              <span className={styles.icon} aria-hidden="true">
                <InterfaceIcon name="destinations" />
              </span>
              <span>{t("Enabled destinations", "Destinazioni attive")}</span>
              <strong>{number.format(report.destinations)}</strong>
            </Link>
          </div>
        </>
      )}
      {next && (
        <div className={styles.next}>
          {editable && (
            <>
              <p>{next.text}</p>
              <div className={styles.actions}>
                <Link href={workspace + next.path}>
                  {next.action} <span aria-hidden="true">→</span>
                </Link>
                {awaitingEvent && report.activeRoutes > 0 && (
                  <Link href={workspace + "/destinations?task=test"}>
                    {t(
                      "Prepare a test delivery",
                      "Prepara una consegna di prova",
                    )}{" "}
                    <span aria-hidden="true">→</span>
                  </Link>
                )}
              </div>
            </>
          )}
          {!editable && <p>{next.viewer}</p>}
        </div>
      )}
    </section>
  );
}
