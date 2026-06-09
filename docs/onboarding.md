# Onboarding Guide

Everything you need to start working on Kaizer.

## Prerequisites

- **Node.js** >= 23.0.0 (enforced by `package.json`)
- **npm** (comes with Node.js)
- **Git**

## Quick Start

```bash
# Clone the repo
git clone https://github.com/TerniLabs/kaizer-music-player.git
cd kaizer-music-player

# Install dependencies
npm install

# Start development mode
npm start
```

This starts:
1. Renderer Vite dev server (hot reload)
2. Main + preload watch builds
3. Electron app (auto-restarts on main process changes)

## Key Commands

| Command | What it does |
|---------|--------------|
| `npm start` | Dev mode with hot reload |
| `npm run build` | Build all workspaces |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run compile` | Build + package distributable |
| `npm test` | Run Playwright e2e tests |
| `npm run lint --workspace @app/renderer` | ESLint on renderer |

### Database Commands

```bash
# Generate migration SQL from schema changes
npm run db:generate --workspace @app/main

# Apply migrations
npm run db:migrate --workspace @app/main
```

### Platform-Specific Builds

```bash
# Linux .deb
npm run compile -- --linux deb

# Windows portable .exe
npm run compile -- --win portable

# Debug unpacked build (no installer)
npm run compile -- --dir -c.asar=false
```

## Project Structure

```
packages/
├── main/           Electron main process
├── preload/        Preload bridge (contextBridge)
├── renderer/       React UI
├── electron-versions/  Build helpers
├── integrate-renderer/ Template helper
├── dev-mode.js     Dev orchestrator
└── entry-point.mjs Electron entry point
```

## How the Pieces Connect

```
Renderer (React)  →  Preload (bridge)  →  Main (Electron)
   ↓                    ↓                    ↓
TanStack Router     send(channel, data)   ipcMain.handle()
TanStack Query      contextBridge         Provider services
Tailwind CSS                              SQLite storage
```

## Common Tasks

### Adding a New IPC Channel

1. **Create IPC handler** in `packages/main/src/modules/YourModuleIpc.ts`:

```typescript
import { ipcMain } from 'electron'
import type { AppModule } from '../AppModule.js'

class YourModuleIpcModule implements AppModule {
  enable(): void {
    ipcMain.removeHandler('your-module:action')
    ipcMain.handle('your-module:action', async (_event, rawInput: unknown) => {
      // Validate input, call service, return result
      return { ok: true }
    })
  }
}

export function yourModuleIpcModule() {
  return new YourModuleIpcModule()
}
```

2. **Register the module** in `packages/main/src/index.ts`:

```typescript
import { yourModuleIpcModule } from './modules/YourModuleIpc.js'

// In the module chain:
.init(yourModuleIpcModule())
```

3. **Call from renderer**:

```typescript
import { send } from '@app/preload'

const result = await send('your-module:action', { key: 'value' })
```

### Adding a New Route

1. Create a file in `packages/renderer/src/routes/`:

```typescript
// packages/renderer/src/routes/my-page.tsx
export const Route = createFileRoute('/my-page')({
  component: MyPage,
})

function MyPage() {
  return <div>My Page</div>
}
```

2. Route tree is auto-generated to `routeTree.gen.ts` — do not edit manually.

### Adding a New UI Component

1. Check existing components in `packages/renderer/src/components/ui/` for patterns
2. Use `cn()` from `@/lib/cn` for conditional classes:

```typescript
import { cn } from '@/lib/cn'

<div className={cn('base-class', condition && 'conditional-class')} />
```

### Modifying the Database Schema

1. Edit `packages/main/src/storage/schema.ts`
2. Generate migration: `npm run db:generate --workspace @app/main`
3. Apply migration: `npm run db:migrate --workspace @app/main`

### Adding a New Provider

1. Create service in `packages/main/src/your-provider/YourProviderService.ts`
2. Create IPC module in `packages/main/src/modules/YourProviderIpc.ts`
3. Register in `packages/main/src/index.ts`
4. Add provider to fallback chain in user settings

## Code Conventions

### Renderer (React)

- **Path alias**: `@/` maps to `packages/renderer/src/`
- **Styling**: Tailwind CSS v4 + `tailwind-merge` + `clsx`
- **State**: `AppStateContext` for app-wide state, TanStack Query for server state
- **Routing**: TanStack Router file-based routes
- **React Compiler**: Babel plugin enabled — write standard React, compiler auto-memoizes
- **Env vars**: Only `VITE_*` prefixed variables are exposed

### Main Process

- **Module pattern**: Implement `AppModule.enable(context)`
- **IPC handlers**: Always call `ipcMain.removeHandler()` before `ipcMain.handle()` to avoid duplicates
- **Input validation**: Validate all raw IPC input with type guards
- **Error handling**: Wrap service calls in try/catch, return meaningful errors

### General

- **Indentation**: 2 spaces (`.editorconfig`)
- **Line endings**: LF
- **Encoding**: UTF-8
- **TypeScript**: Strict mode enabled

## Troubleshooting

### `better-sqlite3` version mismatch

If you see `ERR_DLOPEN_FAILED ... NODE_MODULE_VERSION ...`:

```bash
npm rebuild better-sqlite3 --runtime=electron --target=40.2.1 --dist-url=https://electronjs.org/headers
```

### Renderer not loading

- Check if Vite dev server is running (look for URL in terminal)
- Ensure `VITE_DEV_SERVER_URL` is set in environment

### IPC calls failing

- Verify the handler is registered in the module chain
- Check for typos in channel names
- Look for errors in the main process console

### Tests failing

- Tests require a compiled app: `npm run compile` before `npm test`
- Check `dist/` directory for built artifacts

## Useful Files

| File | Purpose |
|------|---------|
| `packages/main/src/index.ts` | App entry, module chain |
| `packages/main/src/storage/schema.ts` | Database schema |
| `packages/renderer/src/routes/__root.tsx` | Root layout |
| `packages/renderer/src/app/appStateContext.tsx` | App state provider |
| `packages/preload/src/index.ts` | Preload exports |
| `packages/entry-point.mjs` | Electron entry |
| `packages/dev-mode.js` | Dev orchestrator |
| `electron-builder.mjs` | Build config |

## Getting Help

- Check existing code for patterns before writing new code
- Look at neighboring files for import conventions
- Run `npm run typecheck` to catch type errors early
- Use `npm run lint --workspace @app/renderer` to check renderer code
