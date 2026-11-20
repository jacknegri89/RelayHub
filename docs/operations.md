# Operating RelayHub

## Configuration

| Setting                                                 | Purpose                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| RELAYHUB_MODE                                           | `production` or explicit loopback-only `demo`                                               |
| RELAYHUB_BASE_URL                                       | Exact public origin. HTTPS in production                                                    |
| RELAYHUB_PREVIOUS_ORIGIN                                | Optional previous HTTPS origin for browser redirects and existing verification destinations |
| DATABASE_URL / REDIS_URL                                | Private database and queue service URLs                                                     |
| BETTER_AUTH_SECRET                                      | Random secret of at least 32 characters                                                     |
| ACTIVE_KEY_ID / ENCRYPTION_KEYS                         | Active key ID and comma-separated `id:64-hex-characters` keyring                            |
| DESTINATION_HOSTS                                       | Comma-separated exact production receiver domains                                           |
| VERIFICATION_RECEIVER_SECRET                            | Optional, separate key of at least 32 characters for the built-in HTTPS receiver            |
| TRUST_PROXY                                             | Set to `1` only behind a trusted proxy that overwrites X-Real-IP                            |
| PAYLOAD_LIMIT_BYTES / WEBHOOK_WINDOW_SECONDS            | Defaults 262144 bytes and 300 seconds                                                       |
| RETENTION_DAYS                                          | Defaults to 30                                                                              |
| DELIVERY_TIMEOUT_MS / MAX_ATTEMPTS / WORKER_CONCURRENCY | Defaults 5000, 5 and 4                                                                      |
| WORKER_HEALTH_PORT                                      | Loopback worker health port, default 3002                                                   |
| DEMO_RECEIVER_URL / DEMO_RECEIVER_SECRET                | Demo only. Use an explicit loopback or Compose receiver origin                              |

## Linux container deployment

Build and verify an image in CI, record its immutable reference as RELAYHUB_IMAGE and use `docker compose -f compose.production.yaml`. Supply .env privately with the production settings, including a generated PostgreSQL password and service hostnames `postgres` and `redis`. Set an independently generated signing/session keyring. The database and queue have no published ports. Place the reverse proxy on the host with TLS and forward only to loopback port 3000. Set strict body and read timeouts. If proxy mode is enabled, overwrite X-Real-IP with the trusted peer address.

Apply migrations as a one-shot service before bringing up the new web and worker. Back up first, verify readiness, then check a real signed request to an approved endpoint. Roll back by redeploying the prior image only when its schema is compatible. Use a tested restore for incompatible migrations.

The web health endpoints are `/api/health/live` and `/api/health/ready`. Web readiness requires PostgreSQL because ingress can commit during a Redis outage. The worker's loopback port provides `/live` and `/ready`. Worker readiness requires PostgreSQL, Redis, and a recent dispatcher tick. Keep process logs in a restricted sink. Monitor the age of the oldest due outbox entry, recurring worker errors, and terminal failures.

## Vercel deployment

`vercel.json` declares a Next.js HTTP service and a BullMQ production daemon in Frankfurt (`fra1`). `Dockerfile.worker` packages the daemon. Keep test data and local keys separate from the hosted environment.

The hosted project is connected to [jacknegri89/RelayHub](https://github.com/jacknegri89/RelayHub). A push to `main` triggers a Vercel production build. GitHub Actions runs checks independently. Confirm the commit in both services when verifying a release.

The primary origin is [relayhub-webhooks.vercel.app](https://relayhub-webhooks.vercel.app). Browser links on the previous hostname redirect to the primary origin. Legacy webhook URLs stay available for existing clients. Browser sessions are scoped to their hostname.

Provision a dedicated PostgreSQL database and a Redis endpoint with TCP/TLS access and `noeviction`. Apply the Prisma migrations to that database before deploying. Set the Production environment variables listed above, with `RELAYHUB_MODE=production`, `RELAYHUB_BASE_URL` set to the stable HTTPS production origin, and fresh session and encryption keys. Provide approved HTTPS receiver domains in `DESTINATION_HOSTS`. The loopback-only demo receiver runs in the local Compose stack.

Production registration requires a single-use invitation that expires after 48 hours. From a trusted terminal with the production `DATABASE_URL` already injected, run `pnpm exec tsx scripts/create-invite.ts` to issue one. Deliver the code privately. The database stores only its hash. Invitations control access and do not verify ownership of the supplied email address.

Set `VERIFICATION_RECEIVER_SECRET` to a separate random key of at least 32 characters to enable the built-in receiver. It verifies the signature over the raw payload and returns HTTP 204. The destination form shows the exact URL. To deliver to another system, add its HTTPS hostname to `DESTINATION_HOSTS` and configure a destination and route for it.

When setting up a separate project, link the repository root and connect the intended Git remote. Use the [hosted deployment checklist](testing.md#verify-a-hosted-deployment) after a release.

The current hosted instance uses Vercel Hobby and a free Redis plan. The daemon's memory quota includes idle time, and Redis has command limits. Check usage before relying on continuous delivery. See [Vercel Daemon limits](https://vercel.com/docs/daemons/limits).

## Backups, recovery and keys

Back up PostgreSQL, including organization and auth data, and keep encrypted backups in access-controlled storage. Keep the encryption keyring separately and back it up too. Redis AOF speeds queue restart. PostgreSQL can republish missing jobs. Before restoring a PostgreSQL snapshot, stop web and worker and use a fresh Redis queue namespace or dedicated empty Redis instance. Restored rows may reissue prior deliveries. Receivers should preserve deduplication state.

Rotate encryption by adding a new key ID, distributing the full keyring to all processes, and switching ACTIVE_KEY_ID. Existing envelopes continue reading through the old key ID. Retain the old key until existing source/destination secrets have been replaced and retained payloads and backups have expired or been re-encrypted. Keep session secret rotation and source/destination signing secret rotation separate. Coordinate new signing secrets with external clients before enabling traffic.

Database retention runs in bounded batches for event trees. It retains active deliveries until they finish. Failed work can be retried from the UI. Test restore, backlog replay, clock synchronization and key recovery in a staging environment.
