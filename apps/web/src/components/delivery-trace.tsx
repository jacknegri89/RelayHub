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
const TAIL = 190;
const NAME_LIMIT = 22;

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

function seconds(from: Date, to: Date) {
  const value = Math.max(0, to.getTime() - from.getTime()) / 1000;
  return value.toFixed(1) + " s";
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
  const parts: ReactNode[] = [];
  const summary: string[] = [];
  let step = 1;
  let cursor = LEFT;

  parts.push(
    <circle
      key="received"
      className="mark-event"
      data-step={step}
      cx={cursor}
      cy={RELAY_Y}
      r="5"
    />,
    note(
      "received-note",
      { x: cursor - 12, y: RELAY_Y - 14 },
      t("queued", "in coda"),
      "incoming",
      step,
    ),
  );
  step += 1;

  delivery.attempts.forEach((attempt, index) => {
    const isLast = index === delivery.attempts.length - 1;
    const sendAt = { x: cursor + GAP, y: RELAY_Y };
    const hitAt = { x: sendAt.x + TRAVEL, y: DESTINATION_Y };
    parts.push(segment("send-" + attempt.id, sendAt, hitAt, "photon", step));
    step += 1;

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
    parts.push(segment("bounce-" + attempt.id, hitAt, backAt, "failed", step));
    step += 1;
    cursor = backAt.x;

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
        t("backoff ", "attesa ") + seconds(attempt.finishedAt, attempt.retryAt);
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

  const lastAttempt = delivery.attempts[delivery.attempts.length - 1];
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
        t("failed · retry available", "fallita · puoi riprovarla"),
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
  } else if (!lastAttempt || lastAttempt.outcome !== "success") {
    parts.push(
      <circle
        key="pending"
        className="mark-waiting"
        data-step={step}
        cx={cursor + GAP}
        cy={RELAY_Y}
        r="4.5"
        style={{ fill: "var(--photon)" }}
      />,
      note(
        "pending-note",
        { x: cursor + GAP + 12, y: RELAY_Y + 18 },
        stateLabel(delivery.status, t),
        "photon",
        step,
      ),
    );
    summary.push(stateLabel(delivery.status, t) + ".");
  }

  const width = cursor + TAIL;
  let attemptsText =
    delivery.attempts.length + " " + t("attempts", "tentativi");
  if (delivery.attempts.length === 1) {
    attemptsText = t("1 attempt", "1 tentativo");
  }
  const description = attemptsText + ". " + summary.join(". ");

  return (
    <TracePlayer
      className="panel trace-panel"
      heading={<h2>{t("Delivery trace", "Traccia della consegna")}</h2>}
      replayLabel={t("Replay", "Rivedi")}
    >
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
        <li data-tone="failed">{t("bounced", "respinta")}</li>
        <li data-tone="retry">{t("backoff", "attesa")}</li>
        <li data-tone="delivered">{t("delivered", "consegnata")}</li>
      </ul>
    </TracePlayer>
  );
}

const CONE_WIDTH = 680;
const APEX_X = 150;
const END_X = 420;
const ROW_HEIGHT = 46;

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
  if (status === "failed" || status === "cancelled") {
    return "failed";
  }
  if (status === "retry_scheduled") {
    return "retry";
  }
  return "photon";
}

// The event's light cone: one ray per delivery, coloured by its outcome.
export async function EventCone({
  deliveries,
}: {
  deliveries: ConeDelivery[];
}) {
  const { t } = await getLocale();
  if (!deliveries.length) {
    return null;
  }
  const height = Math.max(150, deliveries.length * ROW_HEIGHT + 50);
  const apex = { x: APEX_X, y: height / 2 };
  const firstY = height / 2 - ((deliveries.length - 1) * ROW_HEIGHT) / 2;
  const lastY = firstY + (deliveries.length - 1) * ROW_HEIGHT;
  const summary: string[] = [];
  const rays: ReactNode[] = [];

  deliveries.forEach((delivery, index) => {
    const end = { x: END_X, y: firstY + index * ROW_HEIGHT };
    const tone = toneFor(delivery.status);
    const status = stateLabel(delivery.status, t);
    summary.push(delivery.destination.name + ": " + status);
    rays.push(segment("ray-" + delivery.id, apex, end, tone, 3));
    let marker: ReactNode = (
      <circle
        key={"end-" + delivery.id}
        className="mark-delivered"
        data-step={4}
        cx={end.x}
        cy={end.y}
        r="6"
      />
    );
    if (tone === "failed") {
      marker = (
        <rect
          key={"end-" + delivery.id}
          className="mark-failed"
          data-step={4}
          x={end.x - 4.5}
          y={end.y - 4.5}
          width="9"
          height="9"
        />
      );
    }
    if (tone === "retry" || tone === "photon") {
      marker = (
        <circle
          key={"end-" + delivery.id}
          className="mark-waiting"
          data-step={4}
          cx={end.x}
          cy={end.y}
          r="4.5"
          style={{ fill: "var(--" + tone + ")" }}
        />
      );
    }
    let attempts = delivery.attemptCount + " " + t("attempts", "tentativi");
    if (delivery.attemptCount === 1) {
      attempts = t("1 attempt", "1 tentativo");
    }
    rays.push(
      marker,
      note(
        "name-" + delivery.id,
        { x: end.x + 16, y: end.y - 3 },
        shorten(delivery.destination.name),
        "incoming",
        4,
      ),
      note(
        "state-" + delivery.id,
        { x: end.x + 16, y: end.y + 12 },
        status + " · " + attempts,
        tone,
        4,
      ),
    );
  });

  return (
    <TracePlayer
      className="panel trace-panel"
      heading={<h2>{t("Event cone", "Cono dell’evento")}</h2>}
      replayLabel={t("Replay", "Rivedi")}
    >
      <div
        className="trace-scroll"
        tabIndex={0}
        role="region"
        aria-label={t("Event cone diagram", "Diagramma del cono dell’evento")}
      >
        <svg
          className="trace-svg"
          viewBox={"0 0 " + CONE_WIDTH + " " + height}
          role="img"
          aria-label={
            t("Deliveries of this event", "Consegne di questo evento") +
            ": " +
            summary.join("; ")
          }
        >
          <line className="lane" x1="0" y1={apex.y} x2={APEX_X} y2={apex.y} />
          <text className="lane-label" x="14" y={apex.y - 12}>
            {t("RECEIVED", "RICEVUTO")}
          </text>
          {segment("ingress", { x: 14, y: apex.y }, apex, "incoming", 1)}
          <path
            className="cone"
            data-step={2}
            d={
              "M" +
              apex.x +
              " " +
              apex.y +
              " L" +
              END_X +
              " " +
              (firstY - 18) +
              " L" +
              END_X +
              " " +
              (lastY + 18) +
              " Z"
            }
          />
          <circle
            className="mark-event"
            data-step={2}
            cx={apex.x}
            cy={apex.y}
            r="5.5"
          />
          {rays}
          <circle className="photon-head" cx="0" cy="0" r="3.2" />
        </svg>
      </div>
    </TracePlayer>
  );
}
