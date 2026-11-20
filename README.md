# RelayHub

RelayHub receives signed JSON webhooks and delivers them asynchronously to configured HTTP receivers. It gives an operator one place to inspect retries, failures and delivery history.

[Hosted RelayHub](https://relayhub-chi.vercel.app) · Sign in or activate an invitation. Create a source and use the built-in HTTPS verification receiver shown in **Destinations** to confirm delivery.

- Multi-organization access with owner, admin and viewer roles.
- Signed ingress with size limits, timestamp validation and concurrent deduplication.
- Per-event routing filters, encrypted payload storage and transactional fan-out.
- BullMQ delivery with exponential backoff, bounded Retry-After, fenced claims and a stable delivery ID.
- Scoped operational dashboard and an isolated demo receiver.

Next.js App Router renders the UI and serves HTTP routes. Prisma connects the web and worker processes to PostgreSQL. Redis carries delivery identifiers and generations. Delivery is **at least once**. Receivers should deduplicate by the stable delivery ID.

## Quick start

Use Node.js 24.16+, pnpm 11.25.0 and Docker Compose v2. From the repository root on Windows PowerShell or Linux:

```text
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm setup
docker compose -p relayhub-demo up --build -d --wait
```

Open [RelayHub](http://localhost:3000/register), register with a password of at least 12 characters and create an organization. The Compose migration service applies the versioned migrations before web and worker start. The setup command generates random local credentials and leaves existing configuration alone.

To add a member, ask them for the account ID on their **Organizations** page. In your organization's **Settings**, choose their role and save the account ID.

Use `docker compose -p relayhub-demo logs -f web worker mock-receiver` to watch activity and `docker compose -p relayhub-demo stop` to stop the demo while preserving data. To reset **only this disposable demo project**, run `docker compose -p relayhub-demo down -v` and start it again.

### Work on the host

```text
docker compose -p relayhub-demo up -d postgres redis --wait
pnpm generate
pnpm migrate
```

Run `pnpm dev`, `pnpm worker` and `pnpm receiver` in separate terminals. All host processes use loopback. Use the host processes or the complete Compose stack on the default ports at any given time.

## Demo

Set a local seed password and seed the fictional organization.

PowerShell:

```powershell
$env:DEMO_USER_PASSWORD = Read-Host 'Choose a demo password (at least 12 characters)'
docker compose -p relayhub-demo exec -e DEMO_USER_PASSWORD web pnpm seed
```

Linux:

```bash
read -rsp 'Demo password (12+ characters): ' DEMO_USER_PASSWORD
export DEMO_USER_PASSWORD
docker compose -p relayhub-demo exec -e DEMO_USER_PASSWORD web pnpm seed
```

Sign in as `demo-owner@relayhub.example`. The seed preserves an existing demo account and its chosen password. From **Destinations**, open **Test delivery** on a seeded route and select **Send test**. The event and attempts appear in **Events** and **Deliveries**.

With the application running, use the host CLI (run `pnpm generate` first):

| Command               | Expected result                                          |
| --------------------- | -------------------------------------------------------- |
| `pnpm demo success`   | One delivery with HTTP 200                               |
| `pnpm demo transient` | HTTP 500, HTTP 500, HTTP 200                             |
| `pnpm demo busy`      | HTTP 429, then HTTP 200 after Retry-After                |
| `pnpm demo duplicate` | Six concurrent submissions, one event and one delivery   |
| `pnpm demo permanent` | HTTP 400, then failed                                    |
| `pnpm demo slow`      | HTTP 200 with measurable latency                         |
| `pnpm demo timeout`   | Connection timeout through the configured attempt budget |

To exercise recovery, run `docker compose -p relayhub-demo stop redis`, then `pnpm demo success`, then `docker compose -p relayhub-demo start redis`. The accepted event remains in PostgreSQL and is dispatched after Redis returns. For worker downtime, stop and start `worker` by the same method. To demo manual retry, change the URL of the failed destination to the demo `/hooks/success` endpoint and use **Retry delivery** on the failed delivery.

## Testing and references

Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm audit --prod --audit-level moderate`. With a running isolated demo stack, run `pnpm test:integration` and `pnpm test:e2e`. Install Chromium via `pnpm exec playwright install chromium` before the browser suite.

- [Architecture](docs/architecture.md)
- [Database](docs/database.md)
- [Public API and signing protocol](docs/api.yaml)
- [Security](docs/security.md)
- [Testing](docs/testing.md)
- [Operations and environment variables](docs/operations.md)
- [Architecture decisions and package choices](docs/decisions.md)

Password reset needs a verified mail transport. Management uses session-backed UI routes. Receiver deduplication is in-memory in the demo. Review the security and operations notes before deploying. Further work includes automated envelope re-encryption, wider accessibility testing and external telemetry.

The original code is published for portfolio review with rights reserved. Third-party packages retain their own licenses.
