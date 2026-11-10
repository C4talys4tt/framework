# Project status

Last updated: 2026-11-10

## Where things stand

| Milestone | Scope | State |
| --- | --- | --- |
| M1 | Foundation: accounts, isolated workspaces, shell, Overview, command palette, theming, settings | Done |
| M2 | Project management: projects, statuses, categories, tags, metadata, notes, activity history | Done (this change; not yet committed) |
| M3 | Visual Library | Not started |
| M4 | Assets | Not started |
| M5 | Production | Not started |
| M6 | Effects Lab, Journal | Not started |
| M7 | Hardening (CSP, search, deployment) | Not started |

## What M2 delivers

- **Projects.** Create, edit, archive and restore. Name, description, status, category, priority,
  client, start and due dates, tags, and up to 20 custom details (frame rate, codec, and so on).
- **Browsing.** Search, filter by status, category and tag, active/archived/all, five sort orders,
  paging; all in the URL.
- **Project pages.** Overview, Notes (pin, edit, delete; author or owner only) and Activity
  (who changed what, with before and after values).
- **Settings → Projects.** Owners manage statuses (add, rename, recolour, reorder, delete) and
  categories. New workspaces get defaults; existing ones were backfilled.
- **Integration.** Projects is live in the sidebar, palette (`G` then `P`, "New project…") and
  Overview ("Recent work").

Design notes are in [docs/adr/0005-project-data-model.md](docs/adr/0005-project-data-model.md), the
plan and its deviations in [docs/m2-plan.md](docs/m2-plan.md), and every acceptance item with how it
is verified in [docs/m2-acceptance.md](docs/m2-acceptance.md).

## Verification (all passing)

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck` | Clean |
| `npm test` (unit + integration, real PostgreSQL) | 166 tests (84 before M2) |
| `npm run build` | Succeeds; new routes partially prerendered |
| `npm run test:e2e` (production build, fresh database, Chromium) | 56 tests (33 before M2) |
| Fresh database migration | Both migrations apply, re-run is a no-op, identical schema twice |
| `next dev` across every new route | No browser console or server log errors or warnings |

## Decisions worth knowing

- Isolation is still PostgreSQL RLS (ADR 2). M2 adds composite foreign keys so a row can never
  point into another workspace, and writes history from database triggers (ADR 5).
- Statuses and categories are per-workspace data, editable by owners.
- Archived projects are read-only in the database, not just the interface.
- Migration `0002_projects.sql` was edited several times while M2 was in progress, before it was
  committed or applied anywhere but throwaway databases. **From the first commit it is immutable**,
  like `0001`: further changes need a `0003_*.sql`.

## Known limits and open items

- Not built: permanent project deletion, board view, cross-project search, renaming or merging
  tags, conflict detection for simultaneous edits, inviting members (still no interface for it).
- Tested in Chromium only. Accessibility was checked with role-based tests and by hand, not with
  an automated audit or a screen reader.
- Email delivery, verification, password reset and a Content-Security-Policy are still not built
  (see "Not built yet" in docs/architecture.md).
- This work is in the working tree only. Nothing has been committed or pushed.

## Next

M3: Visual Library. The Projects module is the place it will link from (a project's references and
boards). Add a `0003_*.sql`, follow "Adding a workspace-owned table" in docs/architecture.md, and
register the module in `src/modules/shell/navigation.ts`.
