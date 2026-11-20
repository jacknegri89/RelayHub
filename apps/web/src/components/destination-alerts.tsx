import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "@relayhub/db";
import { z } from "zod";
import type { Query } from "../app/workspace/[organizationId]/[[...section]]/page";
import {
  readAlerts,
  readDestinationReport,
  type DestinationAlert,
} from "../server/destination-monitoring";
import { getLocale } from "../server/locale";
import { DestinationHistory } from "./destination-history";
import { DestinationEmailSettings } from "./destination-email-settings";
import { PageHeading } from "./page-heading";
import { Time } from "./display";
import styles from "./destination-alerts.module.css";

const PAGE_SIZE = 20;
const MAX_PAGE = 500;

async function AlertList({
  organizationId,
  alerts,
}: {
  organizationId: string;
  alerts: DestinationAlert[];
}) {
  const { t } = await getLocale();
  return (
    <ol
      className={styles.feed}
      aria-label={t("Alert history", "Registro avvisi")}
    >
      {alerts.map((alert) => {
        const destinationPath =
          "/workspace/" +
          organizationId +
          "/destinations/" +
          alert.destinationId;
        let label = t("Outage detected", "Guasto rilevato");
        if (alert.kind === "recovery") {
          label = t("Recovered", "Ripristino");
        }
        return (
          <li key={alert.id + alert.kind} data-kind={alert.kind}>
            <span className={styles.transition}>{label}</span>
            <div className={styles.alertDestination}>
              <Link href={destinationPath}>{alert.name}</Link>
              {alert.kind === "recovery" && (
                <Link
                  className={styles.recoveryLink}
                  href={destinationPath + "/recovery?incident=" + alert.id}
                >
                  {t(
                    "Review failed deliveries",
                    "Esamina le consegne rimaste fallite",
                  )}
                </Link>
              )}
            </div>
            <Time value={new Date(alert.at)} />
          </li>
        );
      })}
    </ol>
  );
}

