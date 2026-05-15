import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { ipcMain, protocol } from 'electron'
import type { AppModule } from '../AppModule.js'
import type { ModuleContext } from '../ModuleContext.js'
import { atlasService } from '../atlas/AtlasService.js'
import { heliosService } from '../helios/HeliosService.js'
import { orionService } from '../orion/OrionService.js'
import { DEFAULT_SERVER_USER_AGENT } from '../shared/httpHeaders.js'

const DOWNLOADS_DIRECTORY_NAME = 'downloads'
const DOWNLOAD_REQUEST_TIMEOUT_MS = 240_000
const DOWNLOAD_FETCH_ATTEMPTS = 2
const LOCAL_STREAM_SCHEME = 'kaizer-local'
const LOCAL_STREAM_HOST = 'track'

type StreamProvider = 'atlas' | 'orion' | 'helios'

type StreamTarget =
  | { provider: 'atlas'; sourceTrackId: string }
  | { provider: 'orion'; sourceTrackId: string }
  | { provider: 'helios'; sourceTrackId: string; quality?: string }

type RawDownloadStartInput = {
  trackId?: unknown
  storageCapacityMb?: unknown
  trackTitle?: unknown
  trackArtist?: unknown
}

type RawDownloadDeleteInput = {
  trackId?: unknown
}

type RawDownloadDeleteManyInput = {
  trackIds?: unknown
}

type RawDownloadLocalStreamInput = {
  trackId?: unknown
}

