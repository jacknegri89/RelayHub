# Project status

RelayHub includes scoped organization management, signed ingress, encrypted event storage, durable outbox delivery, retry controls, and an isolated local demo. The public repository runs automated checks on Linux, and the `main` branch deploys the hosted instance through Vercel.

Before wider production use, verify recovery from backups, review retention and queue quotas, and configure outbound monitoring and alerting. Email ownership verification and password recovery require a trusted mail transport.

See [Architecture](architecture.md) for delivery guarantees, [Operations](operations.md) for deployment requirements, and [Testing](testing.md) for release acceptance.
