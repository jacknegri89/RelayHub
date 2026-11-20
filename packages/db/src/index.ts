import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client";
import { runtimeDatabaseUrl } from "./connection";

export { Prisma } from "../generated/client";
export type { DeliveryStatus, Role } from "../generated/client";

let client: PrismaClient | undefined;

export function database() {
  if (!client) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required");
    }
    client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: runtimeDatabaseUrl(connectionString),
        connectionTimeoutMillis: 3000,
      }),
    });
  }
  return client;
}
