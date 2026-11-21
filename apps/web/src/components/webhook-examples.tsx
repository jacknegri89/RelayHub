"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "./locale";
import styles from "./webhook-examples.module.css";

function examples(t: (english: string, italian: string) => string) {
  return [
    {
      sender: "Stripe",
      event: "payment_intent.succeeded",
      trigger: t(
        "A customer’s payment succeeds.",
        "Il pagamento di un cliente va a buon fine.",
      ),
      receiver: t("Order system", "Gestionale ordini"),
      result: t(
        "Your shop matches the payment to the order and marks it as paid. The customer can close the checkout page in the meantime.",
        "Il gestionale associa il pagamento all’ordine e lo segna come pagato. Nel frattempo il cliente può anche chiudere la pagina di pagamento.",
      ),
      docs: "https://docs.stripe.com/webhooks",
    },
    {
      sender: "GitHub",
      event: "push",
      trigger: t(
        "A developer pushes a commit.",
        "Uno sviluppatore invia un commit.",
      ),
      receiver: t("Build server", "Server di test"),
      result: t(
        "The build server reads the commit ID and runs the test suite for that revision. The team can see whether the change passes.",
        "Il server legge l’ID del commit ed esegue i test su quella versione. Il team può vedere se la modifica supera i controlli.",
      ),
      docs: "https://docs.github.com/en/webhooks/about-webhooks",
    },
    {
      sender: "Shopify",
      event: "orders/create",
      trigger: t(
        "A shop receives a new order.",
        "Il negozio riceve un nuovo ordine.",
      ),
      receiver: t("Warehouse", "Magazzino"),
      result: t(
        "The warehouse reads the ordered items and prepares a picking list. Staff can start packing without copying the order by hand.",
        "Il magazzino legge gli articoli ordinati e prepara la lista di prelievo. Chi prepara il pacco trova già prodotti e quantità.",
      ),
      docs: "https://shopify.dev/docs/apps/build/webhooks",
    },
  ];
}

// The outgoing notification and its acknowledgement travel on separate tracks.
function ExchangeDiagram({ active }: { active: boolean }) {
  const request = "M18 26 H155 C181 26 191 78 217 78 H462";
  const response = "M462 93 H318 C292 93 282 145 256 145 H18";
  return (
    <svg
      className={styles.exchange}
      data-active={active}
      viewBox="0 0 480 169"
      aria-hidden="true"
    >
      <g className={styles.lanes}>
        <path d="M18 7 V161 M462 7 V161" />
        <path strokeDasharray="2 6" d="M18 78 H462 M18 145 H462" />
      </g>
      <path className={styles.track} d={request} />
      <path className={styles.track} d={response} />
      <path className={styles.request} pathLength="1" d={request} />
      <path className={styles.response} pathLength="1" d={response} />
      <path className={styles.packet} pathLength="1" d={request} />
      <path className={styles.outboundTip} d="m420 72 7 6-7 6" />
      <path className={styles.returnTip} d="m70 139-7 6 7 6" />
      <circle className={styles.node} cx="18" cy="26" r="5" />
      <circle className={styles.pulse} cx="462" cy="78" r="12" />
      <circle className={styles.received} cx="462" cy="78" r="5" />
      <path className={styles.received} d="m18 140 5 5-5 5-5-5z" />
    </svg>
  );
}

export function WebhookExamples() {
  const { t } = useLocale();
  const scenarios = examples(t);
  const [selected, setSelected] = useState(0);
  const [playback, setPlayback] = useState(0);
  const [inView, setInView] = useState(false);
  const plot = useRef<HTMLDivElement>(null);
  const scenario = scenarios[selected];

  useEffect(() => {
    const element = plot.current;
    if (!element) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.45 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className={styles.section}
      id="webhooks"
      aria-labelledby="examples-title"
      tabIndex={-1}
    >
      <div className={styles.guide}>
        <h2 id="examples-title">
          {t("What is a webhook?", "Cos’è un webhook?")}
        </h2>
        <p>
          {t(
            "A webhook is an HTTP request one app sends to another when an event occurs. You give the sender a URL so the receiving app can act as soon as the event happens.",
            "Un webhook è una richiesta HTTP che un’app invia a un’altra quando si verifica un evento. Indichi al mittente un URL e l’app che riceve la notifica può agire subito.",
          )}
        </p>
        <p className={styles.instruction}>
          {t(
            "Choose an app to follow one notification from the event to the action it triggers.",
            "Scegli un’app e segui la notifica dall’evento fino all’azione che mette in moto.",
          )}
        </p>
      </div>
      <div className={styles.board}>
        <div
          className={styles.selector}
          role="group"
          aria-label={t("Webhook examples", "Esempi di webhook")}
        >
          {scenarios.map((item, index) => (
            <button
              key={item.sender}
              type="button"
              aria-pressed={selected === index}
              onClick={() => setSelected(index)}
            >
              {item.sender}
            </button>
          ))}
        </div>
        <div aria-live="polite" aria-atomic="true" className={styles.paper}>
          <h3 className={styles.trigger}>{scenario.trigger}</h3>
          <div className={styles.endpoints}>
            <div>
              <span>{t("Sender", "Mittente")}</span>
              <strong>{scenario.sender}</strong>
            </div>
            <div>
              <span>{t("Receiver", "Destinatario")}</span>
              <strong>{scenario.receiver}</strong>
            </div>
          </div>
          <div className={styles.plot} ref={plot}>
            <div className={styles.requestLabel}>
              <span>{t("Notification", "Notifica")} →</span>
              <code>{scenario.event}</code>
            </div>
            <ExchangeDiagram key={scenario.sender + playback} active={inView} />
            <div className={styles.replyLabel}>
              <span>← {t("Receipt", "Conferma")}</span>
              <code>HTTP 200</code>
            </div>
          </div>
          <div className={styles.outcome} key={scenario.sender}>
            <p>{scenario.result}</p>
          </div>
        </div>
        <div className={styles.tools}>
          <button
            type="button"
            className={styles.replay}
            onClick={() => setPlayback((count) => count + 1)}
          >
            <span aria-hidden="true">↻</span>{" "}
            {t("Replay exchange", "Rivedi lo scambio")}
          </button>
          <a href={scenario.docs}>
            {t(`Read the ${scenario.sender} guide`, `Guida ${scenario.sender}`)}{" "}
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </section>
  );
}
