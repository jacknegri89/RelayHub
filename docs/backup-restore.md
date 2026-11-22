# Encrypted PostgreSQL backups and restore rehearsal

PostgreSQL holds RelayHub's accounts, routing, encrypted envelopes, delivery attempts and pending work. One custom-format dump captures a consistent snapshot of one database. Provision roles and access grants separately. Use existing local encrypted storage with restricted access and sufficient free space. Record the backup time, application commit, schema migrations, database major version, and printed SHA-256 in a separately protected recovery log. Set an expiry for copies containing account data. [PostgreSQL 17 backup reference](https://www.postgresql.org/docs/17/app-pgdump.html)

## Create and verify a backup

Install Node.js and the PostgreSQL client tools matching the source major version (`pg_dump`, `pg_restore`, `createdb`, `dropdb`). Add GnuPG 2 and its agent to PATH. Prepare a recipient and protect the application keys as described in [Key custody](backup-keys.md).

1. Choose an existing private directory outside the checkout on a filesystem supporting hard links. On Windows restrict its ACL to the operator account. Use a different filename for each snapshot.
2. Set native PostgreSQL client variables `PGHOST`, `PGPORT`, `PGDATABASE` and `PGUSER`. Use a protected password file (`PGPASSFILE`) for the source connection. For a separately authorized hosted backup, use the direct database host, `PGSSLMODE=verify-full` and a trusted CA. The backup script does not load RelayHub's `.env`.
3. Set `RELAYHUB_BACKUP_RECIPIENT` to the complete trusted OpenPGP fingerprint. From the repository root, run the first command below. It streams the dump into GnuPG, writes only encrypted bytes and publishes the file after both processes succeed.
4. On the recovery host, unlock the recovery key in its GnuPG agent. Run the second command with the digest from the protected log. It checks the file checksum, decrypts the whole message and decodes every archive data stream.

```sh
node scripts/pg-archive.mjs backup /private/relayhub-YYYYMMDD.dump.gpg
node scripts/pg-archive.mjs verify /private/relayhub-YYYYMMDD.dump.gpg TRUSTED_SHA256
```

If a process is interrupted, a uniquely named encrypted `.partial` file may remain. Only the final filename with its independently recorded digest is eligible for restoration.

## Restore onto an isolated local server

Use a separate PostgreSQL cluster on loopback, with enough disk space for the data and indexes. Keep it inaccessible to application traffic. Use only trusted snapshots from a known source; importing a dump can execute SQL written by its original database administrators. [PostgreSQL 17 restore reference](https://www.postgresql.org/docs/17/app-pgrestore.html)

1. In a fresh shell, set `PGHOST=127.0.0.1`, the local cluster's explicit `PGPORT`, and a local `PGUSER` with database creation rights and local authentication. Clear PostgreSQL service overrides. Keep the archive in its private directory during the operation.
2. Run the command below. It first verifies the archive, then creates a uniquely named database from `template0` and restores into it in one transaction. Its JSON output identifies the new database. Review the restored schema and owner/grant requirements before using the copy.
3. Supply the matching application keyring separately. Verify representative source and destination secrets, event payloads, tenant links, terminal attempts, and pending outbox rows without logging their contents.
4. Before reconnecting any traffic, worker, email sender or destination, reconcile the snapshot with later account closures, ownership transfers, restrictions and unsubscribes. If their complete history cannot be established independently of the snapshot, keep the restore isolated. For the portfolio demo, start with a clean database instead of reactivating old accounts or queuing old deliveries. See [privacy operations](privacy-operations.md).
5. For an authorized recovery, quiesce incoming traffic and workers before switching anything. Use a fresh dedicated Redis instance. The dispatcher rebuilds jobs from PostgreSQL. Audit pending deliveries and email messages against receiver/provider records first. A job pending at snapshot time may already have succeeded later. Keep stable delivery IDs and receiver-side idempotency records across the recovery window. Retain the old installation offline until the restored copy is accepted.

```sh
node scripts/pg-archive.mjs restore /private/relayhub-YYYYMMDD.dump.gpg TRUSTED_SHA256
```

## Reproduce the synthetic rehearsal

Use the repository dependencies (`pnpm install --frozen-lockfile`, `pnpm generate`), PostgreSQL 17, GnuPG 2 and an isolated test Redis server. The PostgreSQL role must be able to create databases. Run from the repository root. Set `PGPASSWORD` privately if the local test cluster requires it, or supply a protected local password file.

```sh
PGUSER=relayhub PGPORT=55432 RELAYHUB_DRILL_REDIS_PORT=56379 node scripts/restore-drill.mjs
```

The drill generates its own OpenPGP key and application keyring, migrates a fresh local database, and stores an example order through RelayHub's normal persistence API. It records one HTTP 204 attempt as a fixture and leaves the other destination pending. It backs up and restores via the operator commands above. It rejects an incorrect digest, a duplicate output filename, and a truncated encrypted message.

The JSON report includes the archive digest and the counts checked in the restored copy. The assertions cover the owner and both routes, four encrypted envelopes, replay of the same event ID, two distinct deliveries and a single scheduled job republished into a fresh BullMQ namespace. The rehearsal removes its temporary databases, keys, archive and Redis namespace. It sends no HTTP delivery or email.
