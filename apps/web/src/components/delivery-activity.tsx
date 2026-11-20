import { getLocale } from "../server/locale";
import { Motion } from "./motion";

export async function DeliveryActivity({
  received,
  delivered,
  failed,
  inflight,
  latency,
}: {
  received: number;
  delivered: number;
  failed: number;
  inflight: number;
  latency: string;
}) {
  const { locale, t } = await getLocale();
  const total = delivered + failed;
  let rate = "—";
  if (total > 0) {
    rate = new Intl.NumberFormat(locale, {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(delivered / total);
  }

  return (
    <section className="activity-board" aria-labelledby="delivery-activity">
      <header className="activity-header">
        <h2 id="delivery-activity">
          {t("Delivery activity", "Attività di consegna")}
        </h2>
        <span className="time-label">
          {t("Last 24 hours", "Ultime 24 ore")}
        </span>
      </header>
      <Motion kind="signal" className="activity-route">
        <dl className="activity-inbound">
          <dt className="activity-label">
            <span className="route-joint" data-joint aria-hidden="true" />
            {t("Events received", "Eventi ricevuti")}
          </dt>
          <dd>{received.toLocaleString(locale)}</dd>
        </dl>
        <div className="route-trace" aria-hidden="true">
          <span data-trace />
          <span className="signal-packet" data-packet />
        </div>
        <div className="activity-outbound">
          <dl>
            <div>
              <dt>{t("Delivered", "Consegnati")}</dt>
              <dd>{delivered.toLocaleString(locale)}</dd>
            </div>
            <div>
              <dt>{t("Failed", "Falliti")}</dt>
              <dd>{failed.toLocaleString(locale)}</dd>
            </div>
          </dl>
          {total > 0 && (
            <div className="outcome-track" aria-hidden="true">
              <span data-trace style={{ flexGrow: delivered }} />
              <span data-trace style={{ flexGrow: failed }} />
            </div>
          )}
        </div>
      </Motion>
      <dl className="activity-measures">
        <div>
          <dt>{t("In progress now", "In corso")}</dt>
          <dd>{inflight.toLocaleString(locale)}</dd>
        </div>
        <div>
          <dt>{t("Success rate", "Tasso di successo")}</dt>
          <dd>{rate}</dd>
        </div>
        <div>
          <dt>
            {t(
              "Mean successful latency",
              "Latenza media delle consegne riuscite",
            )}
          </dt>
          <dd>{latency}</dd>
        </div>
      </dl>
    </section>
  );
}
