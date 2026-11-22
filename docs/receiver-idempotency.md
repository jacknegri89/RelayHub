# Receiving an order once across delivery retries

RelayHub delivers at least once. A shop can send one order to its warehouse and billing systems. Each destination gets its own delivery ID. If billing saves an order and the connection drops before its HTTP response arrives, RelayHub retries billing with the same delivery ID. The warehouse keeps its successful delivery.

## Try a lost acknowledgement

From the homepage, open **Try a lost response** and start a test. This uses the running worker and a dedicated receiver. Open both attempts to compare their delivery IDs. The receiver commits an order before delaying its first reply beyond the worker's deadline. When the retry arrives, it increments the receipt count on that order and acknowledges the request. The page reads the request count and saved order count from PostgreSQL. Reloading the page in the same tab reopens the current test.

After the event is accepted, choose **Open this test in the dashboard**. The read-only view shows the event ID, source, destination, both attempts and the receiver’s saved order count. It follows the same test after a reload in the originating tab. The URL alone does not grant access.

The browser test uses a separate workspace with no members and a fixed receiver. Its order expires with its delivery under the normal retention policy. The worker must be running and `MAX_ATTEMPTS` must be at least two. The following steps exercise the SQLite example in the local demo.

1. Start the local demo and seed its routes using the [testing guide](testing.md#seed-and-replay-fixtures).
2. Run `pnpm demo lost-response` in the seeded environment. Each run submits a new fictional order.
3. Open **Deliveries** in the demo workspace and select the delivery for **Demo lost-response**. The first attempt times out after the receiver has committed the order. On the next attempt, the receiver recognizes the delivery ID and returns HTTP 200. Both attempts appear under the same delivery.

## What the receiver commits

The receiver checks the timestamp, the delivery UUID, the external event ID and the HMAC v2 over those fields and the original request bytes. It uses the delivery UUID as its receipt key. A SHA-256 fingerprint of the external event ID and body detects a conflicting reuse of the key. The receiver stores technical IDs, counters, timestamps and this fingerprint. The fictional order record contains only a local ID, its delivery ID and its creation time.

A SQLite write transaction reads the receipt, saves the order and marks the receipt accepted. If the order write fails, the whole transaction rolls back. Concurrent handlers sharing the same database serialize their writes. A later request with the same signed content updates the attempt count and returns HTTP 200. Different signed content under the same delivery ID gets HTTP 409.

The default database path is `~/.relayhub/receiver.sqlite`. Override it with `RECEIVER_DB_PATH` when running the receiver directly. Compose mounts the `receiver` volume at `/var/lib/relayhub-receiver`, writable by the container's `node` user. Restarted instances need access to the same database. Keep its SQLite WAL files alongside it.

Receipts remain eligible for deduplication for `RETENTION_DAYS` after the last recorded attempt (30 days by default). The next signed delivery that enters the transaction removes expired receipts and their sample orders. A full store with 10,000 live receipts returns HTTP 503 for new IDs and continues recognizing existing ones.

Choose a retention horizon that covers your longest automatic and manual retry interval. A new delivery ID or a retry after expiry can create another order. For longer-lived order protection, enforce a unique business order key in the same transaction, scoped to the shop or originating integration. Different shops can legitimately use the same external order number. If the business effect calls another service, forward its supported idempotency key or use a transactional outbox to track that handoff.

## Verify process restarts

The integration test needs a local demo environment and a PostgreSQL role that can create a disposable database. Run this command from the repository root.

```sh
node --env-file-if-exists=.env node_modules/vitest/vitest.mjs run tests/receiver-idempotency.integration.test.ts
```

The tests count committed order rows independently of the HTTP responses. They send concurrent copies to two receiver processes, lose billing's acknowledgement after commit, and restart both the billing receiver and delivery worker. They also kill an active worker while it holds its lease, advance that test lease to expiry and exercise normal recovery. The recovered delivery has two attempts and one order. A separate test checks that a successful warehouse delivery was contacted only once.
