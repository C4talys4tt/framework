# FRAMEWORK

A creative production workspace for motion designers, video editors, VFX artists and filmmakers.

**Status: Milestone 2 (project management).** Accounts, isolated workspaces, the workspace shell,
the Overview dashboard, command navigation, theming and settings (M1) work end to end, and so does
Projects (M2): create, edit and archive projects; workspace-defined statuses and categories; tags;
custom details; search and filters; per-project notes and activity history. The remaining modules
(Visual Library, Production, Assets, Effects Lab, Journal, Archive) are listed in the interface as
unavailable and have no routes yet. See [PROJECT_STATUS.md](PROJECT_STATUS.md).

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
| `G` then `P` | Go to Projects |
| `G` then `S` | Go to Settings |

## Documentation

- [Architecture](docs/architecture.md): structure, request flow, isolation model, conventions
- [Project status](PROJECT_STATUS.md): what is built, what is next, known limits
- [M1 acceptance criteria](docs/m1-acceptance.md): what "done" meant for the foundation
- [M2 plan](docs/m2-plan.md) and [M2 acceptance criteria](docs/m2-acceptance.md): project
  management, how it was planned, and how each item is verified
- [Decision records](docs/adr): why the main technical choices were made
