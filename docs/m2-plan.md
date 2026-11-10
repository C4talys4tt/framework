# M2: Project Management, plan

Status: written before implementation. Where the build diverged, the divergence is noted at the
end under "Deviations".

M2 delivers the Projects module on top of M1. Nothing in M1 is replaced: the architecture,
Better Auth, handwritten SQL migrations, `withUser` + RLS isolation and the design system are used
as they are. The only M1 files that change are the ones that *register* the new module (navigation,
command palette, Overview, Settings tabs) and the three M1 tests that asserted "Projects is not
available yet".

## Scope

In: create, edit and archive/restore projects; workspace-defined categories and statuses;
metadata (client, priority, start and due date, free-form fields); tags; list with search, filters
and sorting; project detail pages; project-specific notes; per-project activity history.

Out (M3 or later, or deliberately not built): files and visual references, storyboards and shots,
permanent project deletion, kanban board view, inviting members, notifications, cross-project
search, the Archive *module* (archived projects are reachable through the Projects filter).

## Database (`db/migrations/0002_projects.sql`)

| Table | Purpose |
| --- | --- |
| `project_statuses` | Workspace-owned. `name`, `color`, `position`, and a `kind` (`planned`, `active`, `paused`, `done`) so code can reason about a status without depending on its name. |
| `project_categories` | Workspace-owned. `name`, `color`. |
| `projects` | `name`, `description`, `status_id`, `category_id` (nullable), `client`, `priority`, `start_date`, `due_date`, `custom_fields` (jsonb array of `{key, value}`), `archived_at`, `archived_by`, `created_by`, timestamps. |
| `project_tags`, `project_tag_links` | Workspace tag vocabulary (case-insensitively unique) and project links. |
| `project_notes` | `title`, `body`, `pinned`, `created_by`, timestamps. |
| `project_activity` | Append-only history. Identity `id` gives a total order. |

Decisions:

- **Same-workspace integrity in the schema.** Every child references its parent with a composite
  foreign key `(parent_id, workspace_id)`, so a project cannot point at another workspace's status,
  category or tag, whatever the application sends. Category deletion uses
  `on delete set null (category_id)` (PostgreSQL 15+, already required); a status in use cannot be
  deleted.
- **RLS on every table**, using the M1 helpers. Members read and write projects, tags and notes.
  Only owners manage statuses and categories. Notes are edited and deleted by their author or an
  owner. Nothing can delete a project (no grant, no policy).
- **Least-privilege column grants**, as in M1. `workspace_id` and `created_by` are insert-only;
  `archived_by` is stamped by a trigger, so it cannot be forged.
- **Activity is written by triggers, not by application code.** `SECURITY DEFINER` trigger
  functions record who did what, so history cannot be skipped by a code path that forgets, and
  `framework_app` has `select` on `project_activity` only (no insert, update or delete).
- **Archived means read-only.** A trigger rejects edits to an archived project, and to its notes
  and tag links, until it is restored.
- **Defaults.** An `after insert` trigger on `workspaces` seeds the default statuses (Planning,
  In progress, In review, On hold, Delivered) and categories; the migration backfills existing
  workspaces. `app.create_workspace` from M1 is not modified.
- **Names of other members** (for "created by", note authors, activity) come from a
  `SECURITY DEFINER` function that returns `(user_id, name)` only for members of a workspace the
  caller belongs to. `framework_app` still has no access to `auth_*` tables.

## Feature architecture

New module `src/modules/projects/`, in the M1 shape:

```
domain/      project.ts (types, Zod schemas, colour/priority tables, filter parsing),
             activity.ts (activity -> sentence), tags.ts   pure, unit tested
server/      repositories (SQL only) + request-scoped queries (cache + requireUser)
actions.ts   server actions: session -> Zod -> withUser -> ActionResult
components/  list, filters, form dialog, detail header, notes, activity, taxonomy settings
```

- Reads go through `queries.ts`; writes through server actions that re-read the session, validate
  with Zod, and let RLS decide visibility (a foreign id behaves like a missing one).
- Filters live in the URL (`?q=&status=&category=&tag=&sort=&archived=&page=`), parsed by one Zod
  schema, so views are linkable and survive reloads.
