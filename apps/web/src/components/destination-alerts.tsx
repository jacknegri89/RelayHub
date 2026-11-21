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
import { WorkspaceEmpty } from "./workspace-empty";
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
  let allDestinations = path;
  if (openOnly) {
    allDestinations += "?view=open";
  }
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
  let guidance = t(
    "The history shows when a receiving app stops accepting deliveries and when it starts responding again.",
    "Lo storico indica quando un’app destinataria smette di accettare le consegne e quando torna a rispondere.",
  );
  let nextLink = {
    href: "/workspace/" + organizationId + "/destinations",
    label: t("View destinations", "Vedi le destinazioni"),
  };
  if (destination) {
    nextLink = {
      href: "/workspace/" + organizationId + "/destinations/" + destination.id,
      label: t(
        "View destination history",
        "Vedi lo storico della destinazione",
      ),
    };
  }
  if (openOnly) {
    empty = t("No open outages.", "Nessun guasto aperto.");
    guidance = t(
      "There are no unresolved outages in this view. The alert history also includes recoveries.",
      "In questa vista non ci sono guasti da risolvere. Nello storico trovi anche i ripristini.",
    );
    nextLink = {
      href: href(false),
      label: t("View alert history", "Vedi lo storico degli avvisi"),
    };
  }
  if (page > 1) {
    empty = t(
      "No more alerts on this page.",
      "Nessun altro avviso in questa pagina.",
    );
    guidance = t(
      "Return to the first page of this view to see the most recent alerts.",
      "Torna alla prima pagina di questa vista per vedere gli avvisi più recenti.",
    );
    nextLink = { href: href(openOnly), label: t("First page", "Prima pagina") };
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
          <Link href={allDestinations}>
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
      {!rows.length && (
        <WorkspaceEmpty
          kind="alerts"
          title={empty}
          description={guidance}
          link={nextLink}
        />
      )}
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
  email,
  initialDay,
}: {
  organizationId: string;
  id: string;
  userId: string;
  email: string;
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
            {t("No alerts yet.", "Nessun avviso finora.")}{" "}
            {t(
              "Outage and recovery alerts for this destination appear here.",
              "Qui vedrai gli avvisi di guasto e ripristino di questa destinazione.",
            )}
          </p>
        )}
      </section>
      <DestinationEmailSettings
        email={email}
        organizationId={organizationId}
        destinationId={id}
        userId={userId}
      />
    </>
  );
}
