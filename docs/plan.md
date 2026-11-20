# Project status

RelayHub includes scoped organization management, signed ingress, encrypted event storage, durable outbox delivery, retry controls, and an isolated local demo. The public repository runs automated checks on Linux, and the `main` branch deploys the hosted instance through Vercel.

The public baseline at `d1eed99` includes per-destination seven-day history, failed-attempt details, optional email alerts and grouped retries after recovery. Its [Linux CI run](https://github.com/jacknegri89/RelayHub/actions/runs/44829826335) passed, including the Docker Compose cold-start and worker-restart scenario.

## Account recovery rollout

Account email verification and password recovery require an explicit rollout switch. The hosted instance can run webhook delivery and destination alerts while public account email is off. This version also includes an encrypted PostgreSQL restore rehearsal, stricter notification handling, explicit remote TLS verification and lower idle polling. The package version is `0.1.0` pending acceptance of `v1.0.0`.

### Verification on 2026-11-21

- The isolated Windows checkout installed the frozen lockfile and built Next.js. Strict types, ESLint, formatting, 55 unit tests and 42 integration tests passed. The dependency audit reported no known advisories in the registry result.
- Chromium passed the ten standard workspace and public tests and a separate account-email test using real local Mailpit. Six public pages were checked in English and Italian at 320, 375, 768, 1024 and 1440 px with reduced motion, keyboard focus, no horizontal overflow and no browser console errors.
- While the dedicated Redis process was stopped, PostgreSQL accepted an event and preserved its outbox row. Resubmitting returned the same event. Restarting Redis resulted in one recorded HTTP 200 and an empty outbox. Separate tests cover a killed worker and a lost acknowledgement after the receiver committed.
- The encrypted restore drill recovered a synthetic owner's routes, encrypted payload and keys, and reconstructed pending work in an empty Redis namespace. An isolated PostgreSQL 17 TLS connection accepted the test CA and hostname over TLS 1.3 and rejected an unknown CA and a mismatched hostname. Both account migrations applied on the isolated database, and the Prisma schema diff was empty.

### Release gates

1. Require the Linux checks and Docker Compose recovery scenario to pass. Each [CI run](https://github.com/jacknegri89/RelayHub/actions/workflows/ci.yml) records both results.
2. Before deploying, back up the target database and apply the two account migrations listed in [Operations](operations.md#rolling-out-account-mail). Exercise the integrated receiver and confirm outage and recovery messages in the destination mailbox.
3. Enable public account email after testing a verified sender. A `resend.dev` sender supports destination alerts only for the Resend account owner's mailbox. Tag `v1.0.0` after acceptance and version alignment.

See [Architecture](architecture.md) for delivery guarantees, [Operations](operations.md) for deployment requirements, and [Testing](testing.md) for release acceptance.
