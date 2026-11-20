# Testing RelayHub

Start with an isolated PostgreSQL and Redis instance. Integration tests deliberately interrupt the test queue to verify recovery. Use fictional data for all tests.

## Automated checks

| Check               | Command                                    | What it verifies                                                                    |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Formatting and lint | `pnpm format:check` and `pnpm lint`        | Repository style and static analysis                                                |
| Types               | `pnpm generate` and `pnpm typecheck`       | Prisma Client, Next.js types, and strict TypeScript                                 |
| Unit                | `pnpm test`                                | Signatures, validation, encryption, and protocol rules                              |
| Migration           | `pnpm migrate`                             | Versioned schema changes against the test database                                  |
| Integration         | `pnpm test:integration`                    | Tenant access, deduplication, retries, leases, and queue recovery                   |
| Browser             | `pnpm test:e2e`                            | Registration, routing, failed delivery and retry, mobile access, and reduced motion |
| Production build    | `pnpm build`                               | Optimized Next.js output                                                            |
| Dependency audit    | `pnpm audit --prod --audit-level moderate` | Registry advisories for production dependencies                                     |

Run the integration and browser suites with the web service, worker, PostgreSQL, Redis, and demo receiver running. Install Chromium with `pnpm exec playwright install chromium`. Set `CHROMIUM_PATH` if you need a specific local Chromium executable. Selected accessibility checks use axe. Exercise keyboard navigation, browser zoom, and screen reader output before making a conformance claim.

The [GitHub Actions workflow](../.github/workflows/ci.yml) provisions isolated services on Linux and runs the full suite.

The language regression changes English to Italian with a partially filled registration form, follows a policy link, and reloads the page. The authenticator test also switches languages with a password already entered.

## Run the development processes

After installing the workspace dependencies and running `pnpm setup`, start PostgreSQL and Redis:

```sh
docker compose -p relayhub-demo up -d postgres redis --wait
pnpm generate
pnpm migrate
```

In separate terminals, run `pnpm dev`, `pnpm worker`, and `pnpm receiver`. Keep the Compose web, worker, and mock receiver stopped while the equivalent host processes use their ports.

## Exercise delivery locally

Use the [local Compose stack](../README.md#run-locally) or the development processes above. Register, create an organization, and add a source and destination. Use the demo receiver URL shown in **Destinations**, then link the source and leave the event type empty to match every event. Open **Test delivery**, choose the source, and send a test.

To add a member, ask for the account ID shown on their authenticated **Organizations** page. Add it with the appropriate role under the organization's **Settings**.

### Seed and replay fixtures

Choose a password of at least 12 characters. In PowerShell:

```powershell
$env:DEMO_USER_PASSWORD = Read-Host 'Choose a demo password'
docker compose -p relayhub-demo exec -e DEMO_USER_PASSWORD web pnpm seed
```

In Bash:

```bash
read -rsp 'Choose a demo password: ' DEMO_USER_PASSWORD
export DEMO_USER_PASSWORD
docker compose -p relayhub-demo exec -e DEMO_USER_PASSWORD web pnpm seed
```

Sign in as `demo-owner@relayhub.example`. The seed preserves an existing demo account and its password. To replay the scenarios from the host, generate the Prisma Client with `pnpm generate` first.

| Command               | Expected result                                               |
| --------------------- | ------------------------------------------------------------- |
| `pnpm demo success`   | One delivery with HTTP 200                                    |
| `pnpm demo transient` | Two HTTP 500 attempts followed by HTTP 200                    |
| `pnpm demo busy`      | HTTP 429 followed by HTTP 200 after `Retry-After`             |
| `pnpm demo duplicate` | Six concurrent submissions produce one event and one delivery |
| `pnpm demo permanent` | HTTP 400, then a failed delivery                              |
| `pnpm demo slow`      | HTTP 200 with measurable latency                              |
| `pnpm demo timeout`   | Connection timeouts until the attempt budget is exhausted     |

For a manual retry, change the failed destination to the demo `/hooks/success` endpoint and select **Retry delivery**. For a recovery drill, stop Redis in the isolated Compose project, submit `pnpm demo success`, and restart Redis. The accepted event stays in PostgreSQL and is dispatched when Redis returns. The same procedure can be used to exercise worker downtime.

## Verify a hosted deployment

1. Check `GET /api/health/ready` on the stable production origin.
2. Register with a disposable email. Create an organization and route a source to the built-in verification receiver shown in **Destinations**.
3. Send a signed event to the source URL. Expect HTTP 202 from ingress and HTTP 204 in the delivery timeline. Re-submit the identical signed request within the timestamp window. Expect HTTP 200 and the original event ID.
4. Sign in again and confirm that the workspace and delivery history are still present.
5. Enable two-factor authentication using a disposable authenticator key. Sign in again and verify TOTP, a one-time recovery code, and normal sign-in after disabling MFA.
6. Check the homepage on a phone-size viewport. Verify that the opening animation settles, reacts to the pointer on desktop, and respects the system's reduced-motion preference.

### Send a signed event

Run the following code with Node.js. Set `RELAYHUB_TEST_SOURCE_URL` to the complete source endpoint and provide `RELAYHUB_TEST_SOURCE_SECRET` through your shell's secret configuration. Use a test source and destination you control.

```js
import { createHmac, randomUUID } from "node:crypto";

const sourceUrl = process.env.RELAYHUB_TEST_SOURCE_URL;
const sourceSecret = process.env.RELAYHUB_TEST_SOURCE_SECRET;
if (!sourceUrl || !sourceSecret) {
  throw new Error("Provide the test source URL and secret.");
}

const eventId = randomUUID();
const body = JSON.stringify({ type: "verification.ping", id: eventId });
const timestamp = String(Math.floor(Date.now() / 1000));
const digest = createHmac("sha256", sourceSecret)
  .update(timestamp + "." + body)
  .digest("hex");

const response = await fetch(sourceUrl, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-relayhub-event-id": eventId,
    "x-relayhub-timestamp": timestamp,
    "x-relayhub-signature": "v1=" + digest,
  },
  body,
});

console.log(response.status, await response.json());
```

The [API reference](api.yaml) lists all protocol responses. The [Operations guide](operations.md) covers reverse proxy, outbound connectivity, recovery, and production limits.
