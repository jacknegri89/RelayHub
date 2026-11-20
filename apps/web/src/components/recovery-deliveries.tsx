import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getLocale } from "../server/locale";
import { readRecovery } from "../server/recovery-deliveries";
import { PageHeading } from "./page-heading";
import { Time } from "./display";
import { RecoverySelection } from "./recovery-selection";

export async function RecoveryDeliveries({
  organizationId,
  destinationId,
  incidentId,
  after,
  editable,
}: {
  organizationId: string;
  destinationId: string;
  incidentId?: string;
  after?: string;
  editable: boolean;
}) {
  const { t, locale } = await getLocale();
  const identifiers = [destinationId, incidentId, after].filter(
    (id) => id !== undefined,
  );
  if (identifiers.some((id) => !z.uuid().safeParse(id).success)) {
    notFound();
  }
  const report = await readRecovery(
    { organizationId, destinationId },
    incidentId,
    after,
  );
  if (!report) {
    notFound();
  }
  const { destination, incident, rows, hasMore, total } = report;
  const detail =
    "/workspace/" + organizationId + "/destinations/" + destinationId;
  const recovery = detail + "/recovery?incident=" + (incident?.id ?? "");
  const available = destination.enabled && destination.consecutiveFailures < 3;
  let explanation = "";
  if (!destination.enabled) {
    explanation = t(
      "Enable this destination before retrying.",
      "Riattiva la destinazione prima del reinvio.",
    );
  } else if (!available) {
    explanation = t(
      "A new outage is open. Wait for recovery before retrying.",
      "È in corso un nuovo guasto. Attendi il ripristino prima del reinvio.",
    );
  } else if (!editable) {
    explanation = t(
      "An administrator or owner can retry these deliveries.",
      "Un amministratore o il proprietario può reinviare queste consegne.",
    );
  }
  const time = new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "UTC",
    hourCycle: "h23",
  });
  const visibleRows = rows.map((row) => {
    let outcome = t("No HTTP response", "Nessuna risposta HTTP");
    if (row.httpStatus !== null) {
      outcome = "HTTP " + row.httpStatus;
    }
    return {
      id: row.id,
      externalId: row.externalId,
      eventType: row.eventType,
      time: time.format(row.finishedAt) + " UTC",
      outcome,
    };
  });
  return (
    <>
      <Link href={detail} className="back-link">
        ← {destination.name}
      </Link>
      <PageHeading
        title={t("Retry after recovery", "Reinvio dopo il ripristino")}
        description={destination.name}
      />
      {!incident && (
        <p>
          {t(
            "This destination has no recorded recovery yet.",
            "Questa destinazione non ha ancora registrato ripristini.",
          )}
        </p>
      )}
      {incident?.resolvedAt && (
        <section className="panel">
          <h2>
            {t("Recovered", "Ripristino")} ·{" "}
            <Time value={incident.resolvedAt} />
          </h2>
          <p>
            {t(
              "Failed deliveries available to retry",
              "Consegne fallite disponibili per il reinvio",
            )}{" "}
            · <strong>{total}</strong>
          </p>
          {explanation && <p className="muted">{explanation}</p>}
          <RecoverySelection
            key={incident.id + (after ?? "")}
            organizationId={organizationId}
            destinationId={destinationId}
            incidentId={incident.id}
            rows={visibleRows}
            editable={editable && available}
          />
          {(after || hasMore) && (
            <nav
              className="pagination"
              aria-label={t("Recovery pages", "Pagine del ripristino")}
            >
              {after && (
                <Link href={recovery}>{t("First page", "Prima pagina")}</Link>
              )}
              {hasMore && (
                <Link href={recovery + "&after=" + rows[rows.length - 1].id}>
                  {t("Next page", "Pagina successiva")} →
                </Link>
              )}
            </nav>
          )}
        </section>
      )}
    </>
  );
}
