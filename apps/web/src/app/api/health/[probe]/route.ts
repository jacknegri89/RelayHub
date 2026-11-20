import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ probe: string }> },
) {
  const { probe } = await context.params;
  const headers = { "cache-control": "no-store" };
  if (probe === "live") {
    return Response.json({ status: "live" }, { headers });
  }
  if (probe !== "ready") {
    return new Response(null, { status: 404 });
  }
  try {
    settings();
    await database().$queryRaw`SELECT 1`;
    return Response.json({ status: "ready" }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { headers, status: 503 });
  }
}
