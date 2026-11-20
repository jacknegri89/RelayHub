export function log(
  level: "info" | "error",
  event: string,
  fields: Record<string, string | number> = {},
) {
  console[level](
    JSON.stringify({ time: new Date().toISOString(), level, event, ...fields }),
  );
}
