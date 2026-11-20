"use client";

import { useId, useState, type ReactNode } from "react";
import { translator, type Locale } from "../locale";
import styles from "./destination-history.module.css";

export type DestinationDay = {
  date: string;
  successes: number;
  failures: number;
  averageMs: number | null;
};

function scaleLimit(maximum: number) {
  if (maximum === 0) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  for (const factor of [1, 2, 3, 4, 5, 8]) {
    const limit = factor * magnitude;
    if (limit >= maximum) {
      return limit;
    }
  }
  return 10 * magnitude;
}

// A missing HTTP measurement ends the line. An actual 0 ms stays on the baseline.
function responsePath(days: DestinationDay[], limit: number) {
  let continuing = false;
  const commands: string[] = [];
  for (const [index, day] of days.entries()) {
    if (day.averageMs === null) {
      continuing = false;
      continue;
    }
    let command = "M";
    if (continuing) {
      command = "L";
    }
    const x = ((index + 0.5) / days.length) * 100;
    const y = 100 - (day.averageMs / limit) * 100;
    commands.push(command + x + " " + y);
    continuing = true;
  }
  return commands.join(" ");
}

function Plot({
  maximum,
  midpoint,
  children,
}: {
  maximum: string;
  midpoint?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.plotRow} aria-hidden="true">
      <div className={styles.scale}>
        <span>{maximum}</span>
        <span>{midpoint}</span>
        <span>0</span>
      </div>
      <div className={styles.plot}>{children}</div>
    </div>
  );
}

