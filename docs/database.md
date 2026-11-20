# Database

PostgreSQL stores accounts, configuration, events, delivery history, and pending work.

## Relationships

```mermaid
erDiagram
    USER ||--o{ SESSION : authenticates
    USER ||--o{ ACCOUNT : authenticates
    USER ||--o{ ORGANIZATION_MEMBER : joins
    ORGANIZATION ||--o{ ORGANIZATION_MEMBER : includes
    ORGANIZATION ||--o{ WEBHOOK_SOURCE : owns
    ORGANIZATION ||--o{ WEBHOOK_DESTINATION : owns
    ORGANIZATION ||--o{ AUDIT_LOG : records
    WEBHOOK_SOURCE ||--o{ INGRESS_RECEIPT : reserves
    WEBHOOK_SOURCE ||--o{ SUBSCRIPTION : routes
    WEBHOOK_DESTINATION ||--o{ SUBSCRIPTION : receives
    WEBHOOK_SOURCE ||--o{ WEBHOOK_EVENT : accepts
    WEBHOOK_EVENT ||--o{ DELIVERY : creates
    WEBHOOK_DESTINATION ||--o{ DELIVERY : targets
    WEBHOOK_DESTINATION ||--o{ DESTINATION_INCIDENT : experiences
    WEBHOOK_DESTINATION ||--o{ DESTINATION_DAILY_STAT : measures
    DELIVERY ||--o{ DELIVERY_ATTEMPT : records
    DELIVERY ||--o| OUTBOX_ENTRY : schedules
```

Auth models follow the Prisma adapter contract. Membership has a composite primary key and a user index. Composite foreign keys across organization-scoped relations prevent cross-tenant routes, events and deliveries at the database layer. Server queries also scope access using the membership of the current session.

Each enrolled account can have one MFA record. It stores encrypted authenticator material and recovery codes, the enrollment verification flag, and challenge lockout state.

## Uniqueness and indexes

Events are unique by source and external ID. Ingress receipts temporarily reserve a hash of the signed request by source so an unsigned header cannot change the event ID on a previously observed signature. Deliveries are unique by event and destination. Attempts are unique by delivery and number.

List indexes start with organization ID and include timestamp and ID for deterministic ordering. The delivery status index supports dashboard filters. The outbox publication, delivery lease and expiry indexes support bounded scans. Search uses scoped substring matching and offset pagination. Revisit indexes for large organizations.

## Storage and retention

Encrypted envelopes contain a key ID, nonce, authentication tag, and ciphertext. Associated data binds each envelope to its resource type and ID. Timestamps use UTC. Disabling a source or destination preserves its historical references. The retention job removes terminal event trees and audit records after the configured period. It keeps active event trees until processing reaches a terminal state.

Daily destination totals are keyed by destination and UTC date, with a composite organization foreign key. The worker retains today and the preceding six UTC dates even when raw event retention is shorter. Each row stores success and failure counts, the total measured HTTP response duration and its sample count. Incident records survive individual event deletion. The worker expires resolved incidents after `RETENTION_DAYS` from recovery and keeps open incidents until resolved.
