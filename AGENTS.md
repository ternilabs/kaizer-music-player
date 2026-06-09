# AGENTS.md

Kaizer is an Electron monorepo desktop music player (React 19 + Vite 7 + SQLite).

## Quick Reference

```bash
npm install          # install deps (requires node >=23)
npm start            # dev mode: renderer vite server + watch/rebuild main & preload + auto-restart electron
npm run build        # build all workspaces
npm run typecheck    # typecheck all workspaces
npm run compile      # build + package distributable via electron-builder
npm test             # run playwright e2e tests (requires compiled app in dist/)
npm run lint --workspace @app/renderer   # eslint on renderer only
npm run db:generate --workspace @app/main   # generate migration SQL from schema changes
npm run db:migrate --workspace @app/main    # apply migrations
```

## Critical Rule

`renderer` is web code — never import Node/Electron modules there. Use `preload` as the bridge: `renderer -> preload (send()) -> main (ipcMain.handle())`.

## Detailed Instructions

- [Architecture](docs/architecture.md) — monorepo layout, IPC pattern, module system, providers, data flow
- [Renderer](docs/renderer.md) — React, routing, state, styling, path aliases
- [Database](docs/database.md) — Drizzle schema, migrations, tables
- [Testing](docs/testing.md) — Playwright E2E setup and debugging
- [Troubleshooting](docs/troubleshooting.md) — common issues and fixes
- [IPC Reference](docs/ipc-reference.md) — full IPC channel API docs
- [Onboarding](docs/onboarding.md) — setup walkthrough and common tasks
