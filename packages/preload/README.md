# `@app/preload`

Electron preload bridge package for Kaizer.

## Purpose

This package exposes safe APIs to renderer code.

Renderer imports from `@app/preload` and calls APIs that internally use Electron preload context.

## Current Exposed APIs

- `send(channel, payload?)` from `src/index.ts`  
  IPC invoke helper used across renderer routes/components
- `sha256sum` from `src/nodeCrypto.ts`
- `versions` from `src/versions.ts`

## Scripts

```bash
npm run build --workspace @app/preload
npm run typecheck --workspace @app/preload
```

## Build Outputs

`package.json` exports:

- `./dist/exposed.mjs` for Electron preload runtime
- `./dist/_virtual_browser.mjs` for renderer-side import compatibility

This allows renderer code to import preload exports as regular ES modules while keeping process boundaries intact.

## Boundary Rules

- Keep browser-safe and minimal API surface.
- Do not place renderer UI logic here.
- Keep privileged operations implemented in `@app/main`; expose only the bridge call shape needed by renderer.

---
Last reviewed: 2026-02-13
