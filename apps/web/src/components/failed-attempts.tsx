import Link from "next/link";
import { notFound } from "next/navigation";
import type { Query } from "../app/workspace/[organizationId]/[[...section]]/page";
import { readFailedAttempts } from "../server/failed-attempts";
import { getLocale } from "../server/locale";
import { stateLabel } from "./display";
import { PageHeading } from "./page-heading";
import styles from "./failed-attempts.module.css";

export async function FailedAttemptsPage({
  organizationId,
  id,
  query,
}: {
  organizationId: string;
  id: string;
  query: Query;
}) {
  if (typeof query.day !== "string" || Array.isArray(query.page)) {
    notFound();
  }
  const day = query.day;
  const report = await readFailedAttempts(
    organizationId,
    id,
    day,
    Number(query.page),
  );
  if (!report) {
    notFound();
  }
  const { locale, t } = await getLocale();
  const base = "/workspace/" + organizationId;
  const destinationPath = base + "/destinations/" + id;
  const pagePath = destinationPath + "/attempts?day=" + day + "&page=";
  const utc = new Date(day + "T00:00:00Z");
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(utc);
  const time = new Intl.DateTimeFormat(locale, {
    timeStyle: "medium",
    timeZone: "UTC",
    hourCycle: "h23",
  });
  const recoveredAt = new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "UTC",
    hourCycle: "h23",
  });
  const counts = new Intl.NumberFormat(locale);
  return (
    <>
      <Link
        className="back-link"
        href={destinationPath + "?day=" + day + "#destination-history"}
      >
        {t("← Back to the chart", "← Torna al grafico")}
      </Link>
      <PageHeading
        title={t("Failed attempts", "Tentativi falliti")}
        description={report.destination.name + " · " + date + " UTC"}
      />
      <p>
        {t("Failures recorded", "Tentativi falliti registrati")}{" "}
        <strong>{counts.format(report.total)}</strong>
      </p>
      {report.available < report.total && (
        <p className="muted">
          {t(
            "Individual records still available",
            "Dettagli ancora disponibili",
          )}{" "}
          {counts.format(report.available)} {t("of", "su")}{" "}
          {counts.format(report.total)}.{" "}
          {t(
            "Daily totals remain available after individual event records expire.",
            "Il totale giornaliero rimane disponibile anche dopo la scadenza dei singoli eventi.",
          )}
        </p>
      )}
      {report.total === 0 && report.available === 0 && (
        <p className="empty">
          {t(
            "No failed attempts on this UTC day.",
            "Nessun tentativo fallito in questo giorno UTC.",
          )}
        </p>
      )}
      {report.rows.length > 0 && (
        <ol
          className={styles.attempts}
          aria-label={t("Failed attempts", "Tentativi falliti")}
        >
          {report.rows.map((attempt) => {
            const { delivery } = attempt;
            const incident = report.resolvedByStreak.get(
              attempt.failureStreakId,
            );
            let response = t("No HTTP response", "Nessuna risposta HTTP");
            if (attempt.httpStatus !== null) {
              response = "HTTP " + attempt.httpStatus;
            }
            return (
              <li key={attempt.id}>
                <div className={styles.result}>
                  {attempt.finishedAt && (
                    <time dateTime={attempt.finishedAt.toISOString()}>
                      {time.format(attempt.finishedAt)} UTC
                    </time>
                  )}
                  <strong>{response}</strong>
                  {attempt.durationMs !== null && (
                    <span>{counts.format(attempt.durationMs)} ms</span>
                  )}
                </div>
                <div className={styles.event}>
                  <Link href={base + "/events/" + delivery.event.id}>
                    {delivery.event.eventType}
                  </Link>
                  <code>{delivery.event.externalId}</code>
                </div>
                <div className={styles.delivery}>
                  <Link href={base + "/deliveries/" + delivery.id}>
                    {t("Delivery · attempt", "Consegna · tentativo")}{" "}
                    {attempt.number}
                  </Link>
                  <span>
                    {t("Current status", "Stato attuale")} ·{" "}
                    {stateLabel(delivery.status, t)}
                  </span>
                  {incident?.resolvedAt && (
                    <Link
                      href={
                        destinationPath + "/recovery?incident=" + incident.id
                      }
                    >
                      {t(
                        "Review deliveries after recovery",
                        "Esamina le consegne dopo il ripristino",
                      )}{" "}
                      ·{" "}
                      <time dateTime={incident.resolvedAt.toISOString()}>
                        {recoveredAt.format(incident.resolvedAt)} UTC
                      </time>
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {report.pages > 1 && (
        <nav className="pagination" aria-label={t("Pagination", "Paginazione")}>
          {report.page > 1 && (
            <Link href={pagePath + (report.page - 1)}>
              {t("← Previous", "← Precedente")}
            </Link>
          )}
          <span>
            {t("Page", "Pagina")} {report.page} {t("of", "di")} {report.pages}
          </span>
          {report.page < report.pages && (
            <Link href={pagePath + (report.page + 1)}>
              {t("Next →", "Successiva →")}
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
