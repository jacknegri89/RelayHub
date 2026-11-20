# Project status

RelayHub includes scoped organization management, signed ingress, encrypted event storage, durable outbox delivery, retry controls, and an isolated local demo. The public repository runs automated checks on Linux, and the `main` branch deploys the hosted instance through Vercel.

The workspace includes per-destination seven-day history, failed-attempt details, optional email alerts and grouped retries after recovery. Before wider production use, verify recovery from backups and review retention and queue quotas. Configure the mail provider for destination subscriptions. Password recovery is a separate account feature.

See [Architecture](architecture.md) for delivery guarantees, [Operations](operations.md) for deployment requirements, and [Testing](testing.md) for release acceptance.
