# IPC API Reference

Complete reference for all IPC channels between renderer and main process.

## Usage Pattern

```typescript
// In renderer
import { send } from '@app/preload'

const result = await send('channel:action', { key: 'value' })
```

---

## Providers (Atlas, Orion, Helios)

All three providers share the same IPC interface. Replace `{provider}` with `atlas-main`, `orion-main`, or `helios-main`.

### `{provider}:search-tracks`

Search for tracks.

**Input:**
```typescript
{
  query: string      // Search query (required)
  offset?: number    // Pagination offset (default: 0)
  type?: string      // Search type (default: 'track')
}
```

**Output:**
```typescript
{
  version: string
  sourceServerId: string
  fallbackUsed: boolean
  data: {
    items: Array<{
      id: string              // Format: "{provider}:{trackId}"
      title: string
      artist: string
      album: string
      albumId?: string
      sourceServerId?: string
      isHiRes: boolean
      duration: string        // Format: "M:SS"
      sizeMb: number
      coverTone: string       // Tailwind gradient class
      coverUrl?: string
    }>
    totalNumberOfItems: number
  }
}
```

**Example:**
```typescript
const result = await send('atlas-main:search-tracks', {
  query: 'Bohemian Rhapsody',
  offset: 0,
  type: 'track',
})
```

### `{provider}:get-album`

Get album details with track listing.

**Input:**
```typescript
{
  albumId: string    // Album ID (required)
}
```

**Output:**
```typescript
{
  version: string
  sourceServerId: string
  fallbackUsed: boolean
  data: {
    id: string
    title: string
    artist: string
    coverUrl?: string
    releaseDate?: string
    trackCount: number
    tracks: Array<{
      id: string
      title: string
      artist: string
      duration: string
      isHiRes: boolean
    }>
  }
}
```

### `{provider}:get-stream`

Get a streaming URL for a track.

**Input:**
```typescript
{
  trackId: string    // Track ID (required)
}
```

**Output:**
```typescript
{
  version: string
  sourceServerId: string
  fallbackUsed: boolean
  data: {
    url: string      // Stream URL
  }
}
```

**Note:** Helios also accepts an optional `quality` field:
```typescript
{
  trackId: string
  quality?: string   // Audio quality preference
}
```

### `{provider}:health`

Check provider server health.

**Input:** None

**Output:**
```typescript
{
  checkedAt: string    // ISO timestamp
  servers: Array<{
    id: string
    status: 'working' | 'down'
    detail: string
  }>
}
```

---

## Storage

### `storage:get-bootstrap`

Load the full app state snapshot. Called on app startup.

**Input:** None

**Output:**
```typescript
{
  allTracks: PersistedTrack[]
  playlists: PersistedPlaylist[]
  bookmarkedPlaylistIds: string[]
  autoDownloadPlaylistIds: string[]
  albumLockedPlaylistIds: string[]
  downloadedTrackIds: string[]
  logs: PersistedLog[]
  preferredServerId: string
  automaticUpdateCheckEnabled: boolean
  storageCapacityMb: number
  storageDebugMessage: string
  storageDebugTone: 'info' | 'warning'
}
```

### `storage:save-snapshot`

Persist the current app state. Called on state changes.

**Input:**
```typescript
{
  allTracks: PersistedTrack[]
  playlists: PersistedPlaylist[]
  bookmarkedPlaylistIds: string[]
  autoDownloadPlaylistIds: string[]
  albumLockedPlaylistIds: string[]
  downloadedTrackIds: string[]
  logs: PersistedLog[]
  preferredServerId: string
  automaticUpdateCheckEnabled: boolean
  storageCapacityMb: number
}
```

**Output:**
```typescript
{ ok: true }
```

---

## Downloads

### `downloads:start`

Start downloading a track.

**Input:**
```typescript
{
  trackId: string           // Format: "{provider}:{sourceTrackId}"
  storageCapacityMb: number // Max storage in MB
  trackTitle?: string       // For filename
  trackArtist?: string      // For filename
}
```

**Output:**
```typescript
{
  status: 'downloaded' | 'already-downloaded'
  sourceServerId?: string
  fileSizeBytes?: number
}
```

**Errors:**
- `"Track ID is required."`
- `"This track is already downloading."`
- `"Track is not stream-ready yet."`
- `"Storage capacity reached. Clear downloads or increase capacity."`

### `downloads:delete`

Delete a downloaded track.

**Input:**
```typescript
{
  trackId: string
}
```

**Output:**
```typescript
{ ok: true }
```

### `downloads:delete-many`

Delete multiple downloaded tracks.