type RawDownloadCancelActiveInput = {
  trackId?: unknown
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseStreamTarget(trackId: string): StreamTarget | undefined {
  if (trackId.startsWith('atlas:')) {
    const sourceTrackId = trackId.slice('atlas:'.length).trim()
    if (!sourceTrackId) {
      return undefined
    }

    return {
      provider: 'atlas',
      sourceTrackId,
    }
  }

  if (trackId.startsWith('orion:')) {
    const sourceTrackId = trackId.slice('orion:'.length).trim()
    if (!sourceTrackId) {
      return undefined
    }

    return {
      provider: 'orion',
      sourceTrackId,
    }
  }

  if (trackId.startsWith('helios:')) {
    const rawPayload = trackId.slice('helios:'.length)
    const [sourceTrackId, ...qualityParts] = rawPayload.split(':')
    const safeSourceTrackId = sourceTrackId.trim()
    if (!safeSourceTrackId) {
      return undefined
    }

    const rawQuality = qualityParts.join(':').trim()

    return {
      provider: 'helios',
      sourceTrackId: safeSourceTrackId,
      quality: rawQuality ? decodeURIComponent(rawQuality) : undefined,
    }
  }

  return undefined
}

function toDownloadStartInput(rawInput: unknown): {
  trackId: string
  storageCapacityMb: number
  trackTitle?: string
  trackArtist?: string
} {
  const input = (rawInput ?? {}) as RawDownloadStartInput
  const trackId = toStringValue(input.trackId)
  const trackTitle = toStringValue(input.trackTitle)
  const trackArtist = toStringValue(input.trackArtist)

  const rawCapacity = Number(input.storageCapacityMb)
  const storageCapacityMb = Number.isFinite(rawCapacity) && rawCapacity > 0
    ? rawCapacity
    : 30000

  return {
    trackId,
    storageCapacityMb,
    trackTitle: trackTitle || undefined,
    trackArtist: trackArtist || undefined,
  }
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_STREAM_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

function toDownloadDeleteInput(rawInput: unknown): { trackId: string } {
  const input = (rawInput ?? {}) as RawDownloadDeleteInput

  return {
    trackId: toStringValue(input.trackId),
  }
}

function toDownloadDeleteManyInput(rawInput: unknown): { trackIds: string[] } {
  const input = (rawInput ?? {}) as RawDownloadDeleteManyInput
  const rawTrackIds = Array.isArray(input.trackIds) ? input.trackIds : []
  const trackIds = rawTrackIds
    .map((trackId) => toStringValue(trackId))
    .filter((trackId, index, values) => trackId.length > 0 && values.indexOf(trackId) === index)

  return { trackIds }
}

function toDownloadLocalStreamInput(rawInput: unknown): { trackId: string } {
  const input = (rawInput ?? {}) as RawDownloadLocalStreamInput

  return {
    trackId: toStringValue(input.trackId),
  }
}

function toDownloadCancelActiveInput(rawInput: unknown): { trackId: string } {
  const input = (rawInput ?? {}) as RawDownloadCancelActiveInput

  return {
    trackId: toStringValue(input.trackId),
  }
}

function parseSingleRangeHeader(
  rangeHeader: string | null,
  fileSize: number,
): { start: number; end: number } | 'invalid' | null {
  if (!rangeHeader) {
    return null
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
  if (!match) {
    return 'invalid'
  }

  const rawStart = match[1] ?? ''
  const rawEnd = match[2] ?? ''

  if (!rawStart && !rawEnd) {
    return 'invalid'
  }

  if (!rawStart) {
    const suffixLength = Number(rawEnd)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return 'invalid'
    }

    const boundedLength = Math.min(fileSize, suffixLength)
    return {
      start: Math.max(0, fileSize - boundedLength),
      end: Math.max(0, fileSize - 1),
    }
  }

  const start = Number(rawStart)
  const end = rawEnd ? Number(rawEnd) : fileSize - 1

  if (
    !Number.isFinite(start)
    || !Number.isFinite(end)
    || start < 0
    || end < start
    || start >= fileSize
  ) {
    return 'invalid'
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  }
}

class DownloadsIpcModule implements AppModule {
  #downloadsDirectoryPath = ''
  #activeTrackDownloads = new Set<string>()
  #activeDownloadControllers = new Map<string, AbortController>()
  #localProtocolRegistered = false
  #downloadQueue: Promise<void> = Promise.resolve()

  async enable({ app }: ModuleContext): Promise<void> {
    await app.whenReady()

    this.#downloadsDirectoryPath = join(app.getPath('userData'), DOWNLOADS_DIRECTORY_NAME)
    await mkdir(this.#downloadsDirectoryPath, { recursive: true })

    if (!this.#localProtocolRegistered) {
      protocol.handle(LOCAL_STREAM_SCHEME, async (request) => {
        return this.#handleLocalStreamRequest(request)
      })
      this.#localProtocolRegistered = true
    }

    ipcMain.removeHandler('downloads:start')
    ipcMain.handle('downloads:start', async (_event, rawInput: unknown) => {
      return this.#enqueueDownload(rawInput)
    })

    ipcMain.removeHandler('downloads:delete')
    ipcMain.handle('downloads:delete', async (_event, rawInput: unknown) => {
      return this.#deleteDownload(rawInput)
    })

    ipcMain.removeHandler('downloads:delete-many')
    ipcMain.handle('downloads:delete-many', async (_event, rawInput: unknown) => {
      return this.#deleteManyDownloads(rawInput)
    })

    ipcMain.removeHandler('downloads:clear')
    ipcMain.handle('downloads:clear', async () => {
      return this.#clearDownloads()
    })

    ipcMain.removeHandler('downloads:get-local-stream')
    ipcMain.handle('downloads:get-local-stream', async (_event, rawInput: unknown) => {
      return this.#getLocalStream(rawInput)
    })

    ipcMain.removeHandler('downloads:cancel-active')
    ipcMain.handle('downloads:cancel-active', async (_event, rawInput: unknown) => {
      return this.#cancelActiveDownload(rawInput)
    })
  }

  async #startDownload(rawInput: unknown): Promise<{
    status: 'downloaded' | 'already-downloaded'
    sourceServerId?: string
    fileSizeBytes?: number
  }> {
    const input = toDownloadStartInput(rawInput)

    if (!input.trackId) {
      throw new Error('Track ID is required.')
    }

    if (this.#activeTrackDownloads.has(input.trackId)) {
      throw new Error('This track is already downloading.')
    }

    const existingTrackFilePath = await this.#findExistingTrackFilePath(input.trackId)
    if (existingTrackFilePath) {
      return {
        status: 'already-downloaded',
      }
    }

    const streamTarget = parseStreamTarget(input.trackId)
    if (!streamTarget) {
      throw new Error('Track is not stream-ready yet.')
    }

    this.#activeTrackDownloads.add(input.trackId)
    const abortController = new AbortController()
    this.#activeDownloadControllers.set(input.trackId, abortController)

    try {
      let lastError: unknown

      for (let attempt = 0; attempt < DOWNLOAD_FETCH_ATTEMPTS; attempt += 1) {
        try {
          const streamResponse = await this.#requestStream(streamTarget)
          const streamUrl = streamResponse.data.url.trim()
          if (!streamUrl) {
            throw new Error('The selected provider returned an empty stream URL.')
          }

          const response = await fetch(streamUrl, {
            method: 'GET',
            headers: this.#buildDownloadHeaders(streamTarget.provider, streamUrl),
            signal: AbortSignal.any([
              AbortSignal.timeout(DOWNLOAD_REQUEST_TIMEOUT_MS),
              abortController.signal,
            ]),
          })

          if (!response.ok) {
            throw new Error(`Download request failed with status ${response.status}.`)
          }

          const payloadBuffer = Buffer.from(await response.arrayBuffer())
          const currentUsageBytes = await this.#getCurrentUsageBytes()
          const capacityBytes = Math.floor(input.storageCapacityMb * 1024 * 1024)

          if (currentUsageBytes + payloadBuffer.byteLength > capacityBytes) {
            throw new Error('Storage capacity reached. Clear downloads or increase capacity.')
          }

          const trackFilePath = this.#flacFilePathForTrack(input.trackId, input.trackTitle, input.trackArtist)
          const temporaryFilePath = `${trackFilePath}.tmp`
          await writeFile(temporaryFilePath, payloadBuffer)
          await rename(temporaryFilePath, trackFilePath)

          return {
            status: 'downloaded',
            sourceServerId: streamResponse.sourceServerId,
            fileSizeBytes: payloadBuffer.byteLength,
          }
        } catch (error) {
          lastError = error
        }
      }

      throw lastError instanceof Error ? lastError : new Error('Download failed after retry attempts.')
    } finally {
      this.#activeTrackDownloads.delete(input.trackId)
      this.#activeDownloadControllers.delete(input.trackId)
    }
  }

  async #enqueueDownload(rawInput: unknown): Promise<{
    status: 'downloaded' | 'already-downloaded'
    sourceServerId?: string
    fileSizeBytes?: number
  }> {
    const runDownload = async () => this.#startDownload(rawInput)
    const queuedDownload = this.#downloadQueue.then(runDownload, runDownload)
    this.#downloadQueue = queuedDownload.then(() => undefined, () => undefined)
    return queuedDownload
  }

  async #deleteDownload(rawInput: unknown): Promise<{ ok: true }> {
    const input = toDownloadDeleteInput(rawInput)
    if (!input.trackId) {
      return { ok: true }
    }

    await this.#deleteTrackFiles(input.trackId)

    return { ok: true }
  }

  async #deleteManyDownloads(rawInput: unknown): Promise<{ ok: true }> {
    const input = toDownloadDeleteManyInput(rawInput)

    await Promise.all(input.trackIds.map(async (trackId) => {
      await this.#deleteTrackFiles(trackId)
    }))

    return { ok: true }
  }

  async #clearDownloads(): Promise<{ ok: true }> {
    const entries = await readdir(this.#downloadsDirectoryPath, { withFileTypes: true }).catch(() => [])

    await Promise.all(entries.map(async (entry) => {
      if (!entry.isFile()) {
        return
      }

      await unlink(join(this.#downloadsDirectoryPath, entry.name)).catch(() => undefined)
    }))

    return { ok: true }
  }

  async #requestStream(streamTarget: StreamTarget) {
    if (streamTarget.provider === 'orion') {
      return orionService.getStream({ trackId: streamTarget.sourceTrackId })
    }

    if (streamTarget.provider === 'helios') {
      return heliosService.getStream({
        trackId: streamTarget.sourceTrackId,
        quality: streamTarget.quality,
      })
    }

    return atlasService.getStream({ trackId: streamTarget.sourceTrackId })
  }

  async #getLocalStream(rawInput: unknown): Promise<{ exists: boolean; url?: string }> {
    const input = toDownloadLocalStreamInput(rawInput)
    if (!input.trackId) {
      return { exists: false }
    }

    const existingTrackFilePath = await this.#findExistingTrackFilePath(input.trackId)
    if (!existingTrackFilePath) {
      return { exists: false }
    }

    return {
      exists: true,
      url: `${LOCAL_STREAM_SCHEME}://${LOCAL_STREAM_HOST}/${encodeURIComponent(input.trackId)}`,
    }
  }

  async #cancelActiveDownload(rawInput: unknown): Promise<{ ok: true }> {
    const input = toDownloadCancelActiveInput(rawInput)

    if (input.trackId) {
      this.#activeDownloadControllers.get(input.trackId)?.abort()
      return { ok: true }
    }

    for (const controller of this.#activeDownloadControllers.values()) {
      controller.abort()
    }

    return { ok: true }
  }

  async #handleLocalStreamRequest(request: Request): Promise<Response> {
    try {
      const requestUrl = new URL(request.url)
      if (requestUrl.hostname !== LOCAL_STREAM_HOST) {
        return new Response('Unknown local stream host.', { status: 404 })
      }

      const trackId = decodeURIComponent(requestUrl.pathname.slice(1))
      if (!trackId) {
        return new Response('Track ID is required.', { status: 400 })
      }

      const existingTrackFilePath = await this.#findExistingTrackFilePath(trackId)
      if (!existingTrackFilePath) {
        return new Response('Track is not downloaded.', { status: 404 })
      }

      const fileStats = await stat(existingTrackFilePath)
      if (!fileStats.isFile()) {
        return new Response('Track is not downloaded.', { status: 404 })
      }

      const contentType = await this.#getLocalStreamMimeType(existingTrackFilePath)
      const parsedRange = parseSingleRangeHeader(request.headers.get('range'), fileStats.size)
      if (parsedRange === 'invalid') {
        const invalidRangeHeaders = new Headers()
        invalidRangeHeaders.set('Content-Range', `bytes */${fileStats.size}`)
        return new Response('Requested range is invalid.', {
          status: 416,
          headers: invalidRangeHeaders,
        })
      }

      const start = parsedRange?.start ?? 0
      const end = parsedRange?.end ?? Math.max(0, fileStats.size - 1)
      const chunkSize = Math.max(0, end - start + 1)
      const stream = createReadStream(existingTrackFilePath, { start, end })
      const headers = new Headers()
      headers.set('Content-Type', contentType)
      headers.set('Cache-Control', 'no-store')
      headers.set('Accept-Ranges', 'bytes')
      headers.set('Content-Length', String(chunkSize))

      if (parsedRange) {
        headers.set('Content-Range', `bytes ${start}-${end}/${fileStats.size}`)
      }

      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: parsedRange ? 206 : 200,
        headers,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown local stream failure.'
      return new Response(message, { status: 500 })
    }
  }

  async #getLocalStreamMimeType(filePath: string): Promise<string> {
    const fileHandle = await open(filePath, 'r')
    try {
      const header = Buffer.alloc(16)
      const { bytesRead } = await fileHandle.read(header, 0, header.length, 0)
      const bytes = header.subarray(0, bytesRead)

      if (bytes.length >= 4 && bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) {
        return 'audio/flac'
      }

      if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
        return 'audio/mpeg'
      }

      if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
        return 'audio/mpeg'
      }

      if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
        return 'audio/ogg'
      }

      if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        return 'audio/mp4'
      }

      if (
        bytes.length >= 12
        && bytes[0] === 0x52
        && bytes[1] === 0x49
        && bytes[2] === 0x46
        && bytes[3] === 0x46
        && bytes[8] === 0x57
        && bytes[9] === 0x41
        && bytes[10] === 0x56
        && bytes[11] === 0x45
      ) {
        return 'audio/wav'
      }
    } finally {
      await fileHandle.close()
    }

    return this.#getLocalStreamMimeTypeByExtension(filePath)
  }

  #sanitizeFilePart(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'track'
  }

  #flacFileName(trackId: string, trackTitle?: string, trackArtist?: string): string {
    const titlePart = this.#sanitizeFilePart(trackTitle || trackId.replace(':', '_'))
    const artistPart = this.#sanitizeFilePart(trackArtist || 'unknown_artist')
    const hash = this.#trackHash(trackId)

    return `${titlePart}__${artistPart}__${hash}.flac`
  }

  #getTrackFileSuffix(trackId: string): string {
    return `__${this.#trackHash(trackId)}`
  }

  #getLocalStreamMimeTypeByExtension(filePath: string): string {
    if (filePath.endsWith('.flac')) {
      return 'audio/flac'
    }

    if (filePath.endsWith('.mp3')) {
      return 'audio/mpeg'
    }

    if (filePath.endsWith('.m4a') || filePath.endsWith('.mp4')) {
      return 'audio/mp4'
    }

    if (filePath.endsWith('.ogg')) {
      return 'audio/ogg'
    }

    if (filePath.endsWith('.wav')) {
      return 'audio/wav'
    }

    return 'application/octet-stream'
  }

  #buildDownloadHeaders(provider: StreamProvider, streamUrl: string): Record<string, string> {
    return {
      'User-Agent': DEFAULT_SERVER_USER_AGENT,
    }
  }

  #trackHash(trackId: string): string {
    const hash = createHash('sha1').update(trackId).digest('hex')

    return hash
  }

  #flacFilePathForTrack(trackId: string, trackTitle?: string, trackArtist?: string): string {
    return join(this.#downloadsDirectoryPath, this.#flacFileName(trackId, trackTitle, trackArtist))
  }

  #legacyFilePathForTrack(trackId: string): string {
    return join(this.#downloadsDirectoryPath, `${this.#trackHash(trackId)}.audio`)
  }

  async #fileExists(filePath: string): Promise<boolean> {
    try {
      const fileStats = await stat(filePath)
      return fileStats.isFile()
    } catch {
      return false
    }
  }

  async #findTrackFilePaths(trackId: string): Promise<string[]> {
    const entries = await readdir(this.#downloadsDirectoryPath, { withFileTypes: true }).catch(() => [])
    const trackHash = this.#trackHash(trackId)
    const trackSuffix = this.#getTrackFileSuffix(trackId)
    const matchingFilePaths: string[] = []

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue
      }

      const entryName = entry.name
      if (
        entryName === `${trackHash}.flac`
        || entryName === `${trackHash}.audio`
        || entryName.endsWith(`${trackSuffix}.flac`)
      ) {
        matchingFilePaths.push(join(this.#downloadsDirectoryPath, entryName))
      }
    }

    return matchingFilePaths
  }

  async #findExistingTrackFilePath(trackId: string): Promise<string | undefined> {
    const matchingTrackFilePaths = await this.#findTrackFilePaths(trackId)
    return matchingTrackFilePaths[0]
  }

  async #deleteTrackFiles(trackId: string): Promise<void> {
    const matchingTrackFilePaths = await this.#findTrackFilePaths(trackId)
    await Promise.all(matchingTrackFilePaths.map(async (filePath) => {
      await unlink(filePath).catch(() => undefined)
    }))
  }

  async #getCurrentUsageBytes(): Promise<number> {
    const entries = await readdir(this.#downloadsDirectoryPath, { withFileTypes: true }).catch(() => [])
    let totalUsageBytes = 0

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue
      }

      const entryPath = join(this.#downloadsDirectoryPath, entry.name)
      try {
        const fileStats = await stat(entryPath)
        totalUsageBytes += fileStats.size
      } catch {
        continue
      }
    }

    return totalUsageBytes
  }
}

export function downloadsIpcModule() {
  return new DownloadsIpcModule()
}
