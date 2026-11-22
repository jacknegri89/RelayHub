"use client";

import Link from "next/link";
import type { LostResponseReport } from "../lost-response-report";
import { InterfaceIcon } from "./interface-icon";
import { useLocale } from "./locale";
import { monitorMessage, RunEvidence, Timestamp } from "./lost-response-test";
import { useLostResponseDashboard } from "./use-lost-response";
import styles from "./lost-response-test.module.css";

function EventRoute({ report }: { report: LostResponseReport }) {
  const { t } = useLocale();
  return (
    <section className={styles.route} aria-labelledby="route-title">
      <h2 id="route-title">{t("Event route", "Percorso dell’evento")}</h2>
      <dl className={styles.steps}>
        <div>
          <dt>
            <InterfaceIcon name="sources" /> {t("Source", "Sorgente")}
          </dt>
          <dd>{report.event.sourceName}</dd>
        </div>
        <div>
          <dt>
            <InterfaceIcon name="events" /> {t("Event type", "Tipo di evento")}
          </dt>
          <dd>
            <code>{report.event.type}</code>
          </dd>
        </div>
        <div>
          <dt>
            <InterfaceIcon name="destinations" />{" "}
            {t("Destination", "Destinazione")}
          </dt>
          <dd>{report.destinationName}</dd>
        </div>
      </dl>
      <dl className={styles.eventMeta}>
        <div>
          <dt>{t("Event ID", "ID evento")}</dt>
          <dd>
            <code>{report.event.id}</code>
          </dd>
        </div>
        <div>
          <dt>{t("Received at", "Ricevuto il")}</dt>
          <dd>
            <Timestamp value={report.event.receivedAt} />
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function LostResponseDashboard({ runId }: { runId: string }) {
  const { t } = useLocale();
  const monitor = useLostResponseDashboard(runId);
  const { phase, issue, report } = monitor;
  const canRefresh =
    phase === "paused" && issue !== "access" && issue !== "missing";
  let message = t("Loading event…", "Caricamento dell’evento…");
  if (phase !== "idle") {
    message = monitorMessage(monitor, t);
  }
  return (
    <main className={styles.dashboard} id="main">
      <Link className={styles.back} href="/lost-response">
        ← {t("Back to the test", "Torna alla prova")}
      </Link>
      <header className={styles.dashboardHead}>
        <div>
          <p>
            {t(
              "Test dashboard · Read only",
              "Dashboard della prova · Sola lettura",
            )}
          </p>
          <h1>{t("Event details", "Dettaglio evento")}</h1>
        </div>
        <div className={styles.reading}>
          <span role="status" aria-atomic="true">
            {message}
          </span>
          {canRefresh && (
            <button
              type="button"
              onClick={monitor.refresh}
              disabled={monitor.rateLimited}
            >
              {t("Resume updates", "Riprendi gli aggiornamenti")}
            </button>
          )}
        </div>
      </header>
      {report && (
        <>
          <EventRoute report={report} />
          <RunEvidence report={report} />
        </>
      )}
    </main>
  );
}
