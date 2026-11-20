import Link from "next/link";
import { notFound } from "next/navigation";
import { database, type DeliveryStatus } from "@relayhub/db";
import type { Query } from "../app/workspace/[organizationId]/[[...section]]/page";
import { ActionForm } from "./forms";
import { Status, ShortId, Time } from "./display";
import { DeliveryActivity } from "./delivery-activity";
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
      <PageHeading title="Overview" />
      <DeliveryActivity
        received={received}
        delivered={completed}
        failed={failed}
        inflight={inflight}
        latency={latency}
      />
      <div className="section-head">
        <h2>Recent events</h2>
        <Link href={base(organizationId) + "/events"}>All events →</Link>
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
        title="Events"
        description="Find received events by type or sender ID."
      />
      <form className="filters" method="get">
        <label>
          Search <input name="q" defaultValue={q} maxLength={100} />
        </label>
        <label>
          Source{" "}
          <select name="source" defaultValue={sourceId}>
            <option value="">All sources</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </label>
        <button>Filter events</button>
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

function EventTable({
  rows,
  organizationId,
}: {
  rows: EventRow[];
  organizationId: string;
}) {
  if (!rows.length) {
    return (
      <p className="empty">
        No matching events. Signed webhooks and test deliveries appear here.
      </p>
    );
  }
  return (
    <div
      className="table-wrap"
      role="region"
      aria-label="Events table"
      tabIndex={0}
    >
      <table>
        <caption className="sr-only">Webhook events</caption>
        <thead>
          <tr>
            <th scope="col">Received</th>
            <th scope="col">Event type</th>
            <th scope="col">Source</th>
            <th scope="col">Event ID</th>
            <th scope="col">Destinations</th>
            <th scope="col">Status</th>
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
        title="Deliveries"
        description="Track outbound requests, responses and retries."
      />
      <form className="filters" method="get">
        <label>
          Search <input name="q" defaultValue={q} maxLength={100} />
        </label>
        <label>
          Status{" "}
          <select name="status" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            {statuses.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button>Filter deliveries</button>
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

function DeliveryTable({
  rows,
  organizationId,
}: {
  rows: DeliveryRow[];
  organizationId: string;
}) {
  if (!rows.length) {
    return <p className="empty">No matching deliveries.</p>;
  }
  return (
    <div
      className="table-wrap"
      role="region"
      aria-label="Deliveries table"
      tabIndex={0}
    >
      <table>
        <caption className="sr-only">Outbound deliveries</caption>
        <thead>
          <tr>
            <th scope="col">Destination</th>
            <th scope="col">Event ID</th>
            <th scope="col">Status</th>
            <th scope="col">Attempts</th>
            <th scope="col">HTTP</th>
            <th scope="col">Updated</th>
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
      <Link href={base(organizationId) + "/events"}>← Events</Link>
      <PageHeading title={event.eventType} />
      <p className="intro">
        <Status value={eventStatus(event)} />
      </p>
      <dl className="details panel">
        <dt>External event ID</dt>
        <dd>
          <code>{event.externalId}</code>
        </dd>
        <dt>Received</dt>
        <dd>
          <Time value={event.receivedAt} />
        </dd>
        <dt>Source</dt>
        <dd>{event.source.name}</dd>
        <dt>Payload preview</dt>
        <dd>{event.payloadSize} bytes · contents concealed</dd>
        <dt>SHA-256</dt>
        <dd>
          <code>{event.payloadHash}</code>
        </dd>
        <dt>Correlation ID</dt>
        <dd>
          <code>{event.correlationId}</code>
        </dd>
      </dl>
      <h2>Deliveries</h2>
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
      <Link href={base(organizationId) + "/deliveries"}>← Deliveries</Link>
      <PageHeading title={delivery.destination.name} />
      <div className="section-head">
        <Status value={delivery.status} />
        <ShortId id={id} />
      </div>
      <p>
        Event{" "}
        <Link href={base(organizationId) + "/events/" + delivery.event.id}>
          {delivery.event.externalId}
        </Link>
      </p>
      {editable && delivery.status === "failed" && (
        <ActionForm
          endpoint={"/api/organizations/" + organizationId}
          label="Retry delivery"
          fields={{ action: "delivery_retry", id }}
        />
      )}
      <section className="panel">
        <h2>Delivery timeline</h2>
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

function DeliveryTimeline({
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
  const entries = [
    {
      id: "received",
      state: "received",
      at: delivery.event.receivedAt,
      content: (
        <>
          Event received <Time value={delivery.event.receivedAt} />
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
          Most recently queued <Time value={delivery.queuedAt} />
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
          Final outcome: {delivery.status} <Time value={delivery.finishedAt} />
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

function AttemptSummary({ attempt }: { attempt: TimelineAttempt }) {
  return (
    <>
      <strong>Attempt {attempt.number}</strong> ·{" "}
      {attempt.outcome.replaceAll("_", " ")}
      {attempt.httpStatus && <span> · HTTP {attempt.httpStatus}</span>}
      {attempt.durationMs !== null && <span> · {attempt.durationMs} ms</span>}
      <div>
        Claimed <Time value={attempt.startedAt} />
      </div>
      {attempt.finishedAt && (
        <div>
          Completed <Time value={attempt.finishedAt} />
        </div>
      )}
      {attempt.retryAt && (
        <div>
          Retry scheduled for <Time value={attempt.retryAt} />
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

function Pagination({
  page,
  next,
  query,
}: {
  page: number;
  next: boolean;
  query: Record<string, string>;
}) {
  function link(to: number) {
    return "?" + new URLSearchParams({ ...query, page: String(to) });
  }
  return (
    <nav className="pagination" aria-label="Pagination">
      {page > 1 && <Link href={link(page - 1)}>← Previous</Link>}
      <span>Page {page}</span>
      {next && page < 500 && <Link href={link(page + 1)}>Next →</Link>}
    </nav>
  );
}

function base(organizationId: string) {
  return "/workspace/" + organizationId;
}
