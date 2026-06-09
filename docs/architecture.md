# Architecture

Kaizer is an Electron desktop application for streaming and managing music from multiple third-party providers. This document covers the high-level design, key decisions, and data flow.

## Goals

- Search tracks across multiple remote providers (Atlas, Orion, Helios)
- Stream audio in-app with full playback controls
- Manage playlists with persistent storage
- Download tracks for offline playback
- Provide a responsive, native-like UI experience

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Electron 40 | Desktop shell, native APIs |
| Renderer | React 19 + Vite 7 | UI framework and bundler |
| Routing | TanStack Router | File-based routing |
| State | TanStack Query v5 | Server state management |
| Styling | Tailwind CSS v4 | Utility-first CSS |
| Database | Drizzle ORM + better-sqlite3 | Local persistence |
| Testing | Playwright | E2E tests |

## Monorepo Structure

```
packages/
├── main/                    @app/main
│   ├── src/
│   │   ├── index.ts         App entry, module chain
│   │   ├── modules/         IPC handlers, window mgmt, security
│   │   ├── atlas/           Atlas provider service
│   │   ├── orion/           Orion provider service
│   │   ├── helios/          Helios provider service
│   │   ├── storage/         Drizzle schema, StorageService
│   │   └── shared/          Shared utilities (HTTP headers)
│   └── drizzle/             Migration SQL files
│
├── preload/                 @app/preload
│   └── src/
│       ├── index.ts         Exports: send(), sha256sum, versions
│       └── exposed.ts       contextBridge.exposeInMainWorld()
│
├── renderer/                @app/renderer
│   └── src/
│       ├── routes/          TanStack Router file-based routes
│       ├── components/      UI components (layout/, ui/)
│       ├── app/             App state context, types
│       └── lib/             Utilities (cn, inputValidation)
│
├── electron-versions/       Build helpers for Electron targeting
├── integrate-renderer/      Template/scaffold helper
├── dev-mode.js              Dev orchestrator
└── entry-point.mjs          Electron entry point
```

## Process Boundary

Electron enforces a strict process boundary. Violating this causes runtime failures.

```
┌─────────────────────────────────────────────────────────────┐
│  Renderer Process (Web)                                     │
│  - React UI, TanStack Router/Query, Tailwind               │
│  - Cannot access Node.js or Electron APIs                   │
│  - Communicates via preload bridge                          │
└──────────────────────────┬──────────────────────────────────┘
                           │ send(channel, payload)
┌──────────────────────────▼──────────────────────────────────┐
│  Preload Bridge                                             │
│  - contextBridge.exposeInMainWorld()                        │
│  - Exposes: send(), sha256sum(), versions                   │
│  - Runs in renderer context but with Node access            │
└──────────────────────────┬──────────────────────────────────┘
                           │ ipcRenderer.invoke(channel, payload)
┌──────────────────────────▼──────────────────────────────────┐
│  Main Process (Node.js)                                     │
│  - Electron APIs, filesystem, networking                    │
│  - IPC handlers via ipcMain.handle()                        │
│  - Provider services, storage, downloads                    │
└─────────────────────────────────────────────────────────────┘
```

**Rule**: Never import Node/Electron modules in `renderer`. Use `preload` as the bridge.

## Module System

The main process uses a `ModuleRunner` pattern. Each module implements `AppModule.enable(context)` and is chained in `packages/main/src/index.ts`.

```typescript
// packages/main/src/AppModule.ts
export interface AppModule {
  enable(context: ModuleContext): Promise<void> | void;
}
```

Modules are initialized sequentially:

```typescript
// packages/main/src/index.ts
const moduleRunner = createModuleRunner()
  .init(createWindowManagerModule({initConfig}))
  .init(disallowMultipleAppInstance())
  .init(terminateAppOnLastWindowClose())
  .init(storageIpcModule())
  .init(atlasIpcModule())
  // ... more modules
```

## IPC Flow

All IPC follows the same pattern:

```
Renderer                    Preload                     Main
   │                           │                          │
   │  send('channel', data)    │                          │
   │──────────────────────────►│                          │
   │                           │  ipcRenderer.invoke()    │
   │                           │─────────────────────────►│
   │                           │                          │ handler(data)
   │                           │                          │ service.method()
   │                           │         response         │
   │                           │◄─────────────────────────│
   │         response          │                          │
   │◄──────────────────────────│                          │
```

### IPC Channel Naming

Channels follow the pattern `{provider}:{action}`:

