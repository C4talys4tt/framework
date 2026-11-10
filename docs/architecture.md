# Architecture

FRAMEWORK is a modular monolith: one Next.js application, one PostgreSQL database, with code
organised by product module rather than by technical layer.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Cache Components, Turbopack), React 19 |
| Language | TypeScript, strict, `noUncheckedIndexedAccess` |
| Styling | Tailwind CSS 4, semantic design tokens as CSS custom properties |
| UI primitives | Radix (dialog, menu, tooltip, switch), cmdk (command palette), Lucide icons, Geist typeface |
| Animation | Motion for shared-layout transitions; CSS for everything else |
| Database | PostgreSQL via `pg`, plain SQL migrations, row-level security |
| Authentication | Better Auth (email and password, database sessions) |
| Validation | Zod |
| Tests | Vitest (unit, integration), Playwright (browser) |

## Directory structure

```
db/migrations/            Forward-only SQL migrations (0001_name.sql)
docs/                     Architecture, ADRs, acceptance criteria
scripts/                  migrate.ts, prepare-e2e-db.ts (run with plain Node)
src/
  app/                    Routes only: layouts, pages, route handlers. No business logic.
    (auth)/               Sign-in and sign-up
    (app)/                Everything that needs a session; loads user preferences once
      w/[workspace]/      The workspace shell and its pages
    api/auth/[...all]/    Auth API (Better Auth handler)
  modules/                One folder per product module
    auth/                 Sessions, credentials, auth forms
    workspaces/           Workspaces and membership
    preferences/          Appearance and sidebar preferences
    shell/                Sidebar, top bar, command palette, shortcuts, module registry
    overview/             The dashboard
    settings/             Settings screens
  infrastructure/         Environment, connection pool, user-scoped transactions, migrator
  shared/
    ui/                   Reusable, module-agnostic components
    lib/                  Small utilities
tests/
  integration/            Migration and isolation tests (real PostgreSQL)
  e2e/                    Playwright specs
```

### Inside a module

```
modules/<name>/
  domain/        Types, Zod schemas and pure functions. No I/O, no React. Unit tested.
  server/        Database access (repository.ts) and request-scoped loaders (queries.ts).
  actions.ts     Server actions: authenticate, validate, call the repository, return a result.
  components/    React components for this module.
```

Not every module needs every part. Rules that keep the structure honest:

- `app/` imports from `modules/` and `shared/`; modules never import from `app/`.
- `shared/` and `infrastructure/` never import from `modules/`.
- A module may use another module's `domain/` types and server `queries`, but never its
  repository directly.
- Repositories receive a `UserScopedDb` and contain SQL only; they never read the session.

## Request flow

**Reading.** A page calls a loader in `server/queries.ts`. The loader resolves the signed-in user
(`requireUser`), opens a user-scoped transaction (`withUser`) and calls a repository function.
Loaders are wrapped in React `cache`, so a layout and a page asking for the same thing in one
request share one query.

**Writing.** A client component calls a server action. Every action re-reads the session,
validates its input with Zod, performs the write through `withUser`, and returns an
`ActionResult` (`{ ok: true, data }` or `{ ok: false, message, fieldErrors }`). Actions never
trust ids from the client: the database decides whether the row is visible to the caller.

**Credentials.** Sign-up, sign-in, sign-out, profile and password changes go through the auth API
route rather than server actions, so the auth library's rate limiting covers every attempt.

## Workspace isolation

Isolation is enforced by PostgreSQL, not by application code remembering to filter.

1. Module code can only reach the database through `withUser(userId, fn)`.
2. `withUser` opens a transaction, runs `set local role framework_app`, and sets `app.user_id`.
   Both are transaction-local, so nothing leaks through the connection pool.
3. `framework_app` has no privileges on the `auth_*` tables and only the column-level privileges
   it needs elsewhere.
4. Every domain table has row-level security. Policies call `app.current_user_id()` and
   `app.is_workspace_member(workspace_id)`.
5. A workspace the user is not a member of is indistinguishable from one that does not exist:
   both produce the same not-found page.

**Adding a workspace-owned table** (every later module will): add a `workspace_id` column, enable
RLS, add policies using `app.is_workspace_member(workspace_id)`, grant the needed privileges to
`framework_app`, and add cases to `tests/integration`. The migration test fails if any table is
created without RLS enabled.

## Rendering model

Cache Components is on, so every route has a static shell that paints immediately and
request-specific content streams in behind `<Suspense>`:

- The root layout is fully static. Theme attributes are applied by an inline script that reads a
  cookie before first paint.
- `(app)/layout` streams the user's preferences; `w/[workspace]/layout` streams the shell after
  authorising the workspace. Both show `ShellSkeleton` meanwhile.
- **Every page that reads request data wraps that part in its own `<Suspense>`** with a skeleton.
  A boundary in a layout does not cover client navigation between sibling pages; the dev overlay
  reports any page that would block.

Two behaviours of this model shape the code:

- Next.js keeps recently visited routes mounted but hidden. State that belongs to the user rather
  than the page (preferences) therefore lives in `PreferencesProvider`, above the workspace
  layout. Browser tests must target visible elements.
- Signing in and out use full page loads, which discards every cached session-scoped route.

## Theming

Components use semantic Tailwind colours only (`bg-surface`, `text-fg-muted`, `border-line`,
`text-accent`). Their values are CSS custom properties defined in `src/app/globals.css` and
switched by attributes on `<html>`:

| Attribute | Values | Effect |
| --- | --- | --- |
| `data-theme` | `dark`, `light`, `system` | Colour palette |
| `data-density` | `comfortable`, `compact` | Spacing and type scale |
| `data-motion` | `full`, `reduce` | Disables animation (the OS setting is always honoured) |

The database row in `user_preferences` is the source of truth. A cookie mirrors it per browser so
the correct theme is applied before first paint, and the provider rewrites the cookie from the
account on load so a new device converges immediately.

## The module registry

`src/modules/shell/navigation.ts` lists every product module with its status. The sidebar, command
palette and Overview all render from it. A module ships by setting `status: "available"` and a
`segment`, and adding its routes; until then it is rendered as a disabled, explained entry and has
no route.

## Database migrations

- Plain SQL files in `db/migrations`, applied in filename order by `npm run db:migrate`.
- Each file runs in a transaction and is recorded in `schema_migrations` with a checksum.
- Applied files are immutable: the runner refuses to continue if one has been edited. Add a new
  file instead.
- There are no down migrations. Roll forward.

## Testing strategy

| Layer | Covers | Where |
| --- | --- | --- |
| Unit | Domain logic: slugs, schemas, redirect safety, shortcuts, the theme script | `src/**/*.test.ts` |
| Integration | Migrations are reproducible; RLS isolates users; privileges are minimal | `tests/integration` |
| Browser | Sign-up to sign-out, navigation, palette, theme persistence, isolation, settings | `tests/e2e` |

Integration and browser tests create and drop their own databases and never touch development
data.

## Not in M1

Stated plainly so nothing is assumed to exist:

- Email delivery, and therefore email verification, password reset and changing email address.
- Inviting other people to a workspace. The membership model and policies support members, and
  the tests cover them, but there is no interface for it.
- Deleting a workspace or an account.
- File storage. From M3, binaries go to object storage with only metadata in PostgreSQL.
- A Content-Security-Policy header (needs per-request nonces; planned with M7 hardening).
