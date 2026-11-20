"use client";

import { useLocale } from "./locale";
import {
  ENDPOINTS,
  type DeliveryOutcome,
  type Endpoint,
  type OrderSnapshot,
} from "./spacetime-model";
import styles from "./simulator-routes.module.css";

export function OutcomeLabel({ outcome }: { outcome: DeliveryOutcome }) {
  const { t } = useLocale();
  switch (outcome) {
    case "delivered":
      return t("Delivered", "Consegnato");
    case "retrying":
      return t("Retry scheduled", "Riprova programmata");
    case "failed":
      return t("Attempts exhausted", "Tentativi esauriti");
    case "in_flight":
      return t("Sending", "In invio");
  }
}

type Props = {
  order: OrderSnapshot | null;
  names: Record<Endpoint, string>;
  online: Record<Endpoint, boolean>;
  toggle: (endpoint: Endpoint) => void;
  timeline: boolean;
  paused: boolean;
};

export function SimulatorRoutes({
  order,
  names,
  online,
  toggle,
  timeline,
  paused,
}: Props) {
  const { t } = useLocale();
  let title = t("Example order", "Ordine di esempio");
  if (order?.origin === "visitor") {
    title = t("Your order", "Il tuo ordine");
  }
  let receipt = t("Awaiting order", "In attesa dell’ordine");
  let ingressTone = "pending";
  if (order) {
    receipt = t("Verifying signature", "Verifica della firma");
    ingressTone = "in_flight";
    if (order.accepted === false) {
      receipt = t("401 · Invalid signature", "401 · Firma non valida");
      ingressTone = "failed";
    }
    if (order.accepted === true) {
      receipt = t("202 · Accepted", "202 · Accettato");
      ingressTone = "delivered";
    }
  }
  const delivered =
    order?.deliveries.filter((delivery) => delivery.outcome === "delivered")
      .length ?? 0;
  let tally = delivered + t(" of 3 delivered", " su 3 consegnate");
  if (order?.accepted === false) {
    tally = t("No deliveries created", "Nessuna consegna creata");
  }

  return (
    <section
      className={styles.board}
      aria-label={t("Order route", "Percorso dell’ordine")}
      data-timeline={timeline}
      data-paused={paused}
    >
      <header className={styles.receipt}>
        <span>
          <strong>{title}</strong> <code>{order?.type ?? "order.created"}</code>
        </span>
        <span role="status" aria-atomic="true" tabIndex={-1}>
          {tally}
        </span>
      </header>
      <div className={styles.flow}>
        {!timeline && (
          <div className={styles.ingress}>
            <div className={styles.shop}>{t("Shop", "Negozio")}</div>
            {ingressTone === "in_flight" && (
              <span
                key={order?.code}
                className={styles.signal}
                aria-hidden="true"
              />
            )}
            <div className={styles.relay} data-tone={ingressTone}>
              <strong>RelayHub</strong>
              <small>{receipt}</small>
            </div>
          </div>
        )}
        <ul
          className={styles.routes}
          aria-label={t("Destinations", "Destinazioni")}
        >
          {ENDPOINTS.map((endpoint) => {
            const delivery = order?.deliveries.find(
              (item) => item.endpoint === endpoint,
            );
            let pending = t("Awaiting signature", "In attesa della firma");
            if (order?.accepted === false) {
              pending = t("Not sent", "Nessun invio");
            }
            return (
              <li key={endpoint} data-tone={delivery?.outcome ?? "pending"}>
                <div className={styles.row}>
                  <div className={styles.result}>
                    <strong>{names[endpoint]}</strong>
                    <span>
                      {delivery && (
                        <>
                          <OutcomeLabel outcome={delivery.outcome} />
                          {delivery.status !== null && (
                            <code> · HTTP {delivery.status}</code>
                          )}
                          <small>
                            {" "}
                            · {t("attempt", "tentativo")} {delivery.attempts}
                          </small>
                        </>
                      )}
                      {!delivery && pending}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label={names[endpoint]}
                    aria-checked={online[endpoint]}
                    onClick={() => toggle(endpoint)}
                    className={styles.toggle}
                  >
                    <span aria-hidden="true" className={styles.track} />
                    <span aria-hidden="true">
                      {online[endpoint] && "Online"}
                      {!online[endpoint] && "Offline"}
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {timeline && order?.accepted === false && (
        <p className={styles.rejection}>{receipt}</p>
      )}
    </section>
  );
}