| Channel | Action |
|---------|--------|
| `atlas-main:search-tracks` | Search tracks via Atlas |
| `atlas-main:get-album` | Get album details via Atlas |
| `atlas-main:get-stream` | Get stream URL via Atlas |
| `atlas-main:health` | Check Atlas server health |
| `orion-main:search-tracks` | Search tracks via Orion |
| `orion-main:get-album` | Get album details via Orion |
| `orion-main:get-stream` | Get stream URL via Orion |
| `orion-main:health` | Check Orion server health |
| `helios-main:search-tracks` | Search tracks via Helios |
| `helios-main:get-album` | Get album details via Helios |
| `helios-main:get-stream` | Get stream URL via Helios |
| `helios-main:health` | Check Helios server health |
| `storage:get-bootstrap` | Load app state snapshot |
| `storage:save-snapshot` | Persist app state |
| `downloads:start` | Start track download |
| `downloads:delete` | Delete downloaded track |
| `downloads:delete-many` | Delete multiple tracks |
| `downloads:clear` | Clear all downloads |
| `downloads:get-local-stream` | Get local stream URL |
| `downloads:cancel-active` | Cancel active download |
| `media-cache:cache-image` | Cache remote image |
| `lyrics:get` | Fetch lyrics from LRCLIB |
| `updates:check` | Check for app updates |
| `updates:get-required-action` | Get update requirement |
| `updates:open-release-url` | Open release page |
| `backup:export` | Export backup archive |
| `backup:import` | Import backup archive |
| `backup:get-status` | Get backup operation status |

## Provider Architecture

Each provider has a service class and an IPC handler:

```
packages/main/src/
├── atlas/
│   └── AtlasService.ts      # HTTP client, fallback logic
├── orion/
│   └── OrionService.ts      # HTTP client, fallback logic
├── helios/
│   └── HeliosService.ts     # HTTP client, fallback logic
└── modules/
    ├── AtlasIpc.ts           # ipcMain.handle() for Atlas
    ├── OrionIpc.ts           # ipcMain.handle() for Orion
    └── HeliosIpc.ts          # ipcMain.handle() for Helios
```

Providers have internal fallback chains (e.g., `atlas-main` -> `atlas-alt`). The fallback is driven by the user's preferred server setting.

## Data Flow

### Search Flow

```
1. User types query in search bar
2. Renderer calls send('atlas-main:search-tracks', {query, offset, type})
3. AtlasIpc handler delegates to atlasService.searchTracks()
4. AtlasService fetches from remote API with fallback
5. Response normalized to AtlasSearchResult
6. Tracks returned to renderer, displayed in SongCard/SongRow components
```

### Playback Flow

```
1. User clicks play on a track
2. Renderer checks for local download first
3. If downloaded: send('downloads:get-local-stream', {trackId})
   - Returns kaizer-local:// URL
   - Protocol handler serves file with range support
4. If not downloaded: send('{provider}:get-stream', {trackId})
   - Returns remote stream URL
   - Audio element streams from remote server
```

### Download Flow

```
1. User clicks download on a track
2. Renderer calls send('downloads:start', {trackId, storageCapacityMb})
3. DownloadsIpc enqueues download (serialized queue)
4. Stream URL fetched from provider
5. Audio data downloaded to temp file
6. Renamed to final .flac path
7. Download index updated in storage
```

## Storage

### Database Schema

SQLite database stored at `{userData}/kaizer.db`. Schema defined in `packages/main/src/storage/schema.ts`.

| Table | Purpose |
|-------|---------|
| `tracks` | Cached track metadata |
| `playlists` | User playlists |
| `playlist_tracks` | Playlist-track relationships |
| `recent_playlists` | Recently used playlists |
| `downloads` | Downloaded track index |
| `settings` | Key-value settings |
| `logs` | App event logs |

### Snapshot Persistence

App state is persisted as a snapshot via `storage:get-bootstrap` and `storage:save-snapshot`. This includes:
- All tracks (search results, playlist tracks)
- Playlists with track IDs
- Bookmarked/auto-download/album-locked playlist IDs
- Downloaded track IDs
- Settings (preferred server, storage capacity, etc.)

## Custom Protocols

Two custom protocols are registered:

### `kaizer-local://`

Serves downloaded audio files with range request support for seeking.

```
kaizer-local://track/{encodedTrackId}
```

### `kaizer-media://`

Serves cached images (cover art, playlist images).

```
kaizer-media://image/{encodedFileName}
```

Both protocols are registered as privileged with CORS, fetch API, and stream support.

## Window Management

- Design size: 1440 x 1006
- Minimum size: 1180 x 640
- Window opens centered and hidden, shown on `ready-to-show`
- Single instance enforced via `app.requestSingleInstanceLock()`
- Hardware acceleration disabled by default

## Security

- `contextIsolation: true` (preload bridge, not direct Node integration)
- `nodeIntegration: false`
- Internal origins whitelisted via `BlockNotAllowdOrigins` module
- External URLs whitelisted via `ExternalUrls` module
- Custom protocols validate file paths to prevent directory traversal

## Build Pipeline

```
npm run build
  ├── @app/renderer: vite build --base ./
  ├── @app/preload: vite build (SSR, Chrome target)
  └── @app/main: vite build (SSR, Node target)

npm run compile
  ├── npm run build
  └── electron-builder build
      ├── Win: portable .exe
      └── Linux: .deb
```

Artifacts land in `dist/`. Each workspace controls its own `files` in `package.json` to exclude source from the packaged app.
