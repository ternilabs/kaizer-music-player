import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {extname, join} from 'node:path';
import {ipcMain, protocol} from 'electron';
import type {AppModule} from '../AppModule.js';
import type {ModuleContext} from '../ModuleContext.js';

const MEDIA_CACHE_DIRECTORY_NAME = 'media-cache';
const MEDIA_CACHE_SCHEME = 'kaizer-media';
const MEDIA_CACHE_HOST = 'image';
const MEDIA_CACHE_TIMEOUT_MS = 20_000;

type RawCacheImageInput = {
  cacheKey?: unknown;
  imageUrl?: unknown;
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_CACHE_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toCacheImageInput(rawInput: unknown): {cacheKey: string; imageUrl: string} {
  const input = (rawInput ?? {}) as RawCacheImageInput;

  return {
    cacheKey: toStringValue(input.cacheKey),
    imageUrl: toStringValue(input.imageUrl),
  };
}

function sanitizeCacheKey(cacheKey: string): string {
  return cacheKey.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-').slice(0, 80) || 'media';
}

function extensionFromMimeType(contentType: string): string {
  const normalizedContentType = contentType.toLowerCase().split(';')[0].trim();

  if (normalizedContentType === 'image/jpeg' || normalizedContentType === 'image/jpg') {
    return '.jpg';
  }

  if (normalizedContentType === 'image/png') {
    return '.png';
  }

  if (normalizedContentType === 'image/webp') {
    return '.webp';
  }

  if (normalizedContentType === 'image/gif') {
    return '.gif';
  }

  if (normalizedContentType === 'image/svg+xml') {
    return '.svg';
  }

  if (normalizedContentType === 'image/avif') {
    return '.avif';
  }

  return '';
}

function isSupportedImageContentType(contentType: string): boolean {
  return extensionFromMimeType(contentType).length > 0;
}

function inferFileExtension(imageUrl: string, contentType: string): string {
  const extensionFromMime = extensionFromMimeType(contentType);
  if (extensionFromMime) {
    return extensionFromMime;
  }

  try {
    const parsedUrl = new URL(imageUrl);
    const pathnameExtension = extname(parsedUrl.pathname).toLowerCase();
    if (pathnameExtension) {
      return pathnameExtension;
    }
  } catch {
    // Ignore invalid URL parsing here. Fetch will surface the real issue.
  }

  return '.img';
}

function mimeTypeFromExtension(fileName: string): string {
  const extension = extname(fileName).toLowerCase();

  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }

  if (extension === '.png') {
    return 'image/png';
  }

  if (extension === '.webp') {
    return 'image/webp';
  }

  if (extension === '.gif') {
    return 'image/gif';
  }

  if (extension === '.svg') {
    return 'image/svg+xml';
  }

  if (extension === '.avif') {
    return 'image/avif';
  }

  return 'application/octet-stream';
}

class MediaCacheIpcModule implements AppModule {
  #mediaCacheDirectoryPath = '';
  #protocolRegistered = false;

  async enable({app}: ModuleContext): Promise<void> {
    await app.whenReady();

    this.#mediaCacheDirectoryPath = join(app.getPath('userData'), MEDIA_CACHE_DIRECTORY_NAME);
    await mkdir(this.#mediaCacheDirectoryPath, {recursive: true});

    if (!this.#protocolRegistered) {
      protocol.handle(MEDIA_CACHE_SCHEME, async (request) => {
        return this.#handleMediaRequest(request);
      });
      this.#protocolRegistered = true;
    }

    ipcMain.removeHandler('media-cache:cache-image');
    ipcMain.handle('media-cache:cache-image', async (_event, rawInput: unknown) => {
      return this.#cacheImage(rawInput);
    });
  }

  async #cacheImage(rawInput: unknown): Promise<{cachedUrl: string | null}> {
    const input = toCacheImageInput(rawInput);
    if (!input.cacheKey || !input.imageUrl) {
      return {cachedUrl: null};
    }

    if (input.imageUrl.startsWith(`${MEDIA_CACHE_SCHEME}://`)) {
      return {cachedUrl: input.imageUrl};
    }

    try {
      const parsedUrl = new URL(input.imageUrl);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        throw new Error('Only HTTP(S) media cache URLs are allowed.');
      }
    } catch (error) {
      throw error instanceof Error ? error : new Error('Invalid media cache URL.');
    }

    const response = await fetch(input.imageUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(MEDIA_CACHE_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Media cache request failed (${response.status}).`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!isSupportedImageContentType(contentType)) {
      throw new Error('Media cache only accepts supported image responses.');
    }

    const payloadBuffer = Buffer.from(await response.arrayBuffer());
    const fileExtension = inferFileExtension(input.imageUrl, contentType);
    const fileHash = createHash('sha1').update(`${input.cacheKey}:${input.imageUrl}`).digest('hex').slice(0, 12);
    const fileName = `${sanitizeCacheKey(input.cacheKey)}-${fileHash}${fileExtension}`;
    const filePath = join(this.#mediaCacheDirectoryPath, fileName);

    await writeFile(filePath, payloadBuffer);

    return {
      cachedUrl: `${MEDIA_CACHE_SCHEME}://${MEDIA_CACHE_HOST}/${encodeURIComponent(fileName)}`,
    };
  }

  async #handleMediaRequest(request: Request): Promise<Response> {
    try {
      const requestUrl = new URL(request.url);
      if (requestUrl.hostname !== MEDIA_CACHE_HOST) {
        return new Response('Unknown media cache host.', {status: 404});
      }

      const fileName = decodeURIComponent(requestUrl.pathname.slice(1));
      if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
        return new Response('Invalid media cache path.', {status: 400});
      }

      const filePath = join(this.#mediaCacheDirectoryPath, fileName);
      let payload: Buffer
      try {
        payload = await readFile(filePath)
      } catch {
        return new Response('Unable to read cached media.', {status: 404});
      }
      const headers = new Headers()
      headers.set('Content-Type', mimeTypeFromExtension(fileName));
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Content-Length', String(payload.byteLength));
      headers.set('X-Content-Type-Options', 'nosniff');

      return new Response(new Uint8Array(payload), {
        status: 200,
        headers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to read cached media.';
      return new Response(message, {status: 500});
    }
  }
}

export function mediaCacheIpcModule() {
  return new MediaCacheIpcModule();
}
