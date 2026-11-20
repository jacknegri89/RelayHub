# Implementation plan

1. Pin stable tools, establish workspace boundaries, add Compose and migrate PostgreSQL.
2. Establish session authentication, organization membership and scoped routing configuration.
3. Verify signed ingress and commit encrypted events, deliveries and outbox records.
4. Dispatch generations through BullMQ, claim in PostgreSQL and record delivery attempts.
5. Add operational views, filters, retry controls and the mock receiver workflow.
6. Exercise permissions, concurrency, delivery recovery and browser navigation. Document the
   commands, operational boundaries and outstanding release checks.

PostgreSQL owns the durable state. The web app and worker share schema and protocol code.
Redis transports job identifiers. The demo receiver is a standalone loopback or Compose service.
