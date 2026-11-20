import type { DeliveryStatus } from "@relayhub/db";
import type { ReactNode } from "react";
import { getLocale } from "../server/locale";
import { stateLabel } from "./display";
import { TracePlayer } from "./trace-player";

// Delivery traces are spacetime diagrams: time runs right, RelayHub on top,
// the destination below. Attempts travel down at 45°, failures bounce back up,
// and the amber hold on the relay lane is the backoff before the next attempt.
const LEFT = 150;
const RELAY_Y = 50;
const DESTINATION_Y = 150;
const TRAVEL = DESTINATION_Y - RELAY_Y;
const GAP = 34;
const HOLD = 76;
const TRACE_HEIGHT = 206;
const TAIL = 258;
const NAME_LIMIT = 22;
const MAX_DRAWN_ATTEMPTS = 5;
// Room for one glyph of the 12px monospace SVG labels, including spacing.
const NOTE_CHARACTER_WIDTH = 8;

type TraceAttempt = {
  id: string;
  number: number;
  outcome: string;
  startedAt: Date;
  finishedAt: Date | null;
  retryAt: Date | null;
  httpStatus: number | null;
  durationMs: number | null;
};

type Tone = "photon" | "incoming" | "failed" | "retry" | "delivered";
type Point = { x: number; y: number };

function segment(
  key: string,
  from: Point,
  to: Point,
  tone: Tone,
  step: number,
) {
  return (
    <path
      key={key}
      data-segment
      data-step={step}
      data-tone={tone}
      data-from={from.x + "," + from.y}
      data-to={to.x + "," + to.y}
      pathLength={1}
      strokeDasharray="1"
      d={"M" + from.x + " " + from.y + " L" + to.x + " " + to.y}
    />
  );
}

function note(
  key: string,
  point: Point,
  text: string,
  tone: Tone,
  step: number,
) {
  return (
    <text
      key={key}
      className="note"
      data-tone={tone}
      data-step={step}
      x={point.x}
      y={point.y}
    >
      {text}
    </text>
  );
}

function shorten(name: string) {
  if (name.length <= NAME_LIMIT) {
    return name;
  }
  return name.slice(0, NAME_LIMIT - 1) + "…";
}

function seconds(from: Date, to: Date, locale: string) {
  const value = Math.max(0, to.getTime() - from.getTime()) / 1000;
  return value.toLocaleString(locale, { maximumFractionDigits: 1 }) + " s";
}

