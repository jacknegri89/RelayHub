# Changelog

## Unreleased

### Release candidate work

- Added optional bilingual account email confirmation and password recovery. Existing accounts retain their verification status. Resetting a password revokes sessions and preserves authenticator enrollment.
- Shared Resend and local Mailpit delivery across account and destination email. Destination notices re-use a stable provider key after ambiguous outcomes and expire outstanding retries.
- Added an encrypted PostgreSQL backup and restore drill covering application keys, tenant relationships, deduplication and queue reconstruction.
- Made remote PostgreSQL certificate and hostname validation explicit, reduced idle database polling and documented the hosted worker's free-tier limits.
- Added the seven-day destination history, grouped recovery retries, read-only API keys and delivery reporting shipped before this candidate.

### Added

- Organization workspaces with scoped owner, admin, and viewer access.
- Signed JSON ingress, persistent duplicate detection, and encrypted event storage.
- Durable outbox dispatch and a separate BullMQ worker with destination verification, delivery history, and retries.
- Public email registration, authenticator-based MFA with recovery codes, and a built-in HTTPS verification receiver.
- Privacy and cookie notices for the hosted service.
- Local demo fixtures for successful deliveries, failures, and retries.

### Changed

- Redesigned the whole product as a spacetime diagram of webhooks: light-cone logo, Instrument Serif, Geist and Geist Mono, and a void/bone/photon palette.
- The homepage diagram lets visitors send signed or tampered events, take endpoints offline and watch 503 bounces, backoff and retries; it pauses, follows the pointer and renders a still frame for reduced motion.
- Delivery and event pages show animated, replayable traces of every attempt, bounce and backoff, next to the text timeline.
- Updated the homepage motion, RelayHub monogram, favicon, and self-hosted typography.
- Connected the public GitHub repository to Vercel production and enabled automated verification on Linux.
