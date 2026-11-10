# 5. Project data model: workspace-defined vocabularies, schema-enforced integrity, trigger-written history

Status: accepted (M2)

## Context

Projects are the first module whose data has relationships (status, category, tags, notes,
history) and the first that more than one member of a workspace may write. M1's isolation model
(ADR 2) stops a user reaching another workspace's rows, but two further risks appear:

- a row in workspace A pointing at a status, category or tag in workspace B, which RLS alone does
  not prevent because foreign key checks run with the table owner's rights;
- an activity history that is only as complete as the application code that remembers to write it.

## Decision

- **Statuses and categories are workspace data, not enums.** Each workspace gets seeded defaults and
  owners edit them. A status has a `kind` (`planned`, `active`, `paused`, `done`) so code can reason
  about it ("finished", "paused") without depending on what it is called.
- **Same-workspace integrity lives in the schema.** `projects`, `project_tag_links` and the
  other children reference parents with composite keys `(id, workspace_id)`, so a mismatch is a
  foreign key violation (`23503`). Application code cannot get this wrong. Deleting a category
  clears it on projects (`on delete set null (category_id)`, PostgreSQL 15+); a status in use cannot
  be deleted.
- **Activity is append-only and written by triggers.** `SECURITY DEFINER` trigger functions record
  who changed what; `framework_app` can only `select` from `project_activity`. Saves that change
  nothing record nothing. Values are copied by name at the time (so renaming a status later does not
  rewrite history), but the text of descriptions and notes is not copied.
- **Archived means read-only, enforced in the database.** One `BEFORE UPDATE` trigger on projects,
  and guards on notes and tag links, reject edits until the project is restored. The only exception
  is the foreign key clearing a deleted category.
- **Defaults are seeded by a trigger on `workspaces`**, not by changing M1's `app.create_workspace`.
  The migration backfills workspaces that already exist.
- **Member names without opening `auth_users`.** `app.workspace_member_names(workspace)` returns
  `(user_id, name)` only for members of workspaces the caller belongs to. It is the sole path from
  `framework_app` to anything in `auth_users`.
- **Custom details are a `jsonb` array on the project**, not a table. They are only ever read and
  written with the project, are small (at most 20 pairs), and keeping them in the same row makes
  their change history a single comparison. The database checks it is an array of bounded length;
  Zod checks the shape of each element.
- **Projects cannot be deleted** in M2 (no grant, no policy). Archiving is the removal mechanism.

## Consequences

- Cross-workspace references fail loudly and are covered by integration tests.
- Adding a project-related table follows the same recipe: composite foreign key to the parent,
  RLS, column grants, a guard if it must respect archiving, an activity trigger if it should appear
  in history.
- Because history is written in the database, any future writer (a script, an import, another
  module) is recorded too, attributed to whoever `app.user_id` names.
- Custom details cannot be queried or filtered efficiently. If M7 search needs that, promote them
  to a table with a migration.
- Tags are never deleted in M2; a tag with no projects simply stops being listed. Renaming or
  merging tags needs its own interface and is deferred.
- Concurrent edits to one project are last-write-wins. The history shows both writes, but the
  second silently replaces the first's fields. Optimistic concurrency can be added with a version
  column if real collaboration makes it matter.