- One project form component serves create and edit.
- The module registry flips Projects to `available` with segment `projects`; the sidebar, palette
  and Overview pick it up. A `G` then `P` shortcut and a "New project" palette command are added.

## UI structure

```
/w/[ws]/projects                  list: search, status / category / tag / archived filters, sort
/w/[ws]/projects/[id]             Overview tab: description, details, custom fields, tags
/w/[ws]/projects/[id]/notes       Notes tab: composer, pinned first, edit, delete
/w/[ws]/projects/[id]/activity    Activity tab: timeline grouped by day, "show more"
/w/[ws]/settings/projects         Statuses and categories (owners edit, members read)
```

Create and edit open in a dialog. Archive asks for confirmation; archived projects show a banner
and a Restore action. Empty, loading (skeleton + Suspense on every page, per the M1 rendering
rules), error and not-found states are designed for each screen. Overview's "Recent work" shows
the most recently updated projects.

## Implementation sequence

1. This plan. 2. Migration. 3. Domain and unit tests. 4. Repositories and integration tests
(isolation, integrity, activity, archive guard). 5. Actions and queries. 6. Routes and components.
7. Registration in the shell, Overview, Settings. 8. Browser tests. 9. Docs, ADR, status file.

## Acceptance criteria

Each is verified by the named suite and recorded in `docs/m2-acceptance.md`.

1. Migrations apply to an empty database, are idempotent, and give an identical schema twice.
   Existing M1 workspaces are backfilled with defaults. (integration)
2. A new workspace has the default statuses and categories. (integration, e2e)
3. A user can create, edit, and archive/restore a project; every field persists. (e2e)
4. Another workspace's projects, notes, tags, activity, statuses and categories are invisible and
   unwritable, including by guessing ids; the foreign project URL shows the standard not-found
   page. (integration, e2e)
5. A project cannot reference another workspace's status, category or tag. (integration)
6. Statuses and categories can be created, renamed, recoloured and (statuses) reordered by owners;
   members cannot; a status in use cannot be deleted; deleting a category uncategorises. (integration, e2e)
7. Tags are created on the fly, reused case-insensitively, filterable. (unit, integration, e2e)
8. Search, filters, sort and pagination work and are reflected in the URL. (unit, e2e)
9. Notes can be added, edited, pinned and deleted; only the author or an owner may edit or delete.
   (integration, e2e)
10. Activity records creation and each kind of change with actor and values, cannot be written or
    altered by the application role, and does not record no-op saves. (integration, e2e)
11. Archived projects are read-only at the database. (integration, e2e)
12. Invalid input is explained per field; the database re-checks lengths, enums and date order.
    (unit, integration, e2e)
13. Keyboard and accessibility: dialogs trap and restore focus, controls are labelled, the new
    pages work at 375px width without sideways scroll. (e2e)
14. `npm run lint`, `typecheck`, `test` and `test:e2e` pass; `npm run build` succeeds.
15. No M1 behaviour regresses: the full M1 suites pass, with only the three Projects-availability
    assertions updated.

## Deviations

What changed between this plan and what was built, and why.

- **`edited_at` on notes** (not planned). Showing "edited" from `updated_at` was wrong, because
  pinning also updates it. A trigger now stamps `edited_at` only when the title or text changes.
- **A `BEFORE DELETE` trigger on categories** (not planned). The foreign key clears the category
  on each project after the row is gone, so the activity trigger could not name it. The delete
  trigger records the name first and the project trigger skips that case.
- **Shared UI additions.** `Select`, `Textarea`, `Labelled` and `ConfirmDialog` in `shared/ui`,
  hue tokens in `globals.css`, a `size` prop on `DialogContent`, and focus restoration in
  `DialogContent` (Radix only restores focus to a `Trigger`). The last one also changes M1's
  create-workspace dialog, for the better.
- **A `CalendarDate` component** so calendar dates use the viewer's locale like M1's timestamps.
- **`domain/tags.ts` was not created**; tag helpers live in `domain/project.ts`.
- **Overview copy.** The subtitle no longer says "This is the foundation of your studio".
- Everything else (tables, RLS, routes, UI structure, shortcut, palette command) is as planned.

