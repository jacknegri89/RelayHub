# RelayHub

Read .claude/state.md first at the start of every session, then read the relevant
documents in docs/. Inspect and test existing behavior before changing it. Make
focused changes, add regression tests for critical paths, and update the relevant
docs and state file after each milestone.

Use strict TypeScript. Verify organization membership server-side and scope
every organization resource lookup. Keep credentials and payloads out of
logs, BullMQ, and the browser. Keep PostgreSQL as the authority for delivery
state. Run tests against isolated data. No public deploys or pushes without
explicit authorization.
