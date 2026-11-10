# FRAMEWORK

A creative production workspace for motion designers, video editors, VFX artists and filmmakers.

**Status: Milestone 1 (foundation and application shell).** Accounts, isolated workspaces, the
workspace shell, the Overview dashboard, command navigation, theming and settings work end to end.
The remaining modules (Projects, Visual Library, Production, Assets, Effects Lab, Journal, Archive)
are listed in the interface as unavailable and have no routes yet.

## Requirements

- Node.js 22.18 or newer (scripts are TypeScript run directly by Node)
- PostgreSQL 15 or newer (16 is used in development)

## Getting started

```bash
docker compose up -d          # or point DATABASE_URL at any PostgreSQL server
cp .env.example .env          # then set AUTH_SECRET (openssl rand -base64 32)
npm install
npm run db:migrate
npm run dev
```

Open http://localhost:3000 and create an account. Your first workspace is created automatically.

The database role in `DATABASE_URL` must be able to create tables, functions and the
`framework_app` role (`CREATEROLE`). To run the tests it also needs `CREATEDB`, because the suites
create throwaway databases next to the development one.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, strict |
| `npm run test:unit` | Unit tests (Vitest) |
| `npm run test:integration` | Migration and row-level-security tests against real PostgreSQL |
| `npm test` | Unit and integration tests |
| `npm run test:e2e` | Browser tests (Playwright) against a production build and a fresh database |

## Keyboard

| Keys | Action |
| --- | --- |
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘B` / `Ctrl+B` | Collapse or expand the sidebar |
| `G` then `O` | Go to Overview |
| `G` then `S` | Go to Settings |

## Documentation

- [Architecture](docs/architecture.md): structure, request flow, isolation model, conventions
- [M1 acceptance criteria](docs/m1-acceptance.md): what "done" means and how each item is verified
- [Decision records](docs/adr): why the main technical choices were made
