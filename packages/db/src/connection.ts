const localHosts = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
  "postgres",
]);
const verifiedModes = new Set([
  "prefer",
  "require",
  "verify-ca",
  "verify-full",
]);

export function runtimeDatabaseUrl(connectionString: string) {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Invalid DATABASE_URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
    throw new Error("Invalid DATABASE_URL");
  }
  const options = url.searchParams;
  // pg allows query-string host overrides. Use the actual connection host for TLS policy.
  const host = options.getAll("host").at(-1) || url.hostname;
  const mode = options.getAll("sslmode").at(-1);
  if (localHosts.has(host) && (!mode || mode === "disable")) {
    return connectionString;
  }
  if (mode && !verifiedModes.has(mode)) {
    throw new Error("Remote PostgreSQL requires sslmode=verify-full");
  }
  options.set("sslmode", "verify-full");
  return url.toString();
}
