import {DEFAULT_SERVER_USER_AGENT} from '../shared/httpHeaders.js';

const HELIOS_API_VERSION = '1.0';
const REQUEST_TIMEOUT_MS = 10_000;

type HeliosSourceId =
  | 'helios-main'
  | 'helios-alt-01'
  | 'helios-alt-02'
  | 'helios-alt-03'
  | 'helios-alt-04'
  | 'helios-alt-05'
  | 'helios-alt-06'

type HeliosHttpSource = {
  id: HeliosSourceId;
  baseUrl: string;
};

const HELIOS_SOURCES: readonly HeliosHttpSource[] = [
  {id: 'helios-main', baseUrl: 'https://api.monochrome.tf/'},
  {id: 'helios-alt-01', baseUrl: 'https://ohio-1.monochrome.tf/'},
  {id: 'helios-alt-02', baseUrl: 'https://singapore-1.monochrome.tf/'},
  {id: 'helios-alt-03', baseUrl: 'https://frankfurt-1.monochrome.tf/'},
  {id: 'helios-alt-04', baseUrl: 'https://hifi.p1nkhamster.xyz/'},
  {id: 'helios-alt-05', baseUrl: 'https://hifi-one.spotisaver.net/'},
  {id: 'helios-alt-06', baseUrl: 'https://hifi-two.spotisaver.net/'},
] as const;

type HeliosSearchInput = {
  query: string;
  offset?: number;
  type?: string;
};

type HeliosAlbumInput = {
  albumId: string;
};

type HeliosStreamInput = {
  trackId: string;
  quality?: string;
};

type HeliosTrack = {
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

type HeliosSearchResult = {
  version: string;
  sourceServerId: HeliosSourceId;
  fallbackUsed: boolean;
  data: {
    items: HeliosTrack[];
    totalNumberOfItems: number;
  };
};

type HeliosAlbumTrack = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  isHiRes: boolean;
};

type HeliosAlbumResult = {
  version: string;
  sourceServerId: HeliosSourceId;
  fallbackUsed: boolean;
  data: {
    id: string;
    title: string;
    artist: string;
    coverUrl?: string;
    releaseDate?: string;
    trackCount: number;
    tracks: HeliosAlbumTrack[];
  };
};

type HeliosStreamResult = {
  version: string;
  sourceServerId: HeliosSourceId;
  fallbackUsed: boolean;
  data: {
    url: string;
  };
};

type HeliosHealthResult = {
  checkedAt: string;
  servers: Array<{
    id: HeliosSourceId;
    status: 'working' | 'down';
    detail: string;
  }>;
};

class HeliosError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HeliosError';
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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unexpected Helios error.';
}

function normalizeSearchInput(input: HeliosSearchInput): {query: string} {
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) {
    throw new HeliosError(400, 'Search query is required.');
  }

  return {query};
}

function normalizeAlbumInput(input: HeliosAlbumInput): {albumId: string} {
  const albumId = typeof input.albumId === 'string' ? input.albumId.trim() : '';

  if (!albumId) {
    throw new HeliosError(400, 'Album id is required.');
  }

  return {albumId};
}

function normalizeStreamInput(input: HeliosStreamInput): {trackId: string; quality: string} {
  const trackId = typeof input.trackId === 'string' ? input.trackId.trim() : '';

  if (!trackId) {
    throw new HeliosError(400, 'Track id is required.');
  }

  const quality = typeof input.quality === 'string' && input.quality.trim()
    ? input.quality.trim()
    : 'LOSSLESS';

  return {trackId, quality};
}

function readPayloadData(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload.data;
  if (isRecord(data)) {
    return data;
  }

  throw new HeliosError(502, 'Helios returned an invalid data payload.');
}

function readIsHiRes(record: Record<string, unknown>): boolean {
  const audioQuality = readString(record, 'audioQuality').toUpperCase();
  if (audioQuality.includes('HI')) {
    return true;
  }

  const mediaMetadata = record.mediaMetadata;
  if (!isRecord(mediaMetadata)) {
    return false;
  }

  const tags = mediaMetadata.tags;
  if (!Array.isArray(tags)) {
    return false;
  }

  return tags.some((tag) => {
    if (typeof tag !== 'string') {
      return false;
    }

    const normalizedTag = tag.toUpperCase();
    return normalizedTag.includes('HIRES') || normalizedTag.includes('HI_RES');
  });
}

