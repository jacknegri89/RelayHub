import { Motion } from "./motion";

export function DeliveryActivity({
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
  const total = delivered + failed;
  let rate = "—";
  if (total > 0) {
    rate = ((delivered / total) * 100).toFixed(1) + "%";
  }

  return (
    <section className="activity-board" aria-labelledby="delivery-activity">
      <header className="activity-header">
        <h2 id="delivery-activity">Delivery activity</h2>
        <span className="time-label">Last 24 hours</span>
      </header>
      <Motion kind="signal" className="activity-route">
        <dl className="activity-inbound">
          <dt className="activity-label">
            <span className="route-joint" data-joint aria-hidden="true" />
            Events received
          </dt>
          <dd>{received.toLocaleString("en")}</dd>
        </dl>
        <div className="route-trace" aria-hidden="true">
          <span data-trace />
          <span className="signal-packet" data-packet />
        </div>
        <div className="activity-outbound">
          <dl>
            <div>
              <dt>Delivered</dt>
              <dd>{delivered.toLocaleString("en")}</dd>
            </div>
            <div>
              <dt>Failed</dt>
              <dd>{failed.toLocaleString("en")}</dd>
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
          <dt>In progress now</dt>
          <dd>{inflight.toLocaleString("en")}</dd>
        </div>
        <div>
          <dt>Success rate</dt>
          <dd>{rate}</dd>
        </div>
        <div>
          <dt>Mean successful latency</dt>
          <dd>{latency}</dd>
        </div>
      </dl>
    </section>
  );
}
