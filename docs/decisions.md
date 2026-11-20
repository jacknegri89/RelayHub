# Architecture decisions

## 1. Two application processes

A single web process owns the UI and request boundary. A separate Node worker runs the dispatcher, consumer and maintenance loop. This preserves independent scaling and restarts with one codebase and one durable database. Running background deliveries inside request handlers would couple response latency and delivery reliability. A separate dispatcher service can be justified if its workloads outgrow the worker process.

## 2. PostgreSQL outbox and job generations

Direct enqueue after the database transaction can lose work between commit and publish. Publishing before commit can expose rows that roll back. Durable PostgreSQL schedule rows, BullMQ job deduplication and fenced claims preserve recoverability while accepting duplicate HTTP effects after ambiguous failures. Keep the receipt store on the receiver's side of the transaction boundary.

## 3. Tenant access and runtime compatibility

Better Auth 1.7.26 handles credentials and sessions. Organization membership is a small application model with explicit permission checks and database-level tenant constraints. Prisma 7.10.1 is supported by the Better Auth adapter. Prisma 8 was a prerelease and used a different adapter contract. Next.js 16.4.6 and React 19.3.1 are pinned. TypeScript 5.9.3 fits the ESLint TypeScript parser and Next tooling. BullMQ 6.7.8 uses ioredis 6.0.0. The lockfile records resolved transitive dependencies. The scoped Effect 3.22.1 override addresses GHSA-7589-6fvf-x4pw in Prisma tooling.

## 4. Controlled outbound networking

The production worker accepts exact HTTPS hostnames from an operator-managed allowlist. A socket lookup pinned to a validated DNS result preserves the hostname for TLS verification and the HTTP Host header. The first eligible address is used per attempt. This trades automatic multi-address failover for a smaller connection policy. Require outbound network controls at deployment as a second layer. The local Compose receiver uses a strict demo-only HTTP exception.

## 5. Privacy and operational trade-offs

Encrypt payloads for retry and retain only technical metadata in views and logs. Attempt response bodies are discarded. Expire the event tree after terminal processing. Demo receipts are intentionally process-local. A durable receiver-side deduplication example and automated cross-key re-encryption are potential follow-up work.
