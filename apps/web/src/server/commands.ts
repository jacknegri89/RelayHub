import { z } from "zod";
import { eventType } from "@relayhub/shared/protocol";

const name = z.string().trim().min(1).max(80);
const id = z.uuid();
export const RECOVERY_BATCH_SIZE = 20;
const destination = z.object({
  name,
  url: z.url().max(2048),
  secret: z.string().min(32).max(128).optional(),
});

export const createOrganization = z.object({ name });
export const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("source_create"), name }),
  z.object({
    action: z.literal("source_update"),
    id,
    name,
    enabled: z.boolean(),
  }),
  z.object({ action: z.literal("source_rotate"), id }),
  destination.extend({ action: z.literal("destination_create") }),
  destination.extend({
    action: z.literal("destination_update"),
    id,
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("route_save"),
    sourceId: id,
    destinationId: id,
    eventType: z.union([eventType, z.literal("")]),
  }),
  z.object({
    action: z.literal("route_remove"),
    sourceId: id,
    destinationId: id,
    eventType: z.union([eventType, z.literal("")]),
  }),
  z.object({
    action: z.literal("test_delivery"),
    sourceId: id,
    destinationId: id,
    eventType,
  }),
  z.object({ action: z.literal("delivery_retry"), id }),
  z.object({
    action: z.literal("delivery_retry_group"),
    destinationId: id,
    incidentId: id,
    deliveryIds: z
      .array(id)
      .min(1)
      .max(RECOVERY_BATCH_SIZE)
      .refine((ids) => new Set(ids).size === ids.length),
  }),
  z.object({
    action: z.literal("member_save"),
    accountId: id,
    role: z.enum(["admin", "viewer"]),
  }),
  z.object({ action: z.literal("member_remove"), id }),
  z.object({ action: z.literal("organization_rename"), name }),
]);

export type Command = z.infer<typeof commandSchema>;
