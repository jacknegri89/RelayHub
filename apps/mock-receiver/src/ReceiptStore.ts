import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const MAX_TRACKED_RECEIPTS = 10_000;
const MILLISECONDS_PER_DAY = 86_400_000;

type Receipt = { fingerprint: string; attempts: number; accepted: number };
type Received = { id: string; fingerprint: string; isOrder: boolean };
type Decision = { status: number; duplicate: boolean; attempt: number };

export class ReceiptStore {
  private readonly db: DatabaseSync;
  private readonly retentionMs: number;

  constructor(filename: string, retentionDays: number) {
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename, { timeout: 3000 });
    this.retentionMs = retentionDays * MILLISECONDS_PER_DAY;
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS receipts (
        delivery_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, attempts INTEGER NOT NULL,
        accepted INTEGER NOT NULL CHECK (accepted IN (0,1)), last_seen INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS receipts_last_seen ON receipts(last_seen);
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY, delivery_id TEXT NOT NULL UNIQUE REFERENCES receipts(delivery_id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL
      ) STRICT;
    `);
  }

  isAccepted(id: string, now = Date.now()) {
    return Boolean(
      this.db
        .prepare(
          "SELECT 1 FROM receipts WHERE delivery_id=? AND accepted=1 AND last_seen>=?",
        )
        .get(id, now - this.retentionMs),
    );
  }

  record(delivery: Received, mode: string, now = Date.now()): Decision {
    // Serialize independent receiver processes sharing this database. No transaction spans a network wait.
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("DELETE FROM receipts WHERE last_seen < ?")
        .run(now - this.retentionMs);
      const decision = this.apply(delivery, mode, now);
      this.db.exec("COMMIT");
      return decision;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private apply(delivery: Received, mode: string, now: number): Decision {
    const { id, fingerprint } = delivery;
    const previous = this.db
      .prepare(
        "SELECT fingerprint, attempts, accepted FROM receipts WHERE delivery_id=?",
      )
      .get(id) as Receipt | undefined;
    if (previous && previous.fingerprint !== fingerprint) {
      return { status: 409, duplicate: false, attempt: previous.attempts };
    }
    const attempt = (previous?.attempts ?? 0) + 1;
    if (previous?.accepted) {
      this.db
        .prepare(
          "UPDATE receipts SET attempts=?, last_seen=? WHERE delivery_id=?",
        )
        .run(attempt, now, id);
      return { status: 200, duplicate: true, attempt };
    }
    if (!previous) {
      const total = this.db
        .prepare("SELECT count(*) AS total FROM receipts")
        .get();
      if (Number(total?.total) >= MAX_TRACKED_RECEIPTS) {
        return { status: 503, duplicate: false, attempt: 0 };
      }
    }
    let status = 200;
    if (mode === "transient" && attempt <= 2) {
      status = 500;
    } else if (mode === "busy" && attempt === 1) {
      status = 429;
    } else if (mode === "permanent") {
      status = 400;
    }
    const accepted = Number(status === 200);
    this.db
      .prepare(
        `INSERT INTO receipts (delivery_id,fingerprint,attempts,accepted,last_seen) VALUES (?,?,?,?,?)
      ON CONFLICT(delivery_id) DO UPDATE SET attempts=excluded.attempts, accepted=excluded.accepted, last_seen=excluded.last_seen`,
      )
      .run(id, fingerprint, attempt, accepted, now);
    // Model the business write in the same commit as the receipt.
    if (accepted && delivery.isOrder) {
      this.db
        .prepare("INSERT INTO orders(delivery_id,created_at) VALUES (?,?)")
        .run(id, now);
    }
    return { status, duplicate: false, attempt };
  }

  close() {
    this.db.close();
  }
}
