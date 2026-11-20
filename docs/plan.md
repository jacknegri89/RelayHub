# Project status

RelayHub includes scoped organization management, signed ingress, encrypted event storage, durable outbox delivery, retry controls, and an isolated local demo. The public repository runs automated checks on Linux, and the `main` branch deploys the hosted instance through Vercel.

The workspace includes per-destination seven-day history and in-app outage and recovery alerts. Before wider production use, verify recovery from backups and review retention and queue quotas. Email ownership verification and password recovery require a trusted mail transport.

See [Architecture](architecture.md) for delivery guarantees, [Operations](operations.md) for deployment requirements, and [Testing](testing.md) for release acceptance.
