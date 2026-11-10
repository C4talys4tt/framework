# M1 acceptance criteria

M1 is the foundation and application shell. Each criterion lists how it is verified.
"e2e" refers to `tests/e2e`, "integration" to `tests/integration`.

## The application runs

- [x] `npm run build` succeeds with no type or lint errors.
- [x] `npm run dev` serves every route with no errors or warnings in the server log or browser
      console (checked manually across all screens).
- [x] A new account reaches a working workspace with no console errors (e2e: auth).

## Authentication

- [x] Sign-up, sign-in and sign-out work (e2e: auth).
- [x] Signed-out requests to any workspace URL are redirected to sign-in and returned to the
      requested workspace afterwards (e2e: auth).
- [x] The post-sign-in redirect cannot leave the site (unit: credentials; e2e: auth).
- [x] Invalid input is explained per field; wrong credentials get one generic message that does
      not reveal whether the account exists (e2e: auth).
- [x] An email address can be registered once, case-insensitively (e2e: auth).
- [x] The auth API enforces the same rules as the forms when called directly (e2e: auth).
- [x] Password changes require the current password and take effect (e2e: settings).
- [x] Credential endpoints are rate limited in production (verified manually: the fourth sign-in
      attempt within ten seconds returns 429).

## Workspace isolation

- [x] A user sees only workspaces they belong to (integration, e2e: workspaces).
- [x] Another user's workspace URL shows the same not-found page as a nonexistent one, on every
      sub-route (e2e: workspaces).
- [x] Renaming is limited to owners, enforced in the database (integration).
- [x] The application role cannot read auth tables, insert memberships, or create or delete
      workspaces directly (integration).
- [x] Without an acting user, queries return nothing (integration).
- [x] User context never leaks between requests through the connection pool (integration).

## Navigation and shell

- [x] The sidebar shows the current page, collapses, and remembers its state per account
      (e2e: shell).
- [x] Modules that are not built are marked unavailable, are not links, have no routes, and are
      disabled in the command palette (unit: navigation; e2e: shell).
- [x] The command palette opens with Ctrl/⌘K, filters, and navigates by keyboard (e2e: shell).
- [x] Go-to shortcuts work and do not fire while typing (unit: shortcuts; e2e: shell).
- [x] A skip link, focus management on navigation, and labelled landmarks support keyboard and
      screen-reader use (e2e: shell).
- [x] Below 768px the navigation becomes a drawer and the page does not scroll sideways
      (e2e: shell).
- [x] A second workspace can be created and switched to (e2e: workspaces).

## Theme and preferences

- [x] Dark is the default; light and system are available (e2e: appearance).
- [x] Theme, density and reduced motion persist across reloads without a flash, and follow the
      account to a new browser (e2e: appearance).
- [x] Preferences stay consistent when switching between workspaces (e2e: workspaces).

## Settings

- [x] Profile, Appearance, Workspace and Account sections exist and save real data
      (e2e: settings, workspaces, appearance).

## Database

- [x] Migrations apply to an empty database, are a no-op when re-run, and produce an identical
      schema in a second database (integration).
- [x] Edited or missing migrations stop the runner; a failing migration leaves nothing behind
      (integration).
- [x] Every table has row-level security enabled (integration).

## Quality gates

- [x] `npm run lint` and `npm run typecheck` pass.
- [x] `npm test` passes (unit and integration).
- [x] `npm run test:e2e` passes against a production build.
