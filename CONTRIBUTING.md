# Contributing

Read the architecture and security notes before touching authentication, ingestion, the worker or outbound networking. Reproduce behavior locally using the demo environment. Write focused changes and update the test closest to the affected behavior. Apply migrations to a fresh PostgreSQL database with `pnpm migrate`. Run formatting, ESLint, typecheck, unit, integration and browser tests before requesting review.
