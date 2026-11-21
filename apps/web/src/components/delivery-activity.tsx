import Link from "next/link";
import { translator, type Locale } from "../locale";
import type { readOverview } from "../server/overview";
import styles from "./overview.module.css";

type OverviewReport = Awaited<ReturnType<typeof readOverview>>;
type MetricReport = Pick<
  OverviewReport,
  "counts" | "received" | "inflight" | "comparisonRetained"
>;

function successRate(delivered: number, failed: number) {
  const total = delivered + failed;
  if (!total) {
    return null;
  }
  return delivered / total;
}

export function DeliveryActivity({
  report,
  workspace,
  locale,
}: {
  report: MetricReport;
  workspace: string;
  locale: Locale;
}) {
  const t = translator(locale);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const counts = report.counts;
  const current = successRate(counts.delivered, counts.failed);
  const previous = successRate(counts.previousDelivered, counts.previousFailed);
  let rate = "—";
  let comparison = t("No completed deliveries", "Nessuna consegna conclusa");
  let change = "";
  let tone = "";
  if (current !== null) {
    rate = percent.format(current);
    comparison = t(
      "No completions in the previous 24h",
      "Nessuna consegna conclusa nelle 24 ore precedenti",
    );
  }
  if (!report.comparisonRetained) {
    comparison = t(
      "Comparison needs 48h of retained data",
      "Il confronto richiede 48 ore di storico",
    );
  }
  if (report.comparisonRetained && current !== null && previous !== null) {
    const difference = Math.round((current - previous) * 1000) / 10;
    const signed = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
      signDisplay: "exceptZero",
    });
    change = signed.format(difference) + " pp";
    comparison = t("vs previous 24h", "rispetto alle 24 ore precedenti");
    if (difference > 0) {
      tone = "positive";
    }
    if (difference < 0) {
      tone = "negative";
    }
  }
  return (
    <section className={styles.summary} aria-labelledby="delivery-activity">
      <header className={styles.sectionTitle}>
        <h2 id="delivery-activity">
          {t("Delivery activity", "Attività di consegna")}
        </h2>
        <span>{t("Last 24 hours", "Ultime 24 ore")}</span>
      </header>
      <dl className={styles.metrics}>
        <div>
          <dt>{t("Events received", "Eventi ricevuti")}</dt>
          <dd>{number.format(report.received)}</dd>
          <dd className={styles.detail}>
            {t("In progress now", "Consegne in corso")} ·{" "}
            {number.format(report.inflight)}
          </dd>
        </div>
        <div>
          <dt>{t("Successful deliveries", "Consegne riuscite")}</dt>
          <dd className={styles.success} data-empty={!counts.delivered}>
            {number.format(counts.delivered)}
          </dd>
          <dd className={styles.detail}>
            {t("Mean successful latency", "Latenza media riuscite")} ·{" "}
            {milliseconds(counts.meanSuccessfulMs, number)}
          </dd>
        </div>
        <div>
          <dt>{t("Failed deliveries", "Consegne fallite")}</dt>
          <dd className={styles.failure} data-empty={!counts.failed}>
            {number.format(counts.failed)}
          </dd>
          <dd className={styles.detail}>
            <Link href={workspace + "/deliveries?status=failed"}>
              {t(
                "Full failure history →",
                "Storico completo delle consegne fallite →",
              )}
            </Link>
          </dd>
        </div>
        <div>
          <dt>{t("Success rate", "Tasso di successo")}</dt>
          <dd>{rate}</dd>
          <dd className={styles.detail}>
            <b data-tone={tone}>{change}</b> {comparison}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function milliseconds(
  value: number | null | undefined,
  number: Intl.NumberFormat,
) {
  if (value == null) {
    return "—";
  }
  return number.format(value) + " ms";
}

export function ResponseTimes({
  timings,
  locale,
}: {
  timings: OverviewReport["timings"];
  locale: Locale;
}) {
  const t = translator(locale);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const title = t("HTTP response times", "Tempi di risposta HTTP");
  return (
    <section className={styles.latency} aria-label={title}>
      <header>
        <h2>{title}</h2>
        <small>{t("Last 24h", "Ultime 24 ore")}</small>
      </header>
      <dl>
        {["P50", "P95", "P99"].map((label, index) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{milliseconds(timings.percentiles?.[index], number)}</dd>
          </div>
        ))}
      </dl>
      <p>
        {t("Timed responses", "Risposte misurate")} ·{" "}
        {number.format(timings.samples)}
      </p>
    </section>
  );
}
