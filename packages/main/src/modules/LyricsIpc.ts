import { ipcMain } from 'electron'
import type { AppModule } from '../AppModule.js'

const LRCLIB_BASE_URL = 'https://lrclib.net/api/get'
const LRCLIB_USER_AGENT = 'Kaizer Music Player (https://github.com/TerniLabs/kaizer-music-player)'
const LRCLIB_REQUEST_TIMEOUT_MS = 15_000
const MAX_LYRICS_QUERY_FIELD_LENGTH = 160

type RawLyricsGetInput = {
  artistName?: unknown
  trackName?: unknown
  albumName?: unknown
}

type LrcLibLyricsResponse = {
  plainLyrics?: unknown
  syncedLyrics?: unknown
  instrumental?: unknown
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toLyricsGetInput(rawInput: unknown): { artistName: string; trackName: string; albumName: string } {
  const input = (rawInput ?? {}) as RawLyricsGetInput

  return {
    artistName: toStringValue(input.artistName).slice(0, MAX_LYRICS_QUERY_FIELD_LENGTH),
    trackName: toStringValue(input.trackName).slice(0, MAX_LYRICS_QUERY_FIELD_LENGTH),
    albumName: toStringValue(input.albumName).slice(0, MAX_LYRICS_QUERY_FIELD_LENGTH),
  }
}

class LyricsIpcModule implements AppModule {
  enable(): void {
    ipcMain.removeHandler('lyrics:get')
    ipcMain.handle('lyrics:get', async (_event, rawInput: unknown) => {
      return this.#getLyrics(rawInput)
    })
  }

  async #getLyrics(rawInput: unknown): Promise<{
    found: boolean
    plainLyrics: string
    syncedLyrics: string
    instrumental: boolean
  }> {
    const input = toLyricsGetInput(rawInput)

    if (!input.artistName || !input.trackName) {
      return {
        found: false,
        plainLyrics: '',
        syncedLyrics: '',
        instrumental: false,
      }
    }

    const url = new URL(LRCLIB_BASE_URL)
    url.searchParams.set('artist_name', input.artistName)
    url.searchParams.set('track_name', input.trackName)
    if (input.albumName) {
      url.searchParams.set('album_name', input.albumName)
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(LRCLIB_REQUEST_TIMEOUT_MS),
      headers: {
        'User-Agent': LRCLIB_USER_AGENT,
        Accept: 'application/json',
      },
    })

    if (response.status === 404) {
      return {
        found: false,
        plainLyrics: '',
        syncedLyrics: '',
        instrumental: false,
      }
    }

    if (!response.ok) {
      throw new Error(`Lyrics request failed with status ${response.status}.`)
    }

    const payload = await response.json() as LrcLibLyricsResponse
    const plainLyrics = toStringValue(payload.plainLyrics)
    const syncedLyrics = toStringValue(payload.syncedLyrics)
    const instrumental = payload.instrumental === true
    const found = plainLyrics.length > 0 || syncedLyrics.length > 0

    return {
      found,
      plainLyrics,
      syncedLyrics,
      instrumental,
    }
  }
}

export function lyricsIpcModule() {
  return new LyricsIpcModule()
}
