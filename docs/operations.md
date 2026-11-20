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

Public registration accepts email and password. Form proof, the honeypot, and server-side rate limits protect enrollment. Apply the account-security migration before deploying the release. Users can enroll a time-based authenticator from **Workspace → Security** and should store their recovery codes separately.

After the first account enrolls in MFA, keep the second-factor checks in any rollback release. Verify the authenticator challenge and recovery-code behavior before promoting a previous build.

Set `VERIFICATION_RECEIVER_SECRET` to a separate random key of at least 32 characters to enable the built-in receiver. It verifies the signature over the raw payload and returns HTTP 204. The destination form shows the exact URL. To deliver to another system, add its HTTPS hostname to `DESTINATION_HOSTS` and configure a destination and route for it.

When setting up a separate project, link the repository root and connect the intended Git remote. Use the [hosted deployment checklist](testing.md#verify-a-hosted-deployment) after a release.

### Keeping the portfolio demo within free tiers

The web service accepts signed requests and commits them to PostgreSQL. The separate daemon runs the BullMQ consumer. It polls the outbox every five seconds when idle in hosted mode and checks again after half a second when work is due. The local demo polls every half second. These intervals reduce idle queries but still keep a hosted database awake.

| Service            | Published free allowance checked on 2026-11-20                                                                                     | What happens to the demo                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Hobby       | During the daemon beta, 5 active CPU-hours and 420 GB-hours of reserved memory per team per month. Idle time counts toward memory. | The worker reserves 1 GiB. At Vercel's published rate this allows about 420 hours (17.5 days) if the whole memory quota is available. Vercel stops daemons at either cap until the next UTC month. Web functions have separate limits. [Daemon limits](https://vercel.com/docs/daemons/limits) · [Hobby terms](https://vercel.com/docs/plans/hobby) |
| Neon Free          | 100 CU-hours per project per month and 1 GB of database storage per project. No credit card required.                              | A continuously awake 0.25-CU compute consumes about 180 CU-hours in 30 days. If the database cannot commit a request, ingress cannot acknowledge it. Senders should retry with the same event ID. [Neon pricing](https://neon.com/pricing)                                                                                                          |
| Upstash Redis Free | 500,000 commands/month, 250 MB data, 10 GB monthly bandwidth.                                                                      | When Redis is unavailable, the web service can still persist an event while PostgreSQL is healthy. The worker republishes due identifiers after Redis becomes available. Stay on Free; Pay as You Go has a separate billing model. [Upstash Redis pricing](https://upstash.com/pricing/redis)                                                       |
| Resend Free        | 100 transactional emails/day, 3,000/month. The testing sender can address only the email of the Resend account owner.              | Public mail requires a sender on a verified domain the operator already controls. Local Mailpit provides a private test mailbox. Leave paid upgrades and transactional overages off. [Transactional pricing](https://resend.com/pricing) · [Testing domain](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)                     |

Use the existing free plans for personal portfolio traffic. Check the plan and remaining allowance in each dashboard before a demonstration. The provider limits above do not measure the account's remaining balance. Avoid adding a payment method, enabling paid overages or upgrading a plan to resume the demo. For a presentation during a quota suspension, the local Compose stack runs the same delivery engine.

After service resumes, check web readiness, the daemon's most recent healthy tick and the age of pending outbox rows. Send a signed event to the built-in receiver and verify its HTTP 204. Allow outstanding generations to drain before considering a manual retry. The homepage simulator is independent of service readiness.

### PostgreSQL transport and Vercel variables

The web and worker share the Prisma pg adapter. The lockfile pins pg 8.23.1 and pg-connection-string 2.14.1. The latter warns when a connection string uses the legacy aliases `prefer`, `require` or `verify-ca`. The runtime now chooses `sslmode=verify-full` explicitly for remote connections, including URLs without a mode; the driver checks the certificate chain and hostname. Keep the Neon pooled URL for concurrent application connections and use the direct endpoint for administration. Loopback and the private Compose service named `postgres` retain local transport support. [node-postgres SSL](https://node-postgres.com/features/ssl) · [Neon connection security](https://neon.com/docs/connect/connect-securely)

In **Vercel → Project → Settings → Environment Variables**, inspect the environment scope and integration owner. A `readable-secret` warning means authorized collaborators or tools can read back that value. It does not measure database availability. Use Sensitive storage for credentials you own, and use the integration's controls for managed credentials. For Node clients outside this runtime, set `sslmode=verify-full` on the pooled and direct URLs while preserving their host, database and other parameters. Validate with a private connection and `SELECT 1` before rolling out, then check readiness and the worker after an authorized redeploy. Keep connection strings out of CLI arguments, Git and logs.

## Backups, recovery and keys

Follow the [encrypted backup and isolated restore procedure](backup-restore.md) before a schema change. It includes a repeatable test of encrypted fields and the PostgreSQL outbox with a fresh queue.

Back up PostgreSQL, including organization and auth data, and keep encrypted backups in access-controlled storage. Keep the encryption keyring separately and back it up too. Redis AOF speeds queue restart. PostgreSQL can republish missing jobs. Before restoring a PostgreSQL snapshot, stop web and worker and use a fresh Redis queue namespace or dedicated empty Redis instance. Restored rows may reissue prior deliveries. Receivers should preserve deduplication state.

Rotate encryption by adding a new key ID, distributing the full keyring to all processes, and switching ACTIVE_KEY_ID. Existing envelopes continue reading through the old key ID. Retain the old key until existing source/destination secrets have been replaced and retained payloads and backups have expired or been re-encrypted. Keep session secret rotation and source/destination signing secret rotation separate. Coordinate new signing secrets with external clients before enabling traffic.

Database retention runs in bounded batches for event trees. It retains active deliveries until they finish. Failed work can be retried from the UI. Test restore, backlog replay, clock synchronization and key recovery in a staging environment.

## Destination monitoring upgrade

Apply the destination health and incident ordering migrations before starting the updated web and worker processes. The first migration rebuilds health from the completed attempts still in PostgreSQL. Days whose source records expired before the upgrade cannot be reconstructed. The backfill holds a write lock on the destination table until commit. For a large retained history, measure the migration on a restored copy and schedule the upgrade accordingly. Older workers can complete attempts through the same database trigger after the migration commits.

For email subscriptions and grouped retries, apply the destination email and incident replay group migrations before updating the web and worker. The replay migration locks the attempts table while it links retained attempts to existing incidents. When older data cannot establish which failures belong to an incident, only provable matches are offered for retry. Configure the [email sender](destination-email.md) on both services to enable subscriptions.

Apply the organization API key migration before serving the read API and owner settings. Keep tokens in the calling service’s secret store. To rotate a key, create its replacement in Settings, switch the caller and then revoke the old key. In the demo, update the worker before starting a receiver that requires its v2 signature. The receiver’s Compose volume preserves its receipts across container restarts.
