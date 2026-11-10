# 1. Modular monolith on Next.js

Status: accepted (M1)

## Context

FRAMEWORK will grow to eight modules that must reference each other (a project links to its
assets, boards, shots, notes and effects). It is built and operated by a very small team.

## Decision

One Next.js application and one PostgreSQL database. Code is organised by product module
(`src/modules/<name>`) with a fixed internal shape (`domain`, `server`, `actions`, `components`),
plus `infrastructure` and `shared`. `src/app` contains routing only.

## Consequences

- Cross-module features are ordinary function calls and SQL joins, inside one transaction.
- Module boundaries are a convention (documented import rules), not a deployment boundary. If a
  boundary is violated often, add an ESLint import rule rather than splitting services.
- We adopt Next.js 16's defaults (Cache Components, Partial Prefetching) instead of opting out.
  This requires `<Suspense>` around every request-time read, which also gives every screen a
  designed loading state.
