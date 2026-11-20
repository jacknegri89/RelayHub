# Architecture decisions

## 1. Two application processes

A single web process owns the UI and request boundary. A separate Node worker runs the dispatcher, consumer and maintenance loop. This preserves independent scaling and restarts with one codebase and one durable database. Running background deliveries inside request handlers would couple response latency and delivery reliability. A separate dispatcher service can be justified if its workloads outgrow the worker process.

## 2. PostgreSQL outbox and job generations

Direct enqueue after the database transaction can lose work between commit and publish. Publishing before commit can expose rows that roll back. Durable PostgreSQL schedule rows, BullMQ job deduplication and fenced claims preserve recoverability while accepting duplicate HTTP effects after ambiguous failures. Keep the receipt store on the receiver's side of the transaction boundary.

## 3. Tenant access and runtime

Better Auth handles credentials and sessions. The application owns organization membership with explicit server permissions and database-level tenant constraints. The web and worker share a generated Prisma Client. Workspace manifests and the lockfile record the tested runtime versions. Upgrading the database adapter requires a fresh migration and authentication test.

## 4. Controlled outbound networking

The production worker accepts exact HTTPS hostnames from an operator-managed allowlist. A socket lookup pinned to a validated DNS result preserves the hostname for TLS verification and the HTTP Host header. The first eligible address is used per attempt. This trades automatic multi-address failover for a smaller connection policy. Require outbound network controls at deployment as a second layer. The local Compose receiver uses a strict demo-only HTTP exception.

## 5. Privacy and operational trade-offs

Encrypt payloads for retry and retain only technical metadata in views and logs. Attempt response bodies are discarded. Expire the event tree after terminal processing. The demo receiver keeps its deduplication record and business effect in its own durable transaction. This models an independent application that may restart between accepting an order and acknowledging the delivery.
