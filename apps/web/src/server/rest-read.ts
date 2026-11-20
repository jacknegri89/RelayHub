import { database, type Prisma } from "@relayhub/db";
import { deliveryStates } from "@relayhub/shared/delivery-states";
import { eventType } from "@relayhub/shared/protocol";
import { z } from "zod";
import { HttpError } from "./http";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_DETAIL_ATTEMPTS = 20;
const pagination = {
  limit: z
    .string()
    .regex(/^[1-9]\d{0,2}$/)
    .transform(Number)
    .pipe(z.int().max(MAX_LIMIT))
    .default(DEFAULT_LIMIT),
  cursor: z.string().min(1).max(80).optional(),
};
const eventQuery = z.strictObject({
  ...pagination,
  sourceId: z.uuid().optional(),
  eventType: eventType.optional(),
});
const deliveryQuery = z.strictObject({
  ...pagination,
  eventId: z.uuid().optional(),
  destinationId: z.uuid().optional(),
  status: z.enum(deliveryStates).optional(),
});
const eventFields = {
  id: true,
  sourceId: true,
  eventType: true,
  externalId: true,
  receivedAt: true,
  payloadSize: true,
} satisfies Prisma.WebhookEventSelect;
const deliveryFields = {
  id: true,
  eventId: true,
  destinationId: true,
  status: true,
  createdAt: true,
  finishedAt: true,
  attemptCount: true,
  lastStatus: true,
  durationMs: true,
} satisfies Prisma.DeliverySelect;

function decodeCursor(cursor?: string) {
  if (!cursor) {
    return;
  }
  // A timestamp and tie-breaking UUID keep pagination stable when a retained row expires.
  const parts = z
    .tuple([z.iso.datetime({ precision: 3 }), z.uuid()])
    .safeParse(cursor.split("_"));
  if (!parts.success) {
    throw new HttpError(422, "invalid_cursor");
  }
  return { time: new Date(parts.data[0]), id: parts.data[1] };
}

function page<T extends { id: string }>(
  rows: T[],
  limit: number,
  timestamp: (row: T) => Date,
) {
  let nextCursor: string | null = null;
  if (rows.length > limit) {
    rows.pop();
    const last = rows[limit - 1];
    nextCursor = timestamp(last).toISOString() + "_" + last.id;
  }
  return { items: rows, nextCursor };
}

function paramsObject(params: URLSearchParams) {
  const entries: Record<string, string> = Object.create(null);
  for (const [name, value] of params) {
    if (Object.hasOwn(entries, name)) {
      throw new HttpError(422, "invalid_parameters");
    }
    entries[name] = value;
  }
  return entries;
}

async function listEvents(organizationId: string, params: URLSearchParams) {
  const query = eventQuery.safeParse(paramsObject(params));
  if (!query.success) {
    throw new HttpError(422, "invalid_parameters");
  }
  const { sourceId, eventType, limit, cursor } = query.data;
  const position = decodeCursor(cursor);
  const where: Prisma.WebhookEventWhereInput = {
    organizationId,
    sourceId,
    eventType,
  };
  if (position) {
    where.OR = [
      { receivedAt: { lt: position.time } },
      { receivedAt: position.time, id: { lt: position.id } },
    ];
  }
  const rows = await database().webhookEvent.findMany({
    where,
    select: eventFields,
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  return page(rows, limit, (row) => row.receivedAt);
}

async function listDeliveries(organizationId: string, params: URLSearchParams) {
  const query = deliveryQuery.safeParse(paramsObject(params));
  if (!query.success) {
    throw new HttpError(422, "invalid_parameters");
  }
  const { eventId, destinationId, status, limit, cursor } = query.data;
  const position = decodeCursor(cursor);
  const where: Prisma.DeliveryWhereInput = {
    organizationId,
    eventId,
    destinationId,
    status,
  };
  if (position) {
    where.OR = [
      { createdAt: { lt: position.time } },
      { createdAt: position.time, id: { lt: position.id } },
    ];
  }
  const rows = await database().delivery.findMany({
    where,
    select: deliveryFields,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  return page(rows, limit, (row) => row.createdAt);
}

export async function readRestResource(
  organizationId: string,
  path: string[],
  params: URLSearchParams,
) {
  const [resource, id] = path;
  if (
    path.length > 2 ||
    !["events", "deliveries"].includes(resource) ||
    (path.length === 2 && !z.uuid().safeParse(id).success)
  ) {
    throw new HttpError(404, "resource_not_found");
  }
  if (!id) {
    if (resource === "events") {
      return listEvents(organizationId, params);
    }
    return listDeliveries(organizationId, params);
  }
  if (params.size) {
    throw new HttpError(422, "invalid_parameters");
  }
  const where = { organizationId, id };
  if (resource === "events") {
    const item = await database().webhookEvent.findFirst({
      where,
      select: eventFields,
    });
    if (!item) {
      throw new HttpError(404, "resource_not_found");
    }
    return { item };
  }
  const item = await database().delivery.findFirst({
    where,
    select: {
      ...deliveryFields,
      attempts: {
        select: {
          number: true,
          startedAt: true,
          finishedAt: true,
          httpStatus: true,
          durationMs: true,
          outcome: true,
        },
        orderBy: { number: "desc" },
        take: MAX_DETAIL_ATTEMPTS,
      },
    },
  });
  if (!item) {
    throw new HttpError(404, "resource_not_found");
  }
  return { item };
}