export async function DeliveryTrace({
  delivery,
}: {
  delivery: {
    status: DeliveryStatus;
    nextAt: Date | null;
    destination: { name: string };
    attempts: TraceAttempt[];
  };
}) {
  const { locale, t } = await getLocale();
  const heading = t("Delivery trace", "Traccia della consegna");
  const attemptCount = delivery.attempts.length;
  if (attemptCount === 0) {
    return (
      <section className="panel trace-panel">
        <header className="trace-head">
          <h2>{heading}</h2>
        </header>
        <p className="trace-caption">
          {t("No attempts yet", "Nessun tentativo registrato")} ·{" "}
          {stateLabel(delivery.status, t)}
        </p>
      </section>
    );
  }
  const visibleAttempts = delivery.attempts.slice(-MAX_DRAWN_ATTEMPTS);
  const hasUnconfirmedAttempt = visibleAttempts.some(
    (attempt) => attempt.httpStatus === null,
  );
  const parts: ReactNode[] = [];
  const summary: string[] = [];
  let step = 1;
  let cursor = LEFT;
  let lastLabelEdge = 0;

  parts.push(
    <circle
      key="received"
      className="mark-event"
      data-step={step}
      cx={cursor}
      cy={RELAY_Y}
      r="5"
    />,
  );
  step += 1;

  visibleAttempts.forEach((attempt, index) => {
    const isLast = index === visibleAttempts.length - 1;
    const sendAt = { x: cursor + GAP, y: RELAY_Y };
    const hitAt = { x: sendAt.x + TRAVEL, y: DESTINATION_Y };

    let result = stateLabel(attempt.outcome, t);
    if (attempt.httpStatus) {
      result = "HTTP " + attempt.httpStatus;
    }
    let label = "#" + attempt.number + " · " + result;
    if (attempt.durationMs !== null) {
      label += " · " + attempt.durationMs + " ms";
    }
    summary.push(
      t("attempt", "tentativo") + " " + attempt.number + ": " + result,
    );
    // Only an HTTP response confirms that the request reached the receiver.
    const reachedReceiver = attempt.httpStatus !== null;
    if (reachedReceiver) {
      parts.push(segment("send-" + attempt.id, sendAt, hitAt, "photon", step));
      step += 1;
    }

    if (attempt.outcome === "success") {
      parts.push(
        <circle
          key={"hit-" + attempt.id}
          className="mark-delivered"
          data-step={step}
          cx={hitAt.x}
          cy={hitAt.y}
          r="7"
        />,
        <circle
          key={"flash-" + attempt.id}
          className="mark-delivered"
          data-flash
          data-step={step}
          cx={hitAt.x}
          cy={hitAt.y}
          r="7"
        />,
        note(
          "note-" + attempt.id,
          { x: hitAt.x - 30, y: hitAt.y + 26 },
          label,
          "delivered",
          step,
        ),
      );
      step += 1;
      cursor = hitAt.x;
      return;
    }

    if (reachedReceiver) {
      parts.push(
        <rect
          key={"hit-" + attempt.id}
          className="mark-failed"
          data-step={step}
          x={hitAt.x - 4.5}
          y={hitAt.y - 4.5}
          width="9"
          height="9"
        />,
        <circle
          key={"flash-" + attempt.id}
          className="mark-delivered"
          data-flash
          data-step={step}
          cx={hitAt.x}
          cy={hitAt.y}
          r="7"
          style={{ stroke: "var(--failed)", fill: "none" }}
        />,
        note(
          "note-" + attempt.id,
          { x: hitAt.x - 30, y: hitAt.y + 26 },
          label,
          "failed",
          step,
        ),
      );
      step += 1;
      const backAt = { x: hitAt.x + TRAVEL, y: RELAY_Y };
      parts.push(
        segment("bounce-" + attempt.id, hitAt, backAt, "failed", step),
      );
      step += 1;
      cursor = backAt.x;
    } else {
      let tone: Tone = "failed";
      if (attempt.outcome === "in_progress") {
        tone = "photon";
      }
      parts.push(
        <circle
          key={"local-" + attempt.id}
          className="mark-local"
          data-tone={tone}
          data-step={step}
          cx={sendAt.x}
          cy={sendAt.y}
          r="5"
        />,
        note(
          "note-" + attempt.id,
          { x: sendAt.x, y: sendAt.y + 26 },
          label,
          tone,
          step,
        ),
      );
      step += 1;
      cursor = sendAt.x;
      lastLabelEdge = sendAt.x + label.length * NOTE_CHARACTER_WIDTH + GAP;
      if (!isLast) {
        cursor = lastLabelEdge;
      }
    }

    const hasNext = !isLast;
    const waiting = isLast && delivery.status === "retry_scheduled";
    if (!hasNext && !waiting) {
      return;
    }
    const holdEnd = { x: cursor + HOLD, y: RELAY_Y - 6 };
    parts.push(
      segment(
        "hold-" + attempt.id,
        { x: cursor, y: RELAY_Y - 6 },
        holdEnd,
        "retry",
        step,
      ),
    );
    let holdLabel = t("requeued", "rimessa in coda");
    if (attempt.retryAt && attempt.finishedAt) {
      holdLabel =
        t("backoff ", "attesa ") +
        seconds(attempt.finishedAt, attempt.retryAt, locale);
    }
    parts.push(
      note(
        "hold-note-" + attempt.id,
        { x: cursor + 4, y: RELAY_Y - 18 },
        holdLabel,
        "retry",
        step,
      ),
    );
    step += 1;
    cursor = holdEnd.x;
  });

  if (delivery.status === "delivered") {
    summary.push(t("Final outcome: delivered.", "Esito finale: consegnato."));
  } else if (delivery.status === "failed") {
    parts.push(
      <g key="final-failed" data-step={step}>
        <path
          className="mark-cross"
          d={
            "M" + (cursor + 10) + " " + (RELAY_Y - 6) + " l12 12 m0 -12 l-12 12"
          }
        />
      </g>,
      note(
        "final-note",
        { x: cursor + 30, y: RELAY_Y + 4 },
        t("delivery failed", "consegna fallita"),
        "failed",
        step,
      ),
    );
    summary.push(t("Final outcome: failed.", "Esito finale: fallita."));
  } else if (delivery.status === "retry_scheduled") {
    let nextLabel = t("next attempt scheduled", "nuovo tentativo programmato");
    if (delivery.nextAt) {
      const time = new Intl.DateTimeFormat(locale, {
        timeStyle: "medium",
        timeZone: "UTC",
        hourCycle: "h23",
      }).format(delivery.nextAt);
      nextLabel = t("next attempt ", "prossimo tentativo ") + time + " UTC";
    }
    parts.push(
      <circle
        key="waiting"
        className="mark-waiting"
        data-step={step}
        cx={cursor}
        cy={RELAY_Y - 6}
        r="4.5"
      />,
      note(
        "waiting-note",
        { x: cursor + 12, y: RELAY_Y + 10 },
        nextLabel,
        "retry",
        step,
      ),
    );
    summary.push(nextLabel + ".");
  } else {
    summary.push(stateLabel(delivery.status, t) + ".");
  }

  const width = Math.max(cursor + TAIL, lastLabelEdge);
  let attemptsText = attemptCount + " " + t("attempts", "tentativi");
  if (attemptCount === 1) {
    attemptsText = t("1 attempt", "1 tentativo");
  }
  const description = attemptsText + ". " + summary.join(". ");

  return (
    <TracePlayer
      className="panel trace-panel"
      heading={<h2>{heading}</h2>}
      replayLabel={t("Replay", "Rivedi")}
    >
      <p className="trace-caption">
        <strong>{attemptsText}</strong> · {stateLabel(delivery.status, t)}
        {hasUnconfirmedAttempt && (
          <span>
            {t(
              "A marker on the RelayHub line means no HTTP response was recorded for that attempt.",
              "Un punto sulla linea di RelayHub indica un tentativo per cui non è stata registrata una risposta HTTP.",
            )}
          </span>
        )}
        {attemptCount > MAX_DRAWN_ATTEMPTS && (
          <span>
            {t(
              "Showing the latest five. The full history is below.",
              "Sono mostrati gli ultimi cinque. La cronologia completa è sotto.",
            )}
          </span>
        )}
      </p>
      <div
        className="trace-scroll"
        tabIndex={0}
        role="region"
        aria-label={t("Delivery trace diagram", "Diagramma della consegna")}
      >
        <svg
          className="trace-svg"
          viewBox={"0 0 " + width + " " + TRACE_HEIGHT}
          width={width}
          height={TRACE_HEIGHT}
          role="img"
          aria-label={description}
        >
          <line
            className="lane horizon"
            x1="0"
            y1={RELAY_Y - 2}
            x2={width}
            y2={RELAY_Y - 2}
          />
          <line
            className="lane horizon"
            x1="0"
            y1={RELAY_Y + 2}
            x2={width}
            y2={RELAY_Y + 2}
          />
          <line
            className="lane"
            x1="0"
            y1={DESTINATION_Y}
            x2={width}
            y2={DESTINATION_Y}
          />
          <text className="lane-label" x="14" y={RELAY_Y - 12}>
            RELAYHUB
          </text>
          <text className="lane-label" x="14" y={DESTINATION_Y - 12}>
            {shorten(delivery.destination.name).toUpperCase()}
          </text>
          {parts}
          <circle className="photon-head" cx="0" cy="0" r="3.2" />
        </svg>
      </div>
      <ul className="trace-legend" aria-hidden="true">
        <li data-tone="photon">{t("attempt", "tentativo")}</li>
        <li data-tone="failed">{t("error", "errore")}</li>
        <li data-tone="retry">{t("backoff", "attesa")}</li>
        <li data-tone="delivered">{t("delivered", "consegnata")}</li>
      </ul>
    </TracePlayer>
  );
}

