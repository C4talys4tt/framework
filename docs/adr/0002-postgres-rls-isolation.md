# 2. Workspace isolation with PostgreSQL row-level security

Status: accepted (M1)

## Context

Every later module stores workspace-owned data. Relying on each query to include the right
`where workspace_id = ...` makes one forgotten clause a data leak.

## Decision

- All module data access runs inside `withUser`, a transaction that switches to the unprivileged
  `framework_app` role and sets `app.user_id` (both transaction-local).
- Every table has RLS enabled. Policies use `app.current_user_id()` and
  `app.is_workspace_member()`.
- `framework_app` gets least-privilege, column-level grants and no access to auth tables.
- Operations that must bypass a policy atomically (creating a workspace with its first owner) are
  `SECURITY DEFINER` functions with a pinned `search_path`.
- SQL is written by hand in repositories using `pg`; there is no ORM. Migrations are plain SQL
  run by a ~100 line runner (`src/infrastructure/db/migrator.ts`).

## Consequences

- A missing filter returns nothing instead of someone else's data. Verified by
  `tests/integration/workspace-isolation.test.ts`.
- Works behind transaction-mode connection poolers, because nothing is session-scoped.
- The login role in `DATABASE_URL` owns the schema, so code that bypassed `withUser` would bypass
  RLS. `getPool` is therefore infrastructure-only. A separate, non-owner runtime login role is a
  possible later hardening step.
- Row types are declared by hand next to each query. If this becomes a burden as modules are
  added, generate types from the schema rather than adopting an ORM that hides the SQL.
- PostgreSQL 15+ is required. On 16+, the migration explicitly grants the migrating role the
  right to `SET ROLE framework_app`, which role creation no longer implies.
