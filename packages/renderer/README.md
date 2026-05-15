# `@app/renderer`

React renderer package for Kaizer.

## Purpose

Implements the user interface:

- Search and stream tracks
- Browse/download local tracks
- Configure server/storage behavior
- Manage playlists
- Player controls and playback UI

This package is browser-context code. Privileged behavior is accessed via `@app/preload`.

## Stack

- React 19
- Vite 7
- TanStack Router (file-based routes)
- TanStack Query v5
- Tailwind CSS v4

## Scripts

```bash
npm run dev --workspace @app/renderer
npm run build --workspace @app/renderer
npm run lint --workspace @app/renderer
npm run preview --workspace @app/renderer
```

## Route Map

- `src/routes/search.tsx` - remote provider search and album dialog interactions
- `src/routes/downloads.tsx` - local downloads table and bulk actions
- `src/routes/settings.tsx` - configuration UI and server health controls
- `src/routes/playlist.tsx` - playlist listing views
- `src/routes/playlist.$playlistId.tsx` - single playlist details

## State and Data

- Client app state context: `src/app/appStateContext.tsx`
- TanStack Query setup: `src/queryClient.ts`
- Router setup: `src/router.tsx`
- Entry point: `src/main.tsx`

## Design System Notes

- Shared UI components are under `src/components/ui`
- Layout components are under `src/components/layout`
- Tailwind design-system utility classes and tokens are defined in `src/index.css`

## Boundary Rules

- Do not use Node-only APIs in renderer code.
- Use `send(...)` from `@app/preload` for IPC actions.
- Keep process-specific logic in `@app/main` and expose it through IPC.

---
Last reviewed: 2026-02-13
