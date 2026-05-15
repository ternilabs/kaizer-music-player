import {DEFAULT_SERVER_USER_AGENT} from '../shared/httpHeaders.js';

const ATLAS_API_VERSION = '1.0';
const REQUEST_TIMEOUT_MS = 10_000;

type AtlasSourceId = 'atlas-main' | 'atlas-alt';

type AtlasHttpSource = {
  id: AtlasSourceId;
  baseUrl: string;
};

const ATLAS_SOURCES: readonly AtlasHttpSource[] = [
  {id: 'atlas-main', baseUrl: 'https://dab.yeet.su/api'},
  {id: 'atlas-alt', baseUrl: 'https://dabmusic.xyz/api'},
] as const;

type AtlasSearchInput = {
  query: string;
  offset?: number;
  type?: string;
};

type AtlasAlbumInput = {
  albumId: string;
};

type AtlasStreamInput = {
  trackId: string;
};

type AtlasTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId?: string;
  sourceServerId?: string;
  isHiRes?: boolean;
  duration: string;
  sizeMb: number;
  coverTone: string;
  coverUrl?: string;
};

type AtlasSearchResult = {
  version: string;
  sourceServerId: AtlasSourceId;
  fallbackUsed: boolean;
  data: {
    items: AtlasTrack[];
    totalNumberOfItems: number;
  };
};

type AtlasAlbumTrack = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  isHiRes: boolean;
};

type AtlasAlbumResult = {
  version: string;
  sourceServerId: AtlasSourceId;
  fallbackUsed: boolean;
  data: {
    id: string;
    title: string;
    artist: string;
    coverUrl?: string;
    releaseDate?: string;
    trackCount: number;
    tracks: AtlasAlbumTrack[];
  };
};

type AtlasStreamResult = {
  version: string;
  sourceServerId: AtlasSourceId;
  fallbackUsed: boolean;
  data: {
    url: string;
  };
};

type AtlasHealthResult = {
  checkedAt: string;
  servers: Array<{
    id: AtlasSourceId;
    status: 'working' | 'down';
    detail: string;
  }>;
};

class AtlasError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'AtlasError';
    this.statusCode = statusCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readId(record: Record<string, unknown>, key: string): string {
  const rawValue = record[key];
  if (typeof rawValue === 'string') {
    return rawValue.trim();
  }

  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return String(rawValue);
  }

  return '';
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function createCoverTone(seed: string): string {
  const tones = [
    'from-zinc-700 to-zinc-900',
    'from-slate-700 to-slate-900',
    'from-neutral-700 to-neutral-900',
    'from-stone-700 to-stone-900',
    'from-gray-700 to-gray-900',
  ] as const;

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }

  return tones[Math.abs(hash) % tones.length];
}

function readCoverUrl(record: Record<string, unknown>): string | undefined {
  const directCover = readString(record, 'albumCover');
  if (directCover) {
    return directCover;
  }

  const images = record.images;
  if (!isRecord(images)) {
    return undefined;
  }

  for (const key of ['large', 'small', 'thumbnail', 'medium']) {
    const imageUrl = readString(images, key);
    if (imageUrl) {
      return imageUrl;
    }
  }

  return undefined;
}

function readIsHiRes(record: Record<string, unknown>): boolean {
  const audioQuality = record.audioQuality;
  if (!isRecord(audioQuality)) {
    return false;
  }

  return audioQuality.isHiRes === true;
}

function normalizeSearchInput(input: AtlasSearchInput): {query: string; offset: number; type: string} {
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) {
    throw new AtlasError(400, 'Search query is required.');
  }

  const offset = Number.isFinite(input.offset)
    ? Math.max(0, Math.floor(input.offset as number))
    : 0;

  const type = typeof input.type === 'string' && input.type.trim()
    ? input.type.trim()
    : 'track';

  return {query, offset, type};
}

function normalizeAlbumInput(input: AtlasAlbumInput): {albumId: string} {
  const albumId = typeof input.albumId === 'string' ? input.albumId.trim() : '';

  if (!albumId) {
    throw new AtlasError(400, 'Album id is required.');
  }

  return {albumId};
}

function normalizeStreamInput(input: AtlasStreamInput): {trackId: string} {
  const trackId = typeof input.trackId === 'string' ? input.trackId.trim() : '';

  if (!trackId) {
    throw new AtlasError(400, 'Track id is required.');
  }

  return {trackId};
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unexpected Atlas error.';
}

