import {DEFAULT_SERVER_USER_AGENT} from '../shared/httpHeaders.js';

const ORION_API_VERSION = '1.0';
const REQUEST_TIMEOUT_MS = 10_000;

type OrionSourceId = 'orion-main';

type OrionHttpSource = {
  id: OrionSourceId;
  baseUrl: string;
};

const ORION_SOURCE: OrionHttpSource = {
  id: 'orion-main',
  baseUrl: 'https://qobuz.squid.wtf/api',
};

type OrionSearchInput = {
  query: string;
  offset?: number;
  type?: string;
};

type OrionAlbumInput = {
  albumId: string;
};

type OrionStreamInput = {
  trackId: string;
};

type OrionTrack = {
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

type OrionSearchResult = {
  version: string;
  sourceServerId: OrionSourceId;
  fallbackUsed: boolean;
  data: {
    items: OrionTrack[];
    totalNumberOfItems: number;
  };
};

type OrionAlbumTrack = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  isHiRes: boolean;
};

type OrionAlbumResult = {
  version: string;
  sourceServerId: OrionSourceId;
  fallbackUsed: boolean;
  data: {
    id: string;
    title: string;
    artist: string;
    coverUrl?: string;
    releaseDate?: string;
    trackCount: number;
    tracks: OrionAlbumTrack[];
  };
};

type OrionStreamResult = {
  version: string;
  sourceServerId: OrionSourceId;
  fallbackUsed: boolean;
  data: {
    url: string;
  };
};

type OrionHealthResult = {
  checkedAt: string;
  servers: Array<{
    id: OrionSourceId;
    status: 'working' | 'down';
    detail: string;
  }>;
};

class OrionError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'OrionError';
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

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unexpected Orion error.';
}

function readImageUrl(record: Record<string, unknown>, key: string): string | undefined {
  const image = record[key];
  if (!isRecord(image)) {
    return undefined;
  }

  for (const imageKey of ['large', 'small', 'thumbnail', 'medium']) {
    const imageUrl = readString(image, imageKey);
    if (imageUrl) {
      return imageUrl;
    }
  }

  return undefined;
}

function readHiRes(record: Record<string, unknown>): boolean {
  return readBoolean(record, 'hires') || readBoolean(record, 'hires_streamable');
}

function normalizeSearchInput(input: OrionSearchInput): {query: string; offset: number} {
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) {
    throw new OrionError(400, 'Search query is required.');
  }

  const offset = Number.isFinite(input.offset)
    ? Math.max(0, Math.floor(input.offset as number))
    : 0;

  return {query, offset};
}

function normalizeAlbumInput(input: OrionAlbumInput): {albumId: string} {
  const albumId = typeof input.albumId === 'string' ? input.albumId.trim() : '';

  if (!albumId) {
    throw new OrionError(400, 'Album id is required.');
  }

  return {albumId};
}

function normalizeStreamInput(input: OrionStreamInput): {trackId: string} {
  const trackId = typeof input.trackId === 'string' ? input.trackId.trim() : '';

  if (!trackId) {
    throw new OrionError(400, 'Track id is required.');
  }

  return {trackId};
}

function readPayloadData(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload.data;
  if (isRecord(data)) {
    return data;
  }

  throw new OrionError(502, 'Orion returned an invalid data payload.');
}