export function DestinationHistory({
  days,
  locale,
}: {
  days: DestinationDay[];
  locale: Locale;
}) {
  const t = translator(locale);
  const groupName = useId();
  const [chosenDate, setChosenDate] = useState("");
  const activeDays = days.filter(
    (day) => day.successes > 0 || day.failures > 0 || day.averageMs !== null,
  );
  const selectedDay =
    days.find((day) => day.date === chosenDate) ?? activeDays.at(-1);
  const title = t("Attempt history", "Storico dei tentativi");
  const dates = days.map((day) => new Date(day.date + "T00:00:00Z"));
  let range = t("Last seven days", "Ultimi sette giorni");
  if (dates.length) {
    const dateRange = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    // Node and Chrome can use different Unicode spaces around the date-range dash.
    range = dateRange
      .formatRange(dates[0], dates[dates.length - 1])
      .replace(/\s+/gu, " ");
  }
  const period =
    range + t(" · UTC · Today is partial", " · UTC · Oggi parziale");
  if (activeDays.length === 0 || !selectedDay) {
    return (
      <section className={styles.history} aria-label={title}>
        <h2>{title}</h2>
        <p className={styles.period}>{period}</p>
        <p className={styles.empty}>
          {t(
            "No outbound attempts recorded in these seven days.",
            "Nessun tentativo di invio registrato in questi sette giorni.",
          )}
        </p>
      </section>
    );
  }

  const fullDate = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  });
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  });
  const count = new Intl.NumberFormat(locale);
  const duration = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  });
  const compact = new Intl.NumberFormat(locale, { notation: "compact" });
  const attemptLimit = scaleLimit(
    Math.max(...days.map((day) => Math.max(day.successes, day.failures))),
  );
  const responseLimit = scaleLimit(
    Math.max(...days.map((day) => day.averageMs ?? 0)),
  );
  let attemptMidpoint: string | undefined;
  if (Number.isInteger(attemptLimit / 2)) {
    attemptMidpoint = compact.format(attemptLimit / 2);
  }
  const hasResponse = days.some((day) => day.averageMs !== null);
  const successLabel = t("Successful", "Riusciti");
  const failureLabel = t("Failed", "Falliti");
  const responseLabel = t(
    "Mean HTTP response time",
    "Tempo medio di risposta HTTP",
  );
  let selectedDuration = t("No measurement", "Nessuna misura");
  if (selectedDay.averageMs !== null) {
    selectedDuration = duration.format(selectedDay.averageMs) + " ms";
    if (selectedDay.averageMs > 0 && selectedDay.averageMs < 0.01) {
      selectedDuration = "< " + duration.format(0.01) + " ms";
    }
  }

  return (
    <section className={styles.history} aria-label={title}>
      <h2>{title}</h2>
      <p className={styles.period}>{period}</p>
      <section
        className={styles.series}
        aria-label={t("Completed attempts", "Tentativi conclusi")}
      >
        <div className={styles.seriesHead}>
          <h3>{t("Completed attempts", "Tentativi conclusi")}</h3>
          <ul className={styles.legend}>
            <li>
              <i className={styles.successKey} />
              {successLabel}
            </li>
            <li>
              <i className={styles.failureKey} />
              {failureLabel}
            </li>
          </ul>
        </div>
        <Plot maximum={compact.format(attemptLimit)} midpoint={attemptMidpoint}>
          {days.map((day) => (
            <label
              htmlFor={groupName + day.date}
              key={day.date}
              className={styles.column}
              data-selected={day.date === selectedDay.date}
            >
              {day.successes > 0 && (
                <i
                  className={styles.successBar}
                  style={{ height: (day.successes / attemptLimit) * 100 + "%" }}
                />
              )}
              {day.failures > 0 && (
                <i
                  className={styles.failureBar}
                  style={{ height: (day.failures / attemptLimit) * 100 + "%" }}
                />
              )}
            </label>
          ))}
        </Plot>
      </section>

      <section className={styles.series} aria-label={responseLabel}>
        <div className={styles.seriesHead}>
          <h3>
            {responseLabel} <span>(ms)</span>
          </h3>
        </div>
        {hasResponse && (
          <Plot
            maximum={compact.format(responseLimit)}
            midpoint={compact.format(responseLimit / 2)}
          >
            {days.map((day) => (
              <label
                htmlFor={groupName + day.date}
                key={day.date}
                className={styles.column}
                data-selected={day.date === selectedDay.date}
              >
                {day.averageMs !== null && (
                  <i
                    className={styles.point}
                    style={{
                      bottom: (day.averageMs / responseLimit) * 100 + "%",
                    }}
                  />
                )}
              </label>
            ))}
            <svg
              className={styles.line}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <path
                d={responsePath(days, responseLimit)}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </Plot>
        )}
        {!hasResponse && (
          <p className={styles.empty}>
            {t(
              "No timed HTTP responses in this period.",
              "Nessuna risposta HTTP con durata misurata in questo periodo.",
            )}
          </p>
        )}
      </section>

      <fieldset className={styles.days}>
        <legend>{t("Inspect a day", "Esamina un giorno")}</legend>
        <div className={styles.dayGrid}>
          {days.map((day, index) => (
            <label
              key={day.date}
              className={styles.day}
              data-selected={day.date === selectedDay.date}
            >
              <input
                id={groupName + day.date}
                type="radio"
                name={groupName}
                value={day.date}
                checked={day.date === selectedDay.date}
                onChange={() => setChosenDate(day.date)}
                aria-label={fullDate.format(dates[index])}
              />
              <span>{weekday.format(dates[index])}</span>
              <strong>{dates[index].getUTCDate()}</strong>
            </label>
          ))}
        </div>
      </fieldset>
      <div className={styles.readout} role="status" aria-atomic="true">
        <strong>
          {fullDate.format(new Date(selectedDay.date + "T00:00:00Z"))}
        </strong>
        <dl>
          <div>
            <dt>{successLabel}</dt>
            <dd>{count.format(selectedDay.successes)}</dd>
          </div>
          <div>
            <dt>{failureLabel}</dt>
            <dd>{count.format(selectedDay.failures)}</dd>
          </div>
          <div>
            <dt>{responseLabel}</dt>
            <dd>{selectedDuration}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
