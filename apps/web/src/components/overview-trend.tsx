"use client";

import { useId, useState } from "react";
import { translator, type Locale } from "../locale";
import type { OverviewDay } from "../server/overview";
import styles from "./overview.module.css";

type Series = "total" | "succeeded" | "failed";
const ALL_SERIES: Series[] = ["total", "succeeded", "failed"];
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

export function OverviewTrend({
  days,
  locale,
}: {
  days: OverviewDay[];
  locale: Locale;
}) {
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
    <section
      className={styles.trend}
      aria-label={t("Attempt trend", "Andamento dei tentativi")}
    >
      <header className={styles.trendHead}>
        <div>
          <h2>{t("Attempt trend", "Andamento dei tentativi")}</h2>
          <p>
            {t(
              "Last 7 days · UTC · Today is partial",
              "Ultimi 7 giorni · UTC · Oggi parziale",
            )}
          </p>
        </div>
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
      </header>
      {maximum > 0 && (
        <div className={styles.chartRow} aria-hidden="true">
          <div className={styles.axis}>
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
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
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
        <p className={styles.chartEmpty}>
          {t(
            "No attempts for this selection in the last seven days.",
            "Nessun tentativo per questa selezione negli ultimi sette giorni.",
          )}
        </p>
      )}
      <div
        className={styles.dates}
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
    </section>
  );
}
