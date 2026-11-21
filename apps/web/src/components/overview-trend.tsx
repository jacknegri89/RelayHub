"use client";

import { useId, useState, type ReactNode } from "react";
import { formatUtcDateRange, translator, type Locale } from "../locale";
import type { OverviewDay } from "../server/overview";
import styles from "./overview.module.css";

type Series = "total" | "succeeded" | "failed";
const ALL_SERIES: Series[] = ["total", "succeeded", "failed"];
type TrendProps = { days: OverviewDay[]; locale: Locale };

const EXAMPLE_COUNTS = [
  { succeeded: 12, failed: 0 },
  { succeeded: 18, failed: 2 },
  { succeeded: 15, failed: 6 },
  { succeeded: 21, failed: 1 },
  { succeeded: 26, failed: 0 },
  { succeeded: 19, failed: 0 },
  { succeeded: 9, failed: 1 },
];

export function OverviewTrend({ days, locale }: TrendProps) {
  const hasAttempts = days.some((day) => day.succeeded > 0 || day.failed > 0);
  if (hasAttempts) {
    return (
      <WeekPanel days={days} locale={locale}>
        <TrendPlot days={days} locale={locale} />
      </WeekPanel>
    );
  }
  // A new reporting window starts on real data, even if the old window was previewing a sample.
  return <EmptyWeek key={days.at(-1)?.date} days={days} locale={locale} />;
}

function EmptyWeek({ days, locale }: TrendProps) {
  const t = translator(locale);
  const [example, setExample] = useState(false);
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  });
  const panelId = useId();
  let buttonLabel = t("Explore an example", "Esplora un esempio");
  let plot: ReactNode;
  if (example) {
    buttonLabel = t("Return to real data", "Torna ai dati reali");
    const sample = days.map((day, index) => ({
      date: day.date,
      ...EXAMPLE_COUNTS[index % EXAMPLE_COUNTS.length],
    }));
    plot = <TrendPlot days={sample} locale={locale} example />;
  }
  return (
    <WeekPanel
      days={days}
      locale={locale}
      example={example}
      action={
        days.length > 0 && (
          <button
            type="button"
            className={styles.exampleButton}
            aria-controls={panelId}
            aria-expanded={example}
            onClick={() => setExample(!example)}
          >
            {buttonLabel}
          </button>
        )
      }
    >
      {!example && (
        <>
          <div className={styles.emptyDays} aria-hidden="true">
            {days.map((day) => (
              <time key={day.date} dateTime={day.date}>
                {weekday.format(new Date(day.date + "T00:00:00Z"))}
              </time>
            ))}
          </div>
          <p className={styles.weekEmpty}>
            {t(
              "No delivery attempts finished in these seven days.",
              "Nessun tentativo di consegna concluso in questi sette giorni.",
            )}
          </p>
        </>
      )}
      <div id={panelId} hidden={!example}>
        {plot}
      </div>
    </WeekPanel>
  );
}