function buildCoverUrl(coverId: string): string | undefined {
  const normalizedCover = coverId.trim();
  if (!normalizedCover) {
    return undefined;
  }

  if (normalizedCover.startsWith('http://') || normalizedCover.startsWith('https://')) {
    return normalizedCover;
  }

  return `https://resources.tidal.com/images/${normalizedCover.replaceAll('-', '/')}/640x640.jpg`;
}

function decodeBase64(value: string): string {
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    throw new HeliosError(502, 'Helios returned an invalid stream manifest.');
  }
}

function readManifestUrl(manifestBase64: string): string {
  const decodedManifest = decodeBase64(manifestBase64);

  let parsedManifest: unknown;
  try {
    parsedManifest = JSON.parse(decodedManifest);
  } catch {
    throw new HeliosError(502, 'Helios returned a non-JSON stream manifest.');
  }

  if (!isRecord(parsedManifest)) {
    throw new HeliosError(502, 'Helios returned an invalid stream manifest payload.');
  }

  const urls = parsedManifest.urls;
  if (!Array.isArray(urls)) {
    throw new HeliosError(502, 'Helios stream manifest does not include any URL.');
  }

  const firstUrl = urls.find((entry) => typeof entry === 'string' && entry.trim());
  if (!firstUrl || typeof firstUrl !== 'string') {
    throw new HeliosError(502, 'Helios stream manifest URL is invalid.');
  }

  return firstUrl.trim();
}