**Input:**
```typescript
{
  trackIds: string[]
}
```

**Output:**
```typescript
{ ok: true }
```

### `downloads:clear`

Delete all downloaded tracks.

**Input:** None

**Output:**
```typescript
{ ok: true }
```

### `downloads:get-local-stream`

Get a local stream URL for a downloaded track.

**Input:**
```typescript
{
  trackId: string
}
```

**Output:**
```typescript
{
  exists: boolean
  url?: string    // Format: "kaizer-local://track/{encodedTrackId}"
}
```

### `downloads:cancel-active`

Cancel an active download.

**Input:**
```typescript
{
  trackId?: string    // If omitted, cancels all active downloads
}
```

**Output:**
```typescript
{ ok: true }
```

---

## Media Cache

### `media-cache:cache-image`

Cache a remote image locally.

**Input:**
```typescript
{
  cacheKey: string    // Cache key for filename
  imageUrl: string    // Remote image URL
}
```

**Output:**
```typescript
{
  cachedUrl: string | null    // Format: "kaizer-media://image/{encodedFileName}"
}
```

**Errors:**
- Only HTTP(S) URLs are allowed
- Only supported image content types (JPEG, PNG, WebP, GIF, SVG, AVIF)

---

## Lyrics

### `lyrics:get`

Fetch lyrics from LRCLIB.

**Input:**
```typescript
{
  artistName: string    // Artist name (required)
  trackName: string     // Track name (required)
  albumName?: string    // Album name (optional, improves matching)
}
```

**Output:**
```typescript
{
  found: boolean
  plainLyrics: string
  syncedLyrics: string      // LRC format
  instrumental: boolean
}
```

**Timeout:** 15 seconds

---

## Updates

### `updates:check`

Check for app updates.

**Input:** None

**Output:**
```typescript
{
  mode: 'manual-gated' | 'auto-updater'
  required: boolean
  updateAvailable: boolean
  currentVersion: string
  latestVersion: string | null
  releaseUrl: string | null
  message: string
}
```

**Behavior:**
- Linux/Windows: Manual gate check via GitHub API
- macOS: Auto-updater via electron-updater
- Disabled in development builds
- Disabled for private test builds

### `updates:get-required-action`

Get update requirement (manual gate mode).

**Input:** None

**Output:**
```typescript
{
  required: boolean
  currentVersion: string
  latestVersion: string | null
  releaseUrl: string | null
  packageLabel: '.deb' | '.exe' | 'release asset'
  reason?: string
}
```

### `updates:open-release-url`

Open a release URL in the default browser.

**Input:**
```typescript
{
  url: string    // Must be HTTPS
}
```

**Output:**
```typescript
{ ok: true }
```

---

## Backup

### `backup:export`

Export app data to a backup archive.

**Input:**
```typescript
{
  scope: 'data-only' | 'data-with-images' | 'data-with-images-and-tracks'
}
```

**Output:**
```typescript
{
  canceled: boolean
  filePath?: string
  message: string
  warnings: string[]
  exportedImageCount: number
  exportedDownloadCount: number
}
```

**Scopes:**
- `data-only`: Snapshot JSON only
- `data-with-images`: Snapshot + cached images
- `data-with-images-and-tracks`: Snapshot + images + downloaded tracks

**Archive structure:**
```
manifest.json
snapshot.json
assets/
  media-cache/     # Cached cover art
  downloads/       # Downloaded tracks
```

### `backup:import`

Import app data from a backup archive.

**Input:** None (opens file dialog)

**Output:**
```typescript
{
  canceled: boolean
  filePath?: string
  message: string
  warnings: string[]
  restoredImageCount: number
  restoredDownloadCount: number
  mergedTrackCount: number
  mergedPlaylistCount: number
}
```

**Behavior:**
- Validates backup format version
- Merges imported data with existing data (by ID)
- Drops references to missing local assets
- Reports warnings for skipped items

### `backup:get-status`

Get current backup operation status.

**Input:** None

**Output:**
```typescript
{
  status: 'idle' | 'exporting' | 'importing'
}
```

---

## Preload Utilities

### `send(channel, payload?)`

Generic IPC invoke wrapper.

```typescript
import { send } from '@app/preload'

const result = await send('channel:action', { data: 'value' })
```

### `sha256sum(data)`

Compute SHA-256 hash.

```typescript
import { sha256sum } from '@app/preload'

const hash = sha256sum('hello')
```

### `versions`

Get Node.js and Chrome versions.

```typescript
import { versions } from '@app/preload'

console.log(versions) // { node: '...', chrome: '...', electron: '...' }
```