function WeekPanel({
  days,
  locale,
  example = false,
  action,
  children,
}: TrendProps & {
  example?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const t = translator(locale);
  const titleId = useId();
  let title = t("Attempt trend", "Andamento dei tentativi");
  if (example) {
    title = t(
      "Attempt trend · Example data",
      "Andamento dei tentativi · Dati di esempio",
    );
  }
  let range = t("Last 7 days", "Ultimi 7 giorni");
  const first = days[0];
  const last = days.at(-1);
  if (first && last) {
    range = formatUtcDateRange(
      locale,
      new Date(first.date + "T00:00:00Z"),
      new Date(last.date + "T00:00:00Z"),
    );
  }
  return (
    <section className={styles.trend} aria-labelledby={titleId}>
      <header className={styles.trendHead}>
        <div>
          <h2 id={titleId}>{title}</h2>
          <p>
            {range} · UTC
            {!example && <> · {t("Today is partial", "Oggi parziale")}</>}
          </p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function value(day: OverviewDay, series: Series) {
  if (series === "total") {
    return day.succeeded + day.failed;
  }
  return day[series];
}

// Each filter rescales independently so isolated failures remain readable next to much larger successful volumes.
function scaleCeiling(maximum: number) {
  if (!maximum) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  for (const factor of [1, 2, 3, 4, 5, 8, 10]) {
    if (factor * magnitude >= maximum) {
      return factor * magnitude;
    }
  }
  return maximum;
}

function TrendPlot({
  days,
  locale,
  example = false,
}: TrendProps & { example?: boolean }) {
  const t = translator(locale);
  const group = useId();
  const [filter, setFilter] = useState<Series>("total");
  const [selectedDate, setDate] = useState("");
  const selected = days.find((day) => day.date === selectedDate) ?? days.at(-1);
  let visible: Series[] = [filter];
  if (filter === "total") {
    visible = ALL_SERIES;
  }
  const maximum = Math.max(0, ...days.map((day) => value(day, filter)));
  const periodTotal = days.reduce(
    (total, day) => total + value(day, filter),
    0,
  );
  const limit = scaleCeiling(maximum);
  const axis = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const count = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const fullDate = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  });
  const labels: Record<Series, string> = {
    total: t("Total", "Totale"),
    succeeded: t("Successful", "Riusciti"),
    failed: t("Failed", "Falliti"),
  };
  const filters = { ...labels, total: t("All", "Tutti") };
  const emptyMessages: Record<Series, string> = {
    total: t("No attempts in this period", "Nessun tentativo nel periodo"),
    succeeded: t(
      "No successful attempts in this period",
      "Nessun tentativo riuscito nel periodo",
    ),
    failed: t(
      "No failed attempts in this period",
      "Nessun tentativo fallito nel periodo",
    ),
  };
  function points(series: Series) {
    return days
      .map((day, i) => {
        const x = (100 * (i + 0.5)) / days.length;
        const y = 100 - (100 * value(day, series)) / limit;
        return x + "," + y;
      })
      .join(" ");
  }
  return (
    <>
      <div className={styles.plotTools}>
        <p>
          {example && t("Example total", "Totale di esempio")}
          {!example && t("Period total", "Totale nel periodo")}{" "}
          <strong>{count.format(periodTotal)}</strong>
        </p>
        <div
          className={styles.filters}
          role="group"
          aria-label={t("Filter attempts", "Filtra tentativi")}
        >
          {ALL_SERIES.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {filters[key]}
            </button>
          ))}
        </div>
      </div>
      {maximum > 0 && (
        <div className={styles.chartRow}>
          <div className={styles.axis} aria-hidden="true">
            <span>{axis.format(limit)}</span>
            <span>{Number.isInteger(limit / 2) && axis.format(limit / 2)}</span>
            <span>0</span>
          </div>
          <div className={styles.plot}>
            {days.map((day) => (
              <label
                htmlFor={group + day.date}
                key={day.date}
                className={styles.column}
                data-selected={selected?.date === day.date}
                aria-hidden="true"
              >
                {visible.map((key) => (
                  <i
                    className={styles.dot}
                    data-series={key}
                    key={key}
                    style={{ bottom: (value(day, key) * 100) / limit + "%" }}
                  />
                ))}
              </label>
            ))}
            <svg
              aria-hidden="true"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polygon
                data-series={filter}
                points={
                  50 / days.length +
                  ",100 " +
                  points(filter) +
                  " " +
                  (100 - 50 / days.length) +
                  ",100"
                }
              />
              {visible.map((key) => (
                <polyline
                  key={key}
                  data-series={key}
                  points={points(key)}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          </div>
        </div>
      )}
      {maximum === 0 && (
        <p className={styles.filterEmpty}>{emptyMessages[filter]}</p>
      )}
      <div
        className={styles.dates}
        data-no-series={maximum === 0}
        role="radiogroup"
        aria-label={t("Select UTC day", "Seleziona il giorno UTC")}
      >
        {days.map((day) => {
          const utc = new Date(day.date + "T00:00:00Z");
          return (
            <label key={day.date} data-selected={selected?.date === day.date}>
              <input
                type="radio"
                id={group + day.date}
                name={group}
                value={day.date}
                checked={selected?.date === day.date}
                onChange={() => setDate(day.date)}
                aria-label={fullDate.format(utc)}
              />
              {date.format(utc)}
            </label>
          );
        })}
      </div>
      {selected && (
        <div className={styles.readout} role="status" aria-atomic="true">
          <strong>
            {example && <>{t("Example", "Esempio")} · </>}
            {fullDate.format(new Date(selected.date + "T00:00:00Z"))}
          </strong>
          <dl>
            {visible.map((key) => (
              <div key={key} data-series={key}>
                <dt>{labels[key]}</dt>
                <dd>{count.format(value(selected, key))}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  );
}
