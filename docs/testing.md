# Testing

| Check           | Command                                                                      | Prerequisites                                                  |
| --------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Unit            | `pnpm test`                                                                  | Installed packages                                             |
| Static analysis | `pnpm generate`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`          | Generated client                                               |
| Migration       | `pnpm migrate`                                                               | Isolated PostgreSQL                                            |
| Integration     | `pnpm test:integration`                                                      | Running web, worker, PostgreSQL, Redis and demo receiver       |
| Browser         | `pnpm test:e2e`                                                              | Running demo stack and `pnpm exec playwright install chromium` |
| Build           | `pnpm build`                                                                 | Generated client                                               |
| Supply chain    | `pnpm install --frozen-lockfile`, `pnpm audit --prod --audit-level moderate` | Registry access                                                |

The integration suite uses real HTTP, PostgreSQL and Redis. It creates fictional identities per run, checks ingress, RBAC, encryption, fan-out, retries, claim fencing and simulated downtime. The Redis pause deliberately affects the entire Redis instance, so use a disposable instance. Leave each test environment separate from personal or production data.

Playwright follows the operator flow through registration, login, routing, failure and retry. Axe evaluates selected pages. Exercise keyboard navigation, zoom, mobile layout and screen reader output before making an accessibility conformance claim. Default Chromium can be replaced with a local Chromium binary via CHROMIUM_PATH.

## Check the interface by hand

1. Open `http://localhost:3000/register`, create an account and add an organization. Create a source, then create a destination using the demo receiver URL shown in the form.
2. On the destination, link the source and leave the event type empty to match all types. Open **Test delivery**, choose the source and send a test. Check the event, delivery timeline and Overview counts after refreshing.
3. Repeat with the demo receiver path `/hooks/transient` to see two HTTP 500 responses followed by HTTP 200. For manual retry, use `/hooks/permanent`, then edit the destination back to `/hooks/success` and retry from the failed delivery.
4. At a 375 px viewport, use Tab to navigate through the menu and form fields. Tables can scroll within their own region. In Chrome DevTools, open **Rendering** and emulate `prefers-reduced-motion: reduce`. Reload and navigate between sections. The route trace, headings, timeline and form feedback should appear immediately.

For the browser suite, install Chromium with `pnpm exec playwright install chromium`, then run `pnpm test:e2e` against the running demo stack. The suite saves screenshots of the Overview and delivery timeline in `test-results/`.

See the README for manual Compose outage scenarios. CI also runs the checks on Linux. A workflow file in the checkout and a completed GitHub Actions run provide different evidence. Production verification needs actual HTTPS destinations, proxies, egress controls and recovery drills.

## Local verification

The optimized build was exercised on Windows with Node 26.12.1, PostgreSQL 17.12, the Redis 8.10.3 Windows port and local Chromium. Both migrations applied and the Prisma schema diff was empty. During a planned Redis shutdown, ingress returned HTTP 202 and the outbox remained in PostgreSQL. Restarting Redis delivered the event with one HTTP 200 attempt.

The demo and production Compose files passed Compose configuration validation. Container startup requires a host with a working Docker daemon. The Linux CI workflow and a production HTTPS deployment still require execution.
