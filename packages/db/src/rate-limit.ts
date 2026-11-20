import { database, type Prisma } from "./index";

export async function withinLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  client: Pick<Prisma.TransactionClient, "$queryRaw"> = database(),
) {
  const windowMs = windowSeconds * 1000;
  const bucket = Math.floor(Date.now() / windowMs);
  const expiresAt = new Date((bucket + 1) * windowMs);
  const counterKey = key + ":" + bucket;
  const rows = await client.$queryRaw<{ hits: number }[]>`
    INSERT INTO "RequestCounter" ("key", "hits", "expiresAt")
    VALUES (${counterKey}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET "hits" = "RequestCounter"."hits" + 1
    WHERE "RequestCounter"."hits" < ${limit}
    RETURNING "hits"
  `;
  return rows.length > 0;
}