export async function DestinationAlertPage({
  organizationId,
  query,
}: {
  organizationId: string;
  query: Query;
}) {
  const { t } = await getLocale();
  const openOnly = query.view === "open";
  let destination: { id: string; name: string } | null = null;
  if (query.destination !== undefined) {
    const id = z.uuid().safeParse(query.destination);
    if (!id.success) {
      notFound();
    }
    destination = await database().webhookDestination.findFirst({
      where: { id: id.data, organizationId },
      select: { id: true, name: true },
    });
    if (!destination) {
      notFound();
    }
  }
  let page = 1;
  const requestedPage = Number(query.page);
  if (Number.isSafeInteger(requestedPage) && requestedPage > 1) {
    page = Math.min(requestedPage, MAX_PAGE);
  }
  const rows = await readAlerts(
    organizationId,
    { onlyOpen: openOnly, destinationId: destination?.id },
    PAGE_SIZE + 1,
    (page - 1) * PAGE_SIZE,
  );
  const path = "/workspace/" + organizationId + "/alerts";
  function href(onlyOpen: boolean, number = 1) {
    const params = new URLSearchParams();
    if (destination) {
      params.set("destination", destination.id);
    }
    if (onlyOpen) {
      params.set("view", "open");
    }
    if (number > 1) {
      params.set("page", String(number));
    }
    if (params.size) {
      return path + "?" + params;
    }
    return path;
  }
  let empty = t("No alerts yet.", "Nessun avviso finora.");
  if (openOnly) {
    empty = t("No open outages.", "Nessun guasto aperto.");
  }
  if (page > 1) {
    empty = t(
      "No more alerts on this page.",
      "Nessun altro avviso in questa pagina.",
    );
  }
  return (
    <>
      <PageHeading
        title={t("Destination alerts", "Avvisi destinazioni")}
        description={t(
          "Three consecutive failed attempts open an outage. The next successful response marks its recovery.",
          "Tre tentativi falliti consecutivi aprono un guasto. La prima risposta riuscita ne segnala il ripristino.",
        )}
      />
      {destination && (
        <p className={styles.scope}>
          {destination.name}{" "}
          <Link href={path}>
            {t("Show all destinations", "Mostra tutte le destinazioni")}
          </Link>
        </p>
      )}
      <nav
        className={styles.filters}
        aria-label={t("Filter alerts", "Filtra avvisi")}
      >
        <Link
          aria-current={(!openOnly && "page") || undefined}
          href={href(false)}
        >
          {t("All alerts", "Tutti gli avvisi")}
        </Link>
        <Link
          aria-current={(openOnly && "page") || undefined}
          href={href(true)}
        >
          {t("Open outages", "Guasti aperti")}
        </Link>
      </nav>
      {rows.length > 0 && (
        <AlertList
          organizationId={organizationId}
          alerts={rows.slice(0, PAGE_SIZE)}
        />
      )}
      {!rows.length && <p className="empty">{empty}</p>}
      {(page > 1 || rows.length > PAGE_SIZE) && (
        <nav className="pagination" aria-label={t("Pagination", "Paginazione")}>
          {page > 1 && (
            <Link href={href(openOnly, page - 1)}>
              {t("← Previous", "← Precedente")}
            </Link>
          )}
          <span>
            {t("Page", "Pagina")} {page}
          </span>
          {rows.length > PAGE_SIZE && page < MAX_PAGE && (
            <Link href={href(openOnly, page + 1)}>
              {t("Next →", "Successiva →")}
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

export async function DestinationDetail({
  organizationId,
  id,
  userId,
  initialDay,
}: {
  organizationId: string;
  id: string;
  userId: string;
  initialDay?: string;
}) {
  const { locale, t } = await getLocale();
  if (!z.uuid().safeParse(id).success) {
    notFound();
  }
  const report = await readDestinationReport(organizationId, id);
  if (!report) {
    notFound();
  }
  const { destination, days, alerts } = report;
  const base = "/workspace/" + organizationId;
  const destinationPath = base + "/destinations/" + id;
  let state = t("Awaiting the first attempt", "In attesa del primo tentativo");
  let tone = "quiet";
  if (destination.lastHealthObservationAt) {
    state = t("Last attempt succeeded", "Ultimo tentativo riuscito");
    tone = "success";
  }
  if (destination.consecutiveFailures > 0) {
    state =
      destination.consecutiveFailures +
      t(" consecutive failed attempts", " tentativi falliti consecutivi");
    if (destination.consecutiveFailures === 1) {
      state = t("One failed attempt", "Un tentativo fallito");
    }
    tone = "warning";
  }
  if (destination.consecutiveFailures >= 3) {
    state = t("Open outage", "Guasto aperto") + " · " + state;
    tone = "outage";
  }
  return (
    <>
      <Link href={base + "/destinations"} className="back-link">
        {t("← Destinations", "← Destinazioni")}
      </Link>
      <PageHeading title={destination.name} />
      <div className={styles.observation} data-tone={tone}>
        <strong>{state}</strong>
        {destination.lastHealthObservationAt && (
          <Time value={destination.lastHealthObservationAt} />
        )}
        {!destination.enabled && (
          <span>{t("Destination disabled", "Destinazione disattivata")}</span>
        )}
      </div>
      <div className={"panel " + styles.historyPanel}>
        <DestinationHistory
          days={days}
          locale={locale}
          attemptsPath={destinationPath + "/attempts"}
          initialDay={initialDay}
        />
      </div>
      <section className="panel">
        <div className="section-head">
          <h2>{t("Recent alerts", "Avvisi recenti")}</h2>
          {alerts.length > 0 && (
            <Link href={base + "/alerts?destination=" + id}>
              {t("All alerts →", "Tutti gli avvisi →")}
            </Link>
          )}
        </div>
        {alerts.length > 0 && (
          <AlertList organizationId={organizationId} alerts={alerts} />
        )}
        {!alerts.length && (
          <p className="muted">
            {t("No alerts yet.", "Nessun avviso finora.")}
          </p>
        )}
      </section>
      <DestinationEmailSettings
        organizationId={organizationId}
        destinationId={id}
        userId={userId}
      />
    </>
  );
}