export class AtlasService {
  async searchTracks(rawInput: AtlasSearchInput): Promise<AtlasSearchResult> {
    const input = normalizeSearchInput(rawInput);

    const {source, payload} = await this.#requestWithFallback((candidateSource) => {
      return this.#searchWithSource(candidateSource, input);
    });

    const tracksPayload = Array.isArray(payload.tracks) ? payload.tracks : [];

    const tracks = tracksPayload.map((rawTrack): AtlasTrack => {
      const track = isRecord(rawTrack) ? rawTrack : {};
      const sourceTrackId = readId(track, 'id') || '0';
      const durationSeconds = readNumber(track, 'duration');

      return {
        id: `atlas:${sourceTrackId}`,
        title: readString(track, 'title') || 'Unknown title',
        artist: readString(track, 'artist') || 'Unknown artist',
        album: readString(track, 'albumTitle') || 'Unknown album',
        albumId: readId(track, 'albumId') || undefined,
        sourceServerId: source.id,
        isHiRes: readIsHiRes(track),
        duration: formatDuration(durationSeconds),
        sizeMb: Math.max(3, Math.round(durationSeconds / 32) || 8),
        coverTone: createCoverTone(String(sourceTrackId)),
        coverUrl: readCoverUrl(track),
      };
    });

    const pagination = isRecord(payload.pagination) ? payload.pagination : null;
    const total = pagination ? readNumber(pagination, 'total') : 0;

    return {
      version: ATLAS_API_VERSION,
      sourceServerId: source.id,
      fallbackUsed: source.id !== 'atlas-main',
      data: {
        items: tracks,
        totalNumberOfItems: total > 0 ? total : tracks.length,
      },
    };
  }

  async getAlbum(rawInput: AtlasAlbumInput): Promise<AtlasAlbumResult> {
    const input = normalizeAlbumInput(rawInput);

    const {source, payload} = await this.#requestWithFallback((candidateSource) => {
      return this.#albumWithSource(candidateSource, input);
    });

    const rawAlbum = payload.album;
    if (!isRecord(rawAlbum)) {
      throw new AtlasError(502, `${source.id} returned an invalid album payload.`);
    }

    const rawTracks = Array.isArray(rawAlbum.tracks) ? rawAlbum.tracks : [];
    const tracks = rawTracks.map((rawTrack, index): AtlasAlbumTrack => {
      const track = isRecord(rawTrack) ? rawTrack : {};
      const trackId = readId(track, 'id');

      return {
        id: trackId || `atlas-album-track-${index + 1}`,
        title: readString(track, 'title') || 'Unknown track',
        artist: readString(track, 'artist') || readString(rawAlbum, 'artist') || 'Unknown artist',
        duration: formatDuration(readNumber(track, 'duration')),
        isHiRes: readIsHiRes(track),
      };
    });

    const albumCover = readString(rawAlbum, 'cover');
    const albumTrackCount = readNumber(rawAlbum, 'trackCount');

    return {
      version: ATLAS_API_VERSION,
      sourceServerId: source.id,
      fallbackUsed: source.id !== 'atlas-main',
      data: {
        id: readId(rawAlbum, 'id') || input.albumId,
        title: readString(rawAlbum, 'title') || 'Unknown album',
        artist: readString(rawAlbum, 'artist') || 'Unknown artist',
        coverUrl: albumCover || undefined,
        releaseDate: readString(rawAlbum, 'releaseDate') || undefined,
        trackCount: albumTrackCount > 0 ? albumTrackCount : tracks.length,
        tracks,
      },
    };
  }

  async getStream(rawInput: AtlasStreamInput): Promise<AtlasStreamResult> {
    const input = normalizeStreamInput(rawInput);

    const {source, payload} = await this.#requestWithFallback((candidateSource) => {
      return this.#streamWithSource(candidateSource, input);
    });

    const streamUrl = readString(payload, 'url');
    if (!streamUrl) {
      throw new AtlasError(502, `${source.id} returned an invalid stream URL.`);
    }

    return {
      version: ATLAS_API_VERSION,
      sourceServerId: source.id,
      fallbackUsed: source.id !== 'atlas-main',
      data: {
        url: streamUrl,
      },
    };
  }

  async healthCheck(): Promise<AtlasHealthResult> {
    const servers = await Promise.all(ATLAS_SOURCES.map(async (source) => {
      try {
        const payload = await this.#fetchJson(source, '/version');
        const version = readString(payload, 'version') || 'unknown';

        return {
          id: source.id,
          status: 'working' as const,
          detail: `Version ${version}`,
        };
      } catch (error) {
        return {
          id: source.id,
          status: 'down' as const,
          detail: toErrorMessage(error),
        };
      }
    }));

    return {
      checkedAt: new Date().toISOString(),
      servers,
    };
  }

  async #requestWithFallback<T>(
    request: (source: AtlasHttpSource) => Promise<T>,
  ): Promise<{source: AtlasHttpSource; payload: T}> {
    const failures: string[] = [];

    for (const source of ATLAS_SOURCES) {
      try {
        const payload = await request(source);
        return {source, payload};
      } catch (error) {
        failures.push(`${source.id}: ${toErrorMessage(error)}`);
      }
    }

    throw new AtlasError(503, `All Atlas fallbacks failed. ${failures.join(' | ')}`);
  }

  async #searchWithSource(source: AtlasHttpSource, input: {query: string; offset: number; type: string}) {
    return this.#fetchJson(source, '/search', {
      q: input.query,
      offset: String(input.offset),
      type: input.type,
    });
  }

  async #albumWithSource(source: AtlasHttpSource, input: {albumId: string}) {
    return this.#fetchJson(source, '/album', {
      albumId: input.albumId,
    });
  }

  async #streamWithSource(source: AtlasHttpSource, input: {trackId: string}) {
    return this.#fetchJson(source, '/stream', {
      trackId: input.trackId,
    });
  }

  async #fetchJson(
    source: AtlasHttpSource,
    endpointPath: string,
    params?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const url = new URL(endpointPath.replace(/^\/+/, ''), `${source.baseUrl}/`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': DEFAULT_SERVER_USER_AGENT,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AtlasError(503, `${source.id} request failed: ${toErrorMessage(error)}`);
    }

    if (!response.ok) {
      throw new AtlasError(response.status, `${source.id} returned ${response.status}.`);
    }

    const payload = (await response.json()) as unknown;
    if (!isRecord(payload)) {
      throw new AtlasError(502, `${source.id} returned an invalid JSON payload.`);
    }

    return payload;
  }
}

export const atlasService = new AtlasService();