export class OrionService {
  async searchTracks(rawInput: OrionSearchInput): Promise<OrionSearchResult> {
    const input = normalizeSearchInput(rawInput);
    const payload = await this.#fetchJson('/get-music', {
      q: input.query,
      offset: String(input.offset),
    });
    const data = readPayloadData(payload);
    const tracksContainer = isRecord(data.tracks) ? data.tracks : {};
    const trackItems = Array.isArray(tracksContainer.items) ? tracksContainer.items : [];

    const tracks = trackItems.map((rawTrack, index): OrionTrack => {
      const track = isRecord(rawTrack) ? rawTrack : {};
      const performer = isRecord(track.performer) ? track.performer : {};
      const album = isRecord(track.album) ? track.album : {};
      const sourceTrackId = readId(track, 'id') || `unknown-${index + 1}`;
      const durationSeconds = readNumber(track, 'duration');

      return {
        id: `orion:${sourceTrackId}`,
        title: readString(track, 'title') || 'Unknown title',
        artist: readString(performer, 'name') || 'Unknown artist',
        album: readString(album, 'title') || 'Unknown album',
        albumId: readId(album, 'id') || undefined,
        sourceServerId: ORION_SOURCE.id,
        isHiRes: readHiRes(track),
        duration: formatDuration(durationSeconds),
        sizeMb: Math.max(3, Math.round(durationSeconds / 32) || 8),
        coverTone: createCoverTone(sourceTrackId),
        coverUrl: readImageUrl(album, 'image'),
      };
    });

    const total = readNumber(tracksContainer, 'total');

    return {
      version: ORION_API_VERSION,
      sourceServerId: ORION_SOURCE.id,
      fallbackUsed: false,
      data: {
        items: tracks,
        totalNumberOfItems: total > 0 ? total : tracks.length,
      },
    };
  }

  async getAlbum(rawInput: OrionAlbumInput): Promise<OrionAlbumResult> {
    const input = normalizeAlbumInput(rawInput);
    const payload = await this.#fetchJson('/get-album', {
      album_id: input.albumId,
    });
    const rawAlbum = readPayloadData(payload);
    const albumArtist = isRecord(rawAlbum.artist) ? rawAlbum.artist : {};
    const albumArtistName = readString(albumArtist, 'name') || 'Unknown artist';
    const tracksContainer = isRecord(rawAlbum.tracks) ? rawAlbum.tracks : {};
    const trackItems = Array.isArray(tracksContainer.items) ? tracksContainer.items : [];

    const tracks = trackItems.map((rawTrack, index): OrionAlbumTrack => {
      const track = isRecord(rawTrack) ? rawTrack : {};
      const performer = isRecord(track.performer) ? track.performer : {};
      const sourceTrackId = readId(track, 'id');

      return {
        id: sourceTrackId || `orion-album-track-${index + 1}`,
        title: readString(track, 'title') || 'Unknown track',
        artist: readString(performer, 'name') || albumArtistName,
        duration: formatDuration(readNumber(track, 'duration')),
        isHiRes: readHiRes(track),
      };
    });

    const trackCount = readNumber(rawAlbum, 'tracks_count');

    return {
      version: ORION_API_VERSION,
      sourceServerId: ORION_SOURCE.id,
      fallbackUsed: false,
      data: {
        id: readId(rawAlbum, 'id') || input.albumId,
        title: readString(rawAlbum, 'title') || 'Unknown album',
        artist: albumArtistName,
        coverUrl: readImageUrl(rawAlbum, 'image'),
        releaseDate: readString(rawAlbum, 'release_date_original') || undefined,
        trackCount: trackCount > 0 ? trackCount : tracks.length,
        tracks,
      },
    };
  }

  async getStream(rawInput: OrionStreamInput): Promise<OrionStreamResult> {
    const input = normalizeStreamInput(rawInput);
    const payload = await this.#fetchJson('/download-music', {
      track_id: input.trackId,
      quality: '27',
    });
    const data = readPayloadData(payload);
    const streamUrl = readString(data, 'url');

    if (!streamUrl) {
      throw new OrionError(502, 'Orion returned an invalid stream URL.');
    }

    return {
      version: ORION_API_VERSION,
      sourceServerId: ORION_SOURCE.id,
      fallbackUsed: false,
      data: {
        url: streamUrl,
      },
    };
  }

  async healthCheck(): Promise<OrionHealthResult> {
    try {
      await this.#ping('/changelog');

      return {
        checkedAt: new Date().toISOString(),
        servers: [
          {
            id: ORION_SOURCE.id,
            status: 'working',
            detail: 'Changelog endpoint reachable.',
          },
        ],
      };
    } catch (error) {
      return {
        checkedAt: new Date().toISOString(),
        servers: [
          {
            id: ORION_SOURCE.id,
            status: 'down',
            detail: toErrorMessage(error),
          },
        ],
      };
    }
  }

  async #ping(endpointPath: string): Promise<void> {
    const url = new URL(endpointPath.replace(/^\/+/, ''), `${ORION_SOURCE.baseUrl}/`);

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
      throw new OrionError(503, `orion-main request failed: ${toErrorMessage(error)}`);
    }

    if (!response.ok) {
      throw new OrionError(response.status, `orion-main returned ${response.status}.`);
    }
  }

  async #fetchJson(
    endpointPath: string,
    params?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const url = new URL(endpointPath.replace(/^\/+/, ''), `${ORION_SOURCE.baseUrl}/`);

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
      throw new OrionError(503, `orion-main request failed: ${toErrorMessage(error)}`);
    }

    if (!response.ok) {
      throw new OrionError(response.status, `orion-main returned ${response.status}.`);
    }

    const payload = (await response.json()) as unknown;
    if (!isRecord(payload)) {
      throw new OrionError(502, 'orion-main returned an invalid JSON payload.');
    }

    const success = payload.success;
    if (success === false) {
      throw new OrionError(502, 'orion-main returned success=false.');
    }

    return payload;
  }
}

export const orionService = new OrionService();
