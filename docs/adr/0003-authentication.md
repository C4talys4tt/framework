# 3. Authentication with Better Auth instead of Supabase Auth

Status: accepted (M1)

## Context

The brief's initial preference was Supabase. Supabase's local stack runs in Docker containers,
which could not be pulled in the environment where M1 was built and verified, so Supabase Auth
could not be exercised in a browser. A definition of done that includes "authentication works"
and "isolation is enforced" could not be met on an unverified integration. The product owner
chose a stack that could be verified end to end.

## Decision

- Better Auth runs inside the Next.js app, using the same PostgreSQL pool, with database-backed
  sessions in `auth_*` tables created by our own migration (snake_case, UUID keys).
- Email and password only in M1. Passwords are 10 to 128 characters.
- The browser talks to `/api/auth/*` directly so the library's rate limiting (stored in
  PostgreSQL, on by default in production) applies to every credential attempt.
- The rest of the app sees only `CurrentUser { id, name, email }` from
  `modules/auth/server/session.ts`.

## Consequences

- The database remains plain PostgreSQL and can be hosted anywhere, including Supabase's managed
  Postgres. Supabase Storage (or any S3-compatible store) remains an option for M3.
- Supabase Auth, `supabase-js` and PostgREST are not used. Moving to Supabase Auth later would
  mean replacing `modules/auth/server` and pointing `app.current_user_id()` at `auth.uid()`;
  RLS policies and repositories would not change.
- No email is sent in M1, so there is no email verification or password reset yet. Both need a
  mail provider and are prerequisites for inviting collaborators.
- `AUTH_RATE_LIMIT=false` exists so browser tests can create many accounts from one address. It
  must never be set on a real deployment.