const MAX_DRAWN_DESTINATIONS = 6;
const CONE_WIDTH = 220;
const CONE_ORIGIN = 38;
const ROW_HEIGHT = 54;

type ConeDelivery = {
  id: string;
  status: DeliveryStatus;
  attemptCount: number;
  destination: { name: string };
};

function toneFor(status: DeliveryStatus): Tone {
  if (status === "delivered") {
    return "delivered";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "cancelled") {
    return "incoming";
  }
  if (status === "retry_scheduled") {
    return "retry";
  }
  return "photon";
}

// HTML labels stay legible at phone widths; only the connecting rays scale.
export async function EventCone({
  deliveries,
}: {
  deliveries: ConeDelivery[];
}) {
  const { t } = await getLocale();
  const heading = t(
    "Destinations for this event",
    "Destinazioni di questo evento",
  );
  if (deliveries.length === 0) {
    return (
      <section className="panel trace-panel">
        <header className="trace-head">
          <h2>{heading}</h2>
        </header>
        <p className="trace-caption">
          {t(
            "No matching destination. RelayHub received the event without creating a delivery.",
            "Nessuna destinazione corrispondente. RelayHub ha ricevuto l’evento senza creare consegne.",
          )}
        </p>
      </section>
    );
  }

  const visibleDestinations = deliveries.slice(0, MAX_DRAWN_DESTINATIONS);
  const height = visibleDestinations.length * ROW_HEIGHT;
  const apex = { x: CONE_ORIGIN, y: height / 2 };
  let count = t("1 destination", "1 destinazione");
  if (deliveries.length > 1) {
    count = deliveries.length + t(" destinations", " destinazioni");
  }

  return (
    <TracePlayer
      className="panel trace-panel"
      heading={<h2>{heading}</h2>}
      replayLabel={t("Replay", "Rivedi")}
    >
      <p className="trace-caption">
        <strong>{count}</strong>
        {deliveries.length > MAX_DRAWN_DESTINATIONS && (
          <span>
            {t(
              "The diagram shows the first six. All destinations are listed below.",
              "Il diagramma mostra le prime sei. L’elenco completo è sotto.",
            )}
          </span>
        )}
      </p>
      <div className="cone-diagram">
        <div className="cone-plot" aria-hidden="true">
          <svg
            className="trace-svg cone-map"
            viewBox={"0 0 " + CONE_WIDTH + " " + height}
            preserveAspectRatio="none"
          >
            {segment("ingress", { x: 0, y: apex.y }, apex, "incoming", 1)}
            <circle
              className="mark-event"
              data-step="2"
              cx={apex.x}
              cy={apex.y}
              r="4"
            />
            {visibleDestinations.map((delivery, index) => {
              const end = { x: CONE_WIDTH, y: (index + 0.5) * ROW_HEIGHT };
              return segment(
                delivery.id,
                apex,
                end,
                toneFor(delivery.status),
                3,
              );
            })}
          </svg>
        </div>
        <ul className="cone-nodes" aria-label={heading}>
          {visibleDestinations.map((delivery) => {
            let attempts = delivery.attemptCount + t(" attempts", " tentativi");
            if (delivery.attemptCount === 1) {
              attempts = t("1 attempt", "1 tentativo");
            }
            return (
              <li key={delivery.id} data-tone={toneFor(delivery.status)}>
                <span
                  className="cone-marker"
                  aria-hidden="true"
                  data-step="4"
                />
                <strong>{delivery.destination.name}</strong>
                <span>
                  {stateLabel(delivery.status, t)} · {attempts}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </TracePlayer>
  );
}
