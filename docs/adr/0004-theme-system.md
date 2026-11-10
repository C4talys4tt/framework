# 4. Theme system: CSS variables, account-level preference, cookie for first paint

Status: accepted (M1)

## Context

The interface must be near-black by default, support alternatives, persist the choice per
account, and never flash the wrong theme. With Cache Components the root layout is static and
cannot read cookies on the server.

## Decision

- Components reference semantic tokens only. Palettes are sets of CSS custom properties selected
  by `data-theme`, `data-density` and `data-motion` on `<html>`.
- Preferences are stored in `user_preferences` (source of truth) and mirrored into a
  non-sensitive cookie. A small inline script in `<head>` copies allow-listed values from the
  cookie to `<html>` before first paint.
- `PreferencesProvider` (above the workspace layout) applies changes optimistically, persists
  them through a server action, reverts on failure, and rewrites the cookie from the account on
  load.

## Consequences

- No flash on reload, including with JavaScript bundles blocked (covered by a browser test).
- A brand-new browser shows the default dark theme until sign-in, then converges to the account.
- Adding a theme is a new block of variables plus one entry in `THEMES` and a database check
  constraint migration.
- "System" is implemented in CSS with `prefers-color-scheme`, so it tracks the OS live.
