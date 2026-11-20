import { handle, response } from "../../../../server/http";
import { requireReadKey } from "../../../../server/organization-api-keys";
import { readRestResource } from "../../../../server/rest-read";

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const result = await handle(async (correlationId) => {
    const organizationId = await requireReadKey(request);
    const { path } = await context.params;
    const data = await readRestResource(
      organizationId,
      path,
      new URL(request.url).searchParams,
    );
    return response(200, data, correlationId);
  });
  if (result.status === 401) {
    result.headers.set("WWW-Authenticate", 'Bearer realm="RelayHub"');
  }
  return result;
}
