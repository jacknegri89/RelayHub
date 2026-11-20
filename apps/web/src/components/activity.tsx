import { getLocale } from "../server/locale";
import Link from "next/link";
import { notFound } from "next/navigation";
import { database, type DeliveryStatus } from "@relayhub/db";
import type { Query } from "../app/workspace/[organizationId]/[[...section]]/page";
import { ActionForm } from "./forms";
import { Status, ShortId, Time, stateLabel } from "./display";
import { DeliveryActivity } from "./delivery-activity";
import { DeliveryTrace, EventCone } from "./delivery-trace";
import { PageHeading } from "./page-heading";
import { Motion } from "./motion";

const HOUR_MS = 60 * 60 * 1000;
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

export async function Overview({ organizationId }: { organizationId: string }) {
  const { t } = await getLocale();
  const db = database();
  const since = new Date(Date.now() - 24 * HOUR_MS);
  const [received, delivered, failed, inflight, latest] = await Promise.all([
    db.webhookEvent.count({
      where: { organizationId, receivedAt: { gte: since } },
    }),
    db.delivery.aggregate({
      where: {
        organizationId,
        status: "delivered",
        finishedAt: { gte: since },
      },
      _count: { _all: true },
      _avg: { durationMs: true },
    }),
    db.delivery.count({
      where: { organizationId, status: "failed", finishedAt: { gte: since } },
    }),
    db.delivery.count({ where: { organizationId, status: { in: active } } }),
    db.webhookEvent.findMany({
      where: { organizationId },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: 8,
      select: {
        id: true,
        eventType: true,
        externalId: true,
        receivedAt: true,
        source: { select: { name: true } },
        deliveries: { select: { status: true } },
      },
    }),
  ]);
  const completed = delivered._count._all;
  let latency = "—";
  if (delivered._avg.durationMs !== null) {
    latency = Math.round(delivered._avg.durationMs) + " ms";
  }
  return (
    <>
      <PageHeading title={t("Overview", "Panoramica")} />
      <DeliveryActivity
        received={received}
        delivered={completed}
        failed={failed}
        inflight={inflight}
        latency={latency}
      />
      <div className="section-head">
        <h2>{t("Recent events", "Eventi recenti")}</h2>
        <Link href={base(organizationId) + "/events"}>
          {t("All events →", "Tutti gli eventi →")}
        </Link>
      </div>
      <EventTable rows={latest} organizationId={organizationId} />
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
          <input name="q" defaultValue={q} maxLength={100} />
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
      </form>
      <EventTable
        rows={rows.slice(0, PAGE_SIZE)}
        organizationId={organizationId}
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
}: {
  rows: EventRow[];
  organizationId: string;
}) {
  const { t } = await getLocale();
  if (!rows.length) {
    return (
      <p className="empty">
        {t(
          "No matching events. Signed webhooks and test deliveries appear here.",
          "Nessun evento trovato. Qui vedrai i webhook firmati e le consegne di prova.",
        )}
      </p>
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
          <input name="q" defaultValue={q} maxLength={100} />
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
      </form>
      <DeliveryTable
        rows={rows.slice(0, PAGE_SIZE)}
        organizationId={organizationId}
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
}: {
  rows: DeliveryRow[];
  organizationId: string;
}) {
  const { t } = await getLocale();
  if (!rows.length) {
    return (
      <p className="empty">
        {t("No matching deliveries.", "Nessuna consegna trovata.")}
      </p>
    );
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
      <EventCone deliveries={event.deliveries} />
      <h2>{t("Deliveries", "Consegne")}</h2>
      <DeliveryTable rows={rows} organizationId={organizationId} />
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
      destination: { select: { name: true } },
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
      <div className="section-head">
        <Status value={delivery.status} />
        <ShortId id={id} />
      </div>
      <p>
        {t("Event", "Evento")}{" "}
        <Link href={base(organizationId) + "/events/" + delivery.event.id}>
          {delivery.event.externalId}
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
  function link(to: number) {
    return "?" + new URLSearchParams({ ...query, page: String(to) });
  }
  return (
    <nav className="pagination" aria-label={t("Pagination", "Paginazione")}>
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
