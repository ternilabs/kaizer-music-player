# `@app/main`

Electron main-process package for Kaizer.

## Purpose

This package owns privileged desktop/runtime behavior:

- Browser window lifecycle
- Security modules and external URL policy
- IPC handlers for providers and storage/download actions
- Provider service integrations (`Atlas`, `Orion`, `Helios`)
- Local SQLite persistence and migrations
- Local download management and local-stream protocol handling

## Scripts

```bash
npm run build --workspace @app/main
npm run typecheck --workspace @app/main
npm run db:generate --workspace @app/main
npm run db:migrate --workspace @app/main
```

## Runtime Responsibilities

- App boot pipeline starts in `src/index.ts`
- Modules are registered in `src/index.ts` via `ModuleRunner`
- IPC endpoints are defined in `src/modules/*Ipc.ts`
- Provider HTTP logic lives in:
  - `src/atlas/AtlasService.ts`
  - `src/orion/OrionService.ts`
  - `src/helios/HeliosService.ts`
- Storage layer:
  - schema: `src/storage/schema.ts`
  - DB service: `src/storage/StorageService.ts`
  - IPC bridge: `src/modules/StorageIpc.ts`
- Downloads/local stream:
  - `src/modules/DownloadsIpc.ts`
  - protocol: `kaizer-local://...`

## Data Location

Persistent app data is stored under Electron `app.getPath('userData')`, including:

- `kaizer.db`
- `downloads/`

## Notes

- Window minimum size and centering are configured in `src/modules/WindowManager.ts`.
- Shared outbound request user-agent defaults live in `src/shared/httpHeaders.ts`.

---
Last reviewed: 2026-02-13
