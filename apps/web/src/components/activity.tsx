import { getLocale } from "../server/locale";
import Link from "next/link";
import { notFound } from "next/navigation";
import { database, type DeliveryStatus } from "@relayhub/db";
import type { Query } from "../app/workspace/[organizationId]/[[...section]]/page";
import { ActionForm } from "./forms";
import { Status, Time, stateLabel } from "./display";
import { DeliveryActivity, ResponseTimes } from "./delivery-activity";
import { OverviewRouting } from "./overview-routing";
import { DeliveryTrace, EventCone } from "./delivery-trace";
import { WorkspaceEmpty } from "./workspace-empty";
import recordStyles from "./workspace-records.module.css";
import { PageHeading } from "./page-heading";
import { Motion } from "./motion";
import { readOverview } from "../server/overview";
import { OverviewTrend } from "./overview-trend";
import styles from "./overview.module.css";

const PAGE_SIZE = 20;
const statuses: DeliveryStatus[] = [
  "pending",
  "queued",
  "delivering",
  "retry_scheduled",
  "delivered",
  "failed",
  "cancelled",
];
const active = statuses.slice(0, 4);

export async function Overview({
  organizationId,
  editable,
}: {
  organizationId: string;
  editable: boolean;
}) {
  const { locale, t } = await getLocale();
  const report = await readOverview(organizationId);
  const workspace = base(organizationId);
  // Daily counts can outlive their events, including after a route is disabled.
  const hasTraffic =
    report.latest.length > 0 ||
    report.days.some((day) => day.succeeded > 0 || day.failed > 0);
  const heading = <PageHeading title={t("Overview", "Panoramica")} />;
  const trend = <OverviewTrend days={report.days} locale={locale} />;
  const routing = (
    <OverviewRouting
      report={report}
      workspace={workspace}
      locale={locale}
      editable={editable}
      awaitingEvent={!hasTraffic}
    />
  );
  if (!hasTraffic) {
    const number = new Intl.NumberFormat(locale);
    return (
      <>
        {heading}
        {routing}
        <div className={styles.lower}>
          {trend}
          <section className={styles.quiet} aria-labelledby="quiet-activity">
            <header className={styles.sectionTitle}>
              <h2 id="quiet-activity">
                {t("Delivery activity", "Attività di consegna")}
              </h2>
              <span>{t("Last 24 hours", "Ultime 24 ore")}</span>
            </header>
            <dl className={styles.ledger}>
              <div>
                <dt>{t("Events received", "Eventi ricevuti")}</dt>
                <dd>{number.format(report.received)}</dd>
              </div>
              <div>
                <dt>{t("Successful deliveries", "Consegne riuscite")}</dt>
                <dd>{number.format(report.counts.delivered)}</dd>
              </div>
              <div>
                <dt>{t("Failed deliveries", "Consegne fallite")}</dt>
                <dd>{number.format(report.counts.failed)}</dd>
              </div>
            </dl>
            <div className={styles.registers}>
              <Link href={workspace + "/events"}>
                {t("Event log", "Registro eventi")} →
              </Link>
              <Link href={workspace + "/deliveries"}>
                {t("Full delivery history", "Storico completo delle consegne")}{" "}
                →
              </Link>
            </div>
          </section>
        </div>
      </>
    );
  }
  return (
    <>
      {heading}
      <DeliveryActivity report={report} workspace={workspace} locale={locale} />
      <div className={styles.lower}>
        {trend}
        {report.latest.length > 0 && (
          <section
            className={styles.recent}
            aria-label={t("Recent events", "Eventi recenti")}
          >
            <header>
              <h2>{t("Recent events", "Eventi recenti")}</h2>
              <Link href={workspace + "/events"}>
                {t("All events →", "Tutti gli eventi →")}
              </Link>
            </header>
            <ul className={styles.feed}>
              {report.latest.map((event) => (
                <li key={event.id}>
                  <div>
                    <Link href={workspace + "/events/" + event.id}>
                      {event.eventType}
                    </Link>
                    <Status value={eventStatus(event)} />
                  </div>
                  <span>
                    {event.source.name} · <Time value={event.receivedAt} />
                  </span>
                  <code title={event.externalId}>{event.externalId}</code>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className={styles.support}>
        {routing}
        {report.timings.samples > 0 && (
          <ResponseTimes timings={report.timings} locale={locale} />
        )}
      </div>
    </>
  );
}

export async function Events({
  organizationId,
  query,
}: {
  organizationId: string;
  query: Query;
}) {
  const { t } = await getLocale();
  const { page, q } = paging(query);
  const sourceId = single(query.source).slice(0, 80);
  const db = database();
  const where = {
    organizationId,
    ...(sourceId && { sourceId }),
    ...(q && {
      OR: [
        { eventType: { contains: q, mode: "insensitive" as const } },
        { externalId: { contains: q, mode: "insensitive" as const } },
      ],
    }),
  };
  const [rows, sources] = await Promise.all([
    db.webhookEvent.findMany({
      where,
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      select: {
        id: true,
        externalId: true,
        eventType: true,
        receivedAt: true,
        source: { select: { name: true } },
        deliveries: { select: { status: true } },
      },
    }),
    db.webhookSource.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <>
      <PageHeading
        title={t("Events", "Eventi")}
        description={t(
          "Find received events by type or sender ID.",
          "Cerca gli eventi ricevuti per tipo o per ID del mittente.",
        )}
      />
      <form className="filters" method="get">
        <label>
          {t("Search", "Cerca")}{" "}
          <input
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder={t(
              "e.g. order.created or evt_123",
              "Es. order.created o evt_123",
            )}
          />
        </label>
        <label>
          {t("Source", "Sorgente")}{" "}
          <select name="source" defaultValue={sourceId}>
            <option value="">{t("All sources", "Tutte le sorgenti")}</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </label>
        <button>{t("Filter events", "Filtra eventi")}</button>
        {rows.length > 0 && (q || sourceId) && (
          <Link href={base(organizationId) + "/events"}>
            {t("Clear filters", "Azzera i filtri")}
          </Link>
        )}
      </form>
      <EventTable
        rows={rows.slice(0, PAGE_SIZE)}
        organizationId={organizationId}
        hasFilters={Boolean(q || sourceId)}
        page={page}
      />
      <Pagination
        page={page}
        next={rows.length > PAGE_SIZE}
        query={{ q, source: sourceId }}
      />
    </>
  );
}

type EventRow = {
  id: string;
  eventType: string;
  externalId: string;
  receivedAt: Date;
  source: { name: string };
  deliveries: { status: DeliveryStatus }[];
};

function eventStatus(event: EventRow) {
  if (!event.deliveries.length) {
    return "unrouted";
  }
  if (event.deliveries.some((item) => active.includes(item.status))) {
    return "in_progress";
  }
  if (event.deliveries.every((item) => item.status === "delivered")) {
    return "delivered";
  }
  if (event.deliveries.some((item) => item.status === "delivered")) {
    return "partial";
  }
  return "failed";
}

async function EventTable({
  rows,
  organizationId,
  hasFilters,
  page,
}: {
  rows: EventRow[];
  organizationId: string;
  hasFilters: boolean;
  page: number;
}) {
  const { t } = await getLocale();
  if (!rows.length) {
    return (
      <ActivityListEmpty
        organizationId={organizationId}
        kind="events"
        hasFilters={hasFilters}
        page={page}
      />
    );
  }
  return (
    <div
      className="table-wrap"
      role="region"
      aria-label={t("Events table", "Tabella degli eventi")}
      tabIndex={0}
    >
      <table>
        <caption className="sr-only">
          {t("Webhook events", "Eventi webhook")}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t("Received", "Ricezione")}</th>
            <th scope="col">{t("Event type", "Tipo di evento")}</th>
            <th scope="col">{t("Source", "Sorgente")}</th>
            <th scope="col">{t("Event ID", "ID evento")}</th>
            <th scope="col">{t("Destinations", "Destinazioni")}</th>
            <th scope="col">{t("Status", "Stato")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((event) => (
            <tr key={event.id}>
              <td>
                <Time value={event.receivedAt} />
              </td>
              <td>
                <Link href={base(organizationId) + "/events/" + event.id}>
                  {event.eventType}
                </Link>
              </td>
              <td>{event.source.name}</td>
              <td>
                <code>{event.externalId}</code>
              </td>
              <td>{event.deliveries.length}</td>
              <td>
                <Status value={eventStatus(event)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function Deliveries({
  organizationId,
  query,
}: {
  organizationId: string;
  query: Query;
}) {
  const { t } = await getLocale();
  const { page, q } = paging(query);
  const status = statuses.find(
    (candidate) => candidate === single(query.status),
  );
  const rows = await database().delivery.findMany({
    where: {
      organizationId,
      status,
      ...(q && {
        OR: [
          { event: { externalId: { contains: q, mode: "insensitive" } } },
          { destination: { name: { contains: q, mode: "insensitive" } } },
        ],
      }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      status: true,
      attemptCount: true,
      lastStatus: true,
      updatedAt: true,
      destination: { select: { name: true } },
      event: { select: { externalId: true } },
    },
  });
  return (
    <>
      <PageHeading
        title={t("Deliveries", "Consegne")}
        description={t(
          "Track outbound requests, responses and retries.",
          "Segui le richieste in uscita, le risposte e i tentativi di riconsegna.",
        )}
      />
      <form className="filters" method="get">
        <label>
          {t("Search", "Cerca")}{" "}
          <input
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder={t(
              "e.g. Warehouse or evt_123",
              "Es. Magazzino o evt_123",
            )}
          />
        </label>
        <label>
          {t("Status", "Stato")}{" "}
          <select name="status" defaultValue={status ?? ""}>
            <option value="">{t("All statuses", "Tutti gli stati")}</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {stateLabel(value, t)}
              </option>
            ))}
          </select>
        </label>
        <button>{t("Filter deliveries", "Filtra consegne")}</button>
        {rows.length > 0 && (q || status) && (
          <Link href={base(organizationId) + "/deliveries"}>
            {t("Clear filters", "Azzera i filtri")}
          </Link>
        )}
      </form>
      <DeliveryTable
        rows={rows.slice(0, PAGE_SIZE)}
        organizationId={organizationId}
        empty={
          <ActivityListEmpty
            organizationId={organizationId}
            kind="deliveries"
            hasFilters={Boolean(q || status)}
            page={page}
          />
        }
      />
      <Pagination
        page={page}
        next={rows.length > PAGE_SIZE}
        query={{ q, status: status ?? "" }}
      />
    </>
  );
}

type DeliveryRow = {
  id: string;
  status: DeliveryStatus;
  attemptCount: number;
  lastStatus: number | null;
  updatedAt: Date;
  destination: { name: string };
  event: { externalId: string };
};

async function DeliveryTable({
  rows,
  organizationId,
  empty,
}: {
  rows: DeliveryRow[];
  organizationId: string;
  empty?: React.ReactNode;
}) {
  const { t } = await getLocale();
  if (!rows.length) {
    return empty;
  }
  return (
    <div
      className="table-wrap"
      role="region"
      aria-label={t("Deliveries table", "Tabella delle consegne")}
      tabIndex={0}
    >
      <table>
        <caption className="sr-only">
          {t("Outbound deliveries", "Consegne in uscita")}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t("Destination", "Destinazione")}</th>
            <th scope="col">{t("Event ID", "ID evento")}</th>
            <th scope="col">{t("Status", "Stato")}</th>
            <th scope="col">{t("Attempts", "Tentativi")}</th>
            <th scope="col">HTTP</th>
            <th scope="col">{t("Updated", "Ultimo aggiornamento")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link href={base(organizationId) + "/deliveries/" + row.id}>
                  {row.destination.name}
                </Link>
              </td>
              <td>
                <code>{row.event.externalId}</code>
              </td>
              <td>
                <Status value={row.status} />
              </td>
              <td>{row.attemptCount}</td>
              <td>{row.lastStatus ?? "—"}</td>
              <td>
                <Time value={row.updatedAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function EventDetail({
  organizationId,
  id,
}: {
  organizationId: string;
  id: string;
}) {
  const { t } = await getLocale();
  const event = await database().webhookEvent.findUnique({
    where: { id, organizationId },
    select: {
      id: true,
      eventType: true,
      externalId: true,
      payloadSize: true,
      payloadHash: true,
      correlationId: true,
      receivedAt: true,
      source: { select: { name: true } },
      deliveries: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          attemptCount: true,
          lastStatus: true,
          updatedAt: true,
          destination: { select: { name: true } },
        },
      },
    },
  });
  if (!event) {
    notFound();
  }
  const rows = event.deliveries.map((row) => ({
    ...row,
    event: { externalId: event.externalId },
  }));
  return (
    <>
      <Link href={base(organizationId) + "/events"}>
        {t("← Events", "← Eventi")}
      </Link>
      <PageHeading title={event.eventType} />
      <p className="intro">
        <Status value={eventStatus(event)} />
      </p>
      <dl className="details panel">
        <dt>{t("External event ID", "ID evento esterno")}</dt>
        <dd>
          <code>{event.externalId}</code>
        </dd>
        <dt>{t("Received", "Ricezione")}</dt>
        <dd>
          <Time value={event.receivedAt} />
        </dd>
        <dt>{t("Source", "Sorgente")}</dt>
        <dd>{event.source.name}</dd>
        <dt>{t("Payload preview", "Anteprima del payload")}</dt>
        <dd>
          {event.payloadSize}{" "}
          {t("bytes · contents concealed", "byte · contenuto nascosto")}
        </dd>
        <dt>SHA-256</dt>
        <dd>
          <code>{event.payloadHash}</code>
        </dd>
        <dt>{t("Correlation ID", "ID di correlazione")}</dt>
        <dd>
          <code>{event.correlationId}</code>
        </dd>
      </dl>
      {rows.length > 0 && (
        <>
          <EventCone deliveries={event.deliveries} />
          <h2>{t("Deliveries", "Consegne")}</h2>
          <DeliveryTable rows={rows} organizationId={organizationId} />
        </>
      )}
      {!rows.length && (
        <WorkspaceEmpty
          kind="destination"
          title={t(
            "No deliveries for this event",
            "Nessuna consegna per questo evento",
          )}
          description={t(
            "RelayHub received the event. Its source and event type must match a route to an enabled destination to create a delivery.",
            "RelayHub ha ricevuto l’evento. Per creare una consegna, la sorgente e il tipo di evento devono corrispondere a una regola di una destinazione attiva.",
          )}
          link={{
            href: base(organizationId) + "/destinations",
            label: t(
              "View destination routes",
              "Vedi le regole delle destinazioni",
            ),
          }}
        />
      )}
    </>
  );
}

export async function DeliveryDetail({
  id,
  organizationId,
  editable,
}: {
  id: string;
  organizationId: string;
  editable: boolean;
}) {
  const { t } = await getLocale();
  const delivery = await database().delivery.findUnique({
    where: { id, organizationId },
    select: {
      id: true,
      status: true,
      queuedAt: true,
      finishedAt: true,
      nextAt: true,
      destination: { select: { id: true, name: true } },
      event: { select: { id: true, externalId: true, receivedAt: true } },
      attempts: { orderBy: { number: "asc" } },
    },
  });
  if (!delivery) {
    notFound();
  }
  return (
    <>
      <Link href={base(organizationId) + "/deliveries"}>
        {t("← Deliveries", "← Consegne")}
      </Link>
      <PageHeading title={delivery.destination.name} />
      <dl className={recordStyles.deliveryFacts}>
        <div>
          <dt>{t("Status", "Stato")}</dt>
          <dd>
            <Status value={delivery.status} />
          </dd>
        </div>
        <div>
          <dt>{t("Delivery ID", "ID consegna")}</dt>
          <dd>
            <code className={recordStyles.identifier}>{id}</code>
          </dd>
        </div>
        <div>
          <dt>{t("Event", "Evento")}</dt>
          <dd>
            <Link href={base(organizationId) + "/events/" + delivery.event.id}>
              {delivery.event.externalId}
            </Link>
          </dd>
        </div>
      </dl>
      <p>
        <Link
          href={
            base(organizationId) + "/destinations/" + delivery.destination.id
          }
        >
          {t("View destination history", "Vedi lo storico della destinazione")}
        </Link>
      </p>
      {editable && delivery.status === "failed" && (
        <ActionForm
          endpoint={"/api/organizations/" + organizationId}
          label={t("Retry delivery", "Riprova la consegna")}
          fields={{ action: "delivery_retry", id }}
          className="action-form retry-form"
        />
      )}
      <DeliveryTrace delivery={delivery} />
      <section className="panel">
        <h2>{t("Delivery timeline", "Cronologia della consegna")}</h2>
        <Motion kind="timeline">
          <ol className="timeline">
            <DeliveryTimeline delivery={delivery} />
          </ol>
        </Motion>
      </section>
    </>
  );
}

type TimelineAttempt = {
  number: number;
  outcome: string;
  startedAt: Date;
  finishedAt: Date | null;
  retryAt: Date | null;
  httpStatus: number | null;
  durationMs: number | null;
};

async function DeliveryTimeline({
  delivery,
}: {
  delivery: {
    status: DeliveryStatus;
    event: { receivedAt: Date };
    queuedAt: Date | null;
    finishedAt: Date | null;
    attempts: (TimelineAttempt & { id: string })[];
  };
}) {
  const { t } = await getLocale();
  const entries = [
    {
      id: "received",
      state: "received",
      at: delivery.event.receivedAt,
      content: (
        <>
          {t("Event received", "Evento ricevuto")}{" "}
          <Time value={delivery.event.receivedAt} />
        </>
      ),
    },
  ];
  if (delivery.queuedAt) {
    entries.push({
      id: "queued",
      state: "queued",
      at: delivery.queuedAt,
      content: (
        <>
          {t("Most recently queued", "Ultimo inserimento in coda")}{" "}
          <Time value={delivery.queuedAt} />
        </>
      ),
    });
  }
  for (const attempt of delivery.attempts) {
    entries.push({
      id: attempt.id,
      state: attempt.outcome,
      at: attempt.startedAt,
      content: <AttemptSummary attempt={attempt} />,
    });
  }
  if (delivery.finishedAt) {
    entries.push({
      id: "finished",
      state: delivery.status,
      at: delivery.finishedAt,
      content: (
        <>
          {t("Final outcome:", "Esito finale:")}{" "}
          {stateLabel(delivery.status, t)} <Time value={delivery.finishedAt} />
        </>
      ),
    });
  }
  entries.sort((left, right) => left.at.getTime() - right.at.getTime());
  return entries.map(({ id, state, content }) => (
    <li key={id} data-state={state}>
      {content}
    </li>
  ));
}

async function AttemptSummary({ attempt }: { attempt: TimelineAttempt }) {
  const { t } = await getLocale();
  return (
    <>
      <strong>
        {t("Attempt", "Tentativo")} {attempt.number}
      </strong>{" "}
      · {stateLabel(attempt.outcome, t)}
      {attempt.httpStatus && <span> · HTTP {attempt.httpStatus}</span>}
      {attempt.durationMs !== null && <span> · {attempt.durationMs} ms</span>}
      <div>
        {t("Claimed", "Preso in carico")} <Time value={attempt.startedAt} />
      </div>
      {attempt.finishedAt && (
        <div>
          {t("Completed", "Completato")} <Time value={attempt.finishedAt} />
        </div>
      )}
      {attempt.retryAt && (
        <div>
          {t("Retry scheduled for", "Nuovo tentativo previsto per")}{" "}
          <Time value={attempt.retryAt} />
        </div>
      )}
    </>
  );
}

function single(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value;
  }
  return "";
}

function paging(query: Query) {
  const requested = Number(single(query.page));
  let page = 1;
  if (Number.isSafeInteger(requested) && requested > 1) {
    page = Math.min(requested, 500);
  }
  return { page, q: single(query.q).trim().slice(0, 100) };
}

async function ActivityListEmpty({
  organizationId,
  kind,
  hasFilters,
  page,
}: {
  organizationId: string;
  kind: "events" | "deliveries";
  hasFilters: boolean;
  page: number;
}) {
  const { t } = await getLocale();
  const workspace = base(organizationId);
  if (page > 1) {
    return (
      <WorkspaceEmpty
        kind="filter"
        title={t(
          "No more results on this page",
          "Nessun altro risultato in questa pagina",
        )}
        description={t(
          "Use the navigation below to return to an earlier page with the same filters.",
          "Con i comandi sotto puoi tornare indietro mantenendo gli stessi filtri.",
        )}
      />
    );
  }
  if (hasFilters) {
    let title = t("No matching events", "Nessun evento corrispondente");
    if (kind === "deliveries") {
      title = t("No matching deliveries", "Nessuna consegna corrispondente");
    }
    return (
      <WorkspaceEmpty
        kind="filter"
        title={title}
        description={t(
          "Try a different search or clear the filters to return to the full list.",
          "Prova una ricerca diversa o azzera i filtri per tornare all’elenco completo.",
        )}
        link={{
          href: workspace + "/" + kind,
          label: t("Clear filters", "Azzera i filtri"),
        }}
      />
    );
  }
  if (kind === "events") {
    return (
      <WorkspaceEmpty
        kind="events"
        title={t("No events recorded", "Nessun evento registrato")}
        description={t(
          "When a sending app calls its source URL with a signed webhook, the event appears here with its type and sender ID.",
          "Quando un’app invia un webhook firmato all’URL della sorgente, qui compaiono il tipo di evento e l’ID assegnato dal mittente.",
        )}
        link={{
          href: workspace + "/sources",
          label: t("View sources", "Vedi le sorgenti"),
        }}
      />
    );
  }
  return (
    <WorkspaceEmpty
      kind="destination"
      title={t("No deliveries recorded", "Nessuna consegna registrata")}
      description={t(
        "When an incoming event matches a route, RelayHub creates a delivery for its destination. Each attempt and HTTP response is recorded here.",
        "Quando un evento corrisponde a una regola di inoltro, RelayHub crea una consegna per la destinazione. Qui vedrai i tentativi e le risposte HTTP.",
      )}
      link={{
        href: workspace + "/destinations",
        label: t("View destinations", "Vedi le destinazioni"),
      }}
    />
  );
}

async function Pagination({
  page,
  next,
  query,
}: {
  page: number;
  next: boolean;
  query: Record<string, string>;
}) {
  const { t } = await getLocale();
  if (page === 1 && !next) {
    return null;
  }
  function link(to: number) {
    return "?" + new URLSearchParams({ ...query, page: String(to) });
  }
  return (
    <nav className="pagination" aria-label={t("Pagination", "Paginazione")}>
      {page > 2 && (
        <Link href={link(1)}>{t("First page", "Prima pagina")}</Link>
      )}
      {page > 1 && (
        <Link href={link(page - 1)}>{t("← Previous", "← Precedente")}</Link>
      )}
      <span>
        {t("Page", "Pagina")} {page}
      </span>
      {next && page < 500 && (
        <Link href={link(page + 1)}>{t("Next →", "Successiva →")}</Link>
      )}
    </nav>
  );
}

function base(organizationId: string) {
  return "/workspace/" + organizationId;
}
