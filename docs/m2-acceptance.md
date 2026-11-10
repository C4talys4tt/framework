# M2 acceptance criteria

M2 is project management. Each criterion lists how it is verified; "unit" is `src/**/*.test.ts`,
"integration" is `tests/integration`, "e2e" is `tests/e2e/projects.spec.ts` unless another spec is
named. The plan these came from is [m2-plan.md](m2-plan.md).

## Database

- [x] Migrations apply to an empty database, are a no-op when re-run, and produce an identical
      schema in a second database (integration: migrations; also run by hand with
      `npm run db:migrate` against a brand-new database).
- [x] Workspaces created under M1 are backfilled with default statuses and categories, without
      editing the applied M1 migration (integration: projects, "backfills…").
- [x] Every new table has row-level security enabled (integration: migrations).
- [x] The application role has the least privilege it needs: it cannot delete projects, move them
      between workspaces, forge `created_by` or `archived_by`, write or erase activity, set
      `edited_at`, or call the trigger and seeding functions (integration: projects, "privileges",
      "notes", "activity").
- [x] The database re-checks lengths, enums, date order and field shape (integration: projects,
      "database constraints").

## Workspace isolation

- [x] Another user's projects, notes, tags, activity, statuses and categories are invisible, even to
      raw queries with no workspace filter, and unwritable (integration: projects, "workspace
      isolation").
- [x] A project cannot reference another workspace's status, category or tag, including for a user
      who belongs to both workspaces (integration).
- [x] A project's URL is "not found" for another user, for the same user under a different
      workspace's URL, and for malformed ids, on all three project pages (e2e: isolation).
- [x] Searching or filtering by tag in another workspace reveals nothing (e2e: isolation).
- [x] Members of a shared workspace can create and edit projects and write notes, but cannot
      manage statuses or categories, or change other people's notes; an owner can moderate notes
      (integration; e2e: shared workspace).

## Projects

- [x] Create a project with every field; each persists and appears on the detail page, in the list
      and on the Overview (e2e).
- [x] Edit a project, including its tags and custom details; changes persist (e2e).
- [x] Change status from the project header (e2e).
- [x] Archive (with confirmation) and restore. Archived projects leave the active list, appear under
      "Archived", and are read-only: details, status, tags and notes (integration: archiving; e2e).
- [x] Invalid input is explained per field and focus moves to the first problem (unit; e2e).
- [x] Due dates are flagged overdue or soon, except for finished or archived projects (unit; e2e).

## Categories, statuses, tags

- [x] New workspaces have default statuses and categories (integration; e2e).
- [x] Owners add, rename, recolour and delete categories; deleting one keeps its projects,
      uncategorised, and records it in their history (integration; e2e: settings).
- [x] Owners add, rename, recolour, reorder and delete statuses; names are unique ignoring case; a
      status in use or the last status cannot be deleted (integration; e2e: settings).
- [x] Tags are created while editing, reused ignoring case, listed with counts, and filterable
      (unit; integration; e2e).

## Browsing

- [x] Search (name, client, description), status, category, tag, archived view and five sort orders
      work, treat `%` and `_` literally, and are kept in the URL, so a view survives reload and is
      linkable (unit; integration; e2e).
- [x] Pagination works, and a page past the end lands on the last real page (integration; e2e).
- [x] Two quick filter changes both apply (e2e; was a real bug, see "Found during testing").

## Notes and activity

- [x] Notes can be added, edited, pinned (pinned first) and deleted (with confirmation); they are
      shown as plain text, never as HTML (integration; e2e).
- [x] "Edited" appears only when a note's title or text changed, not when it was pinned
      (integration).
- [x] Activity records creation and each kind of change with the actor and the old and new
      values, and does not record saves that change nothing or merely reorder custom details
      (integration; e2e).
- [x] History cannot be written, altered or deleted by the application role (integration).
- [x] Long histories load a page at a time (integration; e2e).

## Interface quality

- [x] Dialogs trap focus, close with Escape and return focus to what opened them (e2e).
- [x] Every control has an accessible name; errors are announced (`role="alert"`); tabs and the
      current page are exposed with `aria-current` (e2e, by role-based locators throughout).
- [x] Projects, project pages, settings and the project dialog fit a 375px screen with no sideways
      scroll (e2e).
- [x] Dark and light themes both render correctly (checked by eye in the browser; the tokens are
      defined for both palettes).
- [x] Every new screen has loading (skeleton), empty, and not-found states.
- [x] No errors in the browser console in the main flows (e2e), and none in the browser console or
      the server log across every new route in `next dev` (checked manually).

## Quality gates

- [x] `npm run lint` and `npm run typecheck` pass.
- [x] `npm test`: 166 tests pass (84 before M2).
- [x] `npm run build` succeeds; every new route is partially prerendered.
- [x] `npm run test:e2e`: 56 tests pass (33 before M2).
- [x] The new browser spec passed 92 of 92 runs when repeated four times in parallel, and 20 of 20
      when its two settings tests were repeated ten times with six workers.
- [x] No M1 behaviour regressed. The M1 suites pass with three assertions changed on purpose:
      the module-registry unit test (Overview and Projects are now available), and two e2e
      assertions that used Projects as their example of an unavailable module (now Visual
      Library; the contract they protect is unchanged).

## Found during testing

Browser and integration testing found defects that the first implementation did not have tests
for. They were fixed at the cause, and the tests that exposed them stay:

- Deleting a category lost its name in the history of the projects that used it (the foreign key
  clears it after the row is gone). History now records the deleted category's name, once.
- "Edited" on a note was inferred from timestamps, so pinning a note counted as an edit. It now
  uses a dedicated `edited_at`.
- Two filter changes in quick succession overwrote each other because the second built on stale
  props. The filter bar now builds on the latest requested state.
- Choosing "New project" in the command palette after having visited Projects opened nothing: the
  kept-mounted page ignored the new `autoOpen` value.
- Closing a dialog opened from an ordinary button left focus on the page body. The shared dialog
  now restores focus (this also improves M1's create-workspace dialog).
- The tag chips and the tag input were both labelled "Tags".

## Known limits

Stated so nothing is assumed:

- Browser tests run in Chromium only; Firefox and Safari were not tested.
- Accessibility was verified with role-based tests and by hand, not with an automated audit such
  as axe, and not with a screen reader.
- Concurrent edits to a project are last-write-wins (ADR 5).
- Tags cannot be renamed, merged or deleted; unused tags are just not listed.
- The tag limit (12) and custom detail shape are enforced by the application and its validation,
  not by database constraints.
- There is no permanent project deletion, board view, or cross-project search. Archived projects
  are reached through the Projects filter; the Archive module is still unbuilt.
- Names in history are looked up live, so someone who has left a workspace appears as "A former
  member".