export class HeliosService {
  async searchTracks(rawInput: HeliosSearchInput): Promise<HeliosSearchResult> {
    const input = normalizeSearchInput(rawInput);

    const {source, payload} = await this.#requestWithFallback((candidateSource) => {
      return this.#searchWithSource(candidateSource, input);
    });

    const data = readPayloadData(payload);
    const items = Array.isArray(data.items) ? data.items : [];
    const tracks = items.map((rawTrack, index): HeliosTrack => {
      const track = isRecord(rawTrack) ? rawTrack : {};
      const album = isRecord(track.album) ? track.album : {};
      const artist = isRecord(track.artist) ? track.artist : {};
      const sourceTrackId = readId(track, 'id') || `unknown-${index + 1}`;
      const audioQuality = readString(track, 'audioQuality') || 'LOSSLESS';
      const durationSeconds = readNumber(track, 'duration');

      return {
        id: `helios:${sourceTrackId}:${encodeURIComponent(audioQuality)}`,
        title: readString(track, 'title') || 'Unknown title',
        artist: readString(artist, 'name') || 'Unknown artist',
        album: readString(album, 'title') || 'Unknown album',
        albumId: readId(album, 'id') || undefined,
        sourceServerId: source.id,
        isHiRes: readIsHiRes(track),
        duration: formatDuration(durationSeconds),
        sizeMb: Math.max(3, Math.round(durationSeconds / 32) || 8),
        coverTone: createCoverTone(sourceTrackId),
        coverUrl: buildCoverUrl(readString(album, 'cover')),
      };
    });

    const totalNumberOfItems = readNumber(data, 'totalNumberOfItems');

    return {
      version: HELIOS_API_VERSION,
      sourceServerId: source.id,
      fallbackUsed: source.id !== 'helios-main',
      data: {
        items: tracks,
        totalNumberOfItems: totalNumberOfItems > 0 ? totalNumberOfItems : tracks.length,
      },
    };
  }

  async getAlbum(rawInput: HeliosAlbumInput): Promise<HeliosAlbumResult> {
    const input = normalizeAlbumInput(rawInput);

    const {source, payload} = await this.#requestWithFallback((candidateSource) => {
      return this.#albumWithSource(candidateSource, input);
    });

    const data = readPayloadData(payload);
    const albumArtist = isRecord(data.artist) ? data.artist : {};
    const albumArtistName = readString(albumArtist, 'name') || 'Unknown artist';
    const rawItems = Array.isArray(data.items) ? data.items : [];

    const tracks = rawItems.map((rawEntry, index): HeliosAlbumTrack => {
      const entry = isRecord(rawEntry) ? rawEntry : {};
      const track = isRecord(entry.item) ? entry.item : {};
      const sourceTrackId = readId(track, 'id');
      const trackAudioQuality = readString(track, 'audioQuality') || 'LOSSLESS';

      return {
        id: sourceTrackId
          ? `helios:${sourceTrackId}:${encodeURIComponent(trackAudioQuality)}`
          : `helios-album-track-${index + 1}`,
        title: readString(track, 'title') || 'Unknown track',
        artist: readString(isRecord(track.artist) ? track.artist : {}, 'name') || albumArtistName,
        duration: formatDuration(readNumber(track, 'duration')),
        isHiRes: readIsHiRes(track),
      };
    });

    const trackCount = readNumber(data, 'numberOfTracks');

    return {
      version: HELIOS_API_VERSION,
      sourceServerId: source.id,
      fallbackUsed: source.id !== 'helios-main',
      data: {
        id: readId(data, 'id') || input.albumId,
        title: readString(data, 'title') || 'Unknown album',
        artist: albumArtistName,
        coverUrl: buildCoverUrl(readString(data, 'cover')),
        releaseDate: readString(data, 'releaseDate') || undefined,
        trackCount: trackCount > 0 ? trackCount : tracks.length,
        tracks,
      },
    };
  }

  async getStream(rawInput: HeliosStreamInput): Promise<HeliosStreamResult> {
    const input = normalizeStreamInput(rawInput);

    const {source, payload} = await this.#requestWithFallback((candidateSource) => {
      return this.#streamWithSource(candidateSource, input);
    });

    const data = readPayloadData(payload);
    const manifest = readString(data, 'manifest');
    const streamUrl = manifest
      ? readManifestUrl(manifest)
      : readString(data, 'url');

    if (!streamUrl) {
      throw new HeliosError(502, `${source.id} returned an invalid stream URL.`);
    }

    return {
      version: HELIOS_API_VERSION,
      sourceServerId: source.id,
      fallbackUsed: source.id !== 'helios-main',
      data: {
        url: streamUrl,
      },
    };
  }

  async healthCheck(): Promise<HeliosHealthResult> {
    const servers = await Promise.all(HELIOS_SOURCES.map(async (source) => {
      try {
        const payload = await this.#searchWithSource(source, {query: 'hello'});
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
    request: (source: HeliosHttpSource) => Promise<T>,
  ): Promise<{source: HeliosHttpSource; payload: T}> {
    const failures: string[] = [];

    for (const source of HELIOS_SOURCES) {
      try {
        const payload = await request(source);
        return {source, payload};
      } catch (error) {
        failures.push(`${source.id}: ${toErrorMessage(error)}`);
      }
    }

    throw new HeliosError(503, `All Helios endpoints failed. ${failures.join(' | ')}`);
  }

  async #searchWithSource(source: HeliosHttpSource, input: {query: string}) {
    return this.#fetchJson(source, '/search/', {
      s: input.query,
    });
  }

  async #albumWithSource(source: HeliosHttpSource, input: {albumId: string}) {
    return this.#fetchJson(source, '/album/', {
      id: input.albumId,
    });
  }

  async #streamWithSource(source: HeliosHttpSource, input: {trackId: string; quality: string}) {
    return this.#fetchJson(source, '/track/', {
      id: input.trackId,
      quality: input.quality,
    });
  }

  async #fetchJson(
    source: HeliosHttpSource,
    endpointPath: string,
    params?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const url = new URL(endpointPath.replace(/^\/+/, ''), source.baseUrl);

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
      throw new HeliosError(503, `${source.id} request failed: ${toErrorMessage(error)}`);
    }

    if (!response.ok) {
      throw new HeliosError(response.status, `${source.id} returned ${response.status}.`);
    }

    const payload = (await response.json()) as unknown;
    if (!isRecord(payload)) {
      throw new HeliosError(502, `${source.id} returned an invalid JSON payload.`);
    }

    return payload;
  }
}

export const heliosService = new HeliosService();
