# Contributing to RelayHub

## Development setup

Use the [local setup instructions](README.md#run-locally) or run the app and worker directly on your host using the [Testing guide](docs/testing.md#run-the-development-processes).

Read the [Architecture](docs/architecture.md) and [Security model](docs/security.md) before changing authentication, tenant access, ingress, or delivery. Use isolated services and fictional data for development.

## Before opening a pull request

1. Reproduce the behavior and describe the expected outcome.
2. Add coverage at the closest layer when a change affects delivery, access control, or other behavior protected by the test suite.
3. Apply database migrations to a fresh PostgreSQL instance if the schema changes.
4. Run the checks below and include any relevant manual verification in the pull request.

```sh
pnpm generate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

With the demo stack running, also run `pnpm test:integration` and `pnpm test:e2e`. The [GitHub Actions workflow](.github/workflows/ci.yml) runs the same checks on Linux with isolated PostgreSQL and Redis services.

Report vulnerabilities using the [security policy](SECURITY.md).
