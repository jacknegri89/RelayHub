"use client";

import { useId, useState, type CSSProperties } from "react";
import { useLocale } from "./locale";
import styles from "./journey-story.module.css";

type Tone = "request" | "success" | "retry" | "failure";
type Trace = { path: string; tone: Tone; delay: number };
type Step = {
  label: string;
  title: string;
  detail: string;
  receipt: string;
  status: string;
  tone: Tone;
  traces: Trace[];
};

function journeySteps(t: (english: string, italian: string) => string): Step[] {
  return [
    {
      label: t("Verify", "Verifica"),
      title: t("The shop signs the order.", "Il negozio firma l’ordine."),
      detail: t(
        "RelayHub checks the signature and timestamp. To forward an event from a provider, your app verifies the provider’s signature first, then signs a new request for RelayHub.",
        "RelayHub controlla la firma e l’ora di invio. Per inoltrare un evento di un servizio esterno, la tua app verifica prima la firma del servizio e poi firma una nuova richiesta per RelayHub.",
      ),
      receipt: "HMAC v1",
      status: t("Signature verified", "Firma verificata"),
      tone: "request",
      traces: [{ path: "M50 34 L150 90", tone: "request", delay: 0 }],
    },
    {
      label: t("Accept", "Accetta"),
      title: t("The event is on record.", "L’evento è in archivio."),
      detail: t(
        "RelayHub saves the encrypted message with its deliveries and replies 202. While that event is on record, sending the same ID and body again from the same source returns the original event ID.",
        "RelayHub salva il messaggio cifrato con le consegne e risponde 202. Finché l’evento è in archivio, se la stessa sorgente invia di nuovo lo stesso ID con lo stesso contenuto riceve l’ID dell’evento originale.",
      ),
      receipt: "HTTP 202",
      status: t("Accepted for delivery", "Accettato per la consegna"),
      tone: "success",
      traces: [
        { path: "M50 24 L150 74", tone: "request", delay: 0 },
        { path: "M150 78 L50 130", tone: "success", delay: 360 },
      ],
    },
    {
      label: t("Route", "Inoltra"),
      title: t("One order, two deliveries.", "Un ordine, due consegne."),
      detail: t(
        "Two routes match this shop and the order.created event. RelayHub sends one signed request to the warehouse and another to billing. Each delivery has its own ID.",
        "Due regole corrispondono al negozio e all’evento order.created. RelayHub invia una richiesta firmata al magazzino e una alla fatturazione. Ogni consegna ha il proprio ID.",
      ),
      receipt: t("2 routes", "2 regole"),
      status: t("Warehouse and billing", "Magazzino e fatturazione"),
      tone: "request",
      traces: [
        { path: "M150 30 L250 82", tone: "request", delay: 0 },
        { path: "M150 30 L350 134", tone: "request", delay: 100 },
      ],
    },
    {
      label: t("Retry", "Riprova"),
      title: t(
        "Only billing needs a retry.",
        "Solo la fatturazione richiede un nuovo tentativo.",
      ),
      detail: t(
        "The warehouse has received its order. Billing replies 503, so RelayHub waits and resends only that delivery, with the same ID. Billing confirms the second attempt with 204.",
        "Il magazzino ha ricevuto l’ordine. La fatturazione risponde 503, quindi RelayHub attende e ripete solo quella consegna, con lo stesso ID. La fatturazione conferma il secondo tentativo con 204.",
      ),
      receipt: "503 → 204",
      status: t("Delivered on attempt 2", "Consegnato al secondo tentativo"),
      tone: "success",
      traces: [
        { path: "M350 14 L150 48", tone: "failure", delay: 0 },
        { path: "M150 48 V82", tone: "retry", delay: 360 },
        { path: "M150 82 L350 116", tone: "request", delay: 790 },
        { path: "M350 116 L150 150", tone: "success", delay: 1150 },
      ],
    },
  ];
}

// Requests and replies move between lanes; the vertical amber segment is time spent waiting.
function StagePlot({ step }: { step: Step }) {
  const arrowId = useId();
  const { t } = useLocale();
  const actors = [
    t("Shop", "Negozio"),
    "RelayHub",
    t("Warehouse", "Magazzino"),
    t("Billing", "Fatturazione"),
  ];
  return (
    <div className={styles.plot} aria-hidden="true">
      <div className={styles.actors}>
        {actors.map((actor) => (
          <span key={actor}>{actor}</span>
        ))}
      </div>
      <svg viewBox="0 0 400 166" className={styles.svg}>
        <defs>
          <marker
            id={arrowId}
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path
              d="M1 1 L6 4 L1 7"
              fill="none"
              stroke="context-stroke"
              strokeWidth="1.4"
            />
          </marker>
        </defs>
        <g className={styles.lanes}>
          <path d="M50 0 V166 M250 0 V166 M350 0 V166" />
          <path className={styles.relayLane} d="M150 0 V166" />
        </g>
        {step.traces.map((trace) => (
          <g
            key={trace.path}
            data-tone={trace.tone}
            style={{ "--delay": trace.delay + "ms" } as CSSProperties}
          >
            <path className={styles.trace} d={trace.path} pathLength="1" />
            <path
              className={styles.tip}
              d={trace.path}
              markerEnd={`url(#${arrowId})`}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

export function JourneyStory() {
  const { t } = useLocale();
  const [selected, setSelected] = useState(0);
  const steps = journeySteps(t);
  const current = steps[selected];
  return (
    <section
      id="journey"
      className={styles.story}
      aria-labelledby="journey-title"
      tabIndex={-1}
      data-active-stage={selected + 1}
    >
      <div className={styles.guide}>
        <h2 id="journey-title">
          {t("Where RelayHub fits in.", "Dove entra in gioco RelayHub.")}
        </h2>
        <p>
          {t(
            "Follow a shop’s order to the warehouse and the billing system. Choose a step to see who sends the request, who replies and what RelayHub records.",
            "Segui l’ordine di un negozio fino al magazzino e alla fatturazione. Scegli una fase per vedere chi invia la richiesta, chi risponde e cosa registra RelayHub.",
          )}
        </p>
        <fieldset className={styles.steps}>
          <legend className="sr-only">
            {t("Delivery stages", "Fasi della consegna")}
          </legend>
          {steps.map((step, index) => (
            <label key={step.label} className={styles.step}>
              <input
                type="radio"
                name="journey-step"
                checked={selected === index}
                onChange={() => setSelected(index)}
                aria-controls="journey-detail"
              />
              <span className={styles.number} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{step.label}</span>
            </label>
          ))}
        </fieldset>
      </div>
      <figure
        className={styles.figure}
        id="journey-detail"
        aria-labelledby="journey-caption"
      >
        <div className={styles.event}>
          <code>order.created</code>
          <span>
            {t("Step", "Fase")} {selected + 1} / {steps.length}
          </span>
        </div>
        <StagePlot key={selected} step={current} />
        <figcaption
          id="journey-caption"
          className={styles.caption}
          aria-live="polite"
          aria-atomic="true"
        >
          <div className={styles.receipt} data-tone={current.tone}>
            <code>{current.receipt}</code>
            <span>{current.status}</span>
          </div>
          <h3>{current.title}</h3>
          <p>{current.detail}</p>
        </figcaption>
      </figure>
    </section>
  );
}
