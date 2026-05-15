import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent, type OpenDialogOptions } from 'electron'
import JSZip from 'jszip'
import type { AppModule } from '../AppModule.js'
import type { ModuleContext } from '../ModuleContext.js'
import { normalizeStorageSnapshot } from '../storage/normalizeSnapshot.js'
import { storageService } from '../storage/StorageService.js'
import type { PersistedPlaylist, PersistedTrack, StorageSnapshot } from '../storage/types.js'

const BACKUP_FORMAT_VERSION = 1
const BACKUP_FILE_SUFFIX = '.kaizer-backup.zip'
const MEDIA_CACHE_DIRECTORY_NAME = 'media-cache'
const DOWNLOADS_DIRECTORY_NAME = 'downloads'
const MEDIA_CACHE_SCHEME = 'kaizer-media'
const MEDIA_CACHE_HOST = 'image'

export type BackupExportScope = 'data-only' | 'data-with-images' | 'data-with-images-and-tracks'

interface BackupManifest {
  formatVersion: number
  appVersion: string
  createdAt: string
  exportScope: BackupExportScope
}

interface BackupResponseBase {
  canceled: boolean
  message: string
  warnings: string[]
}

interface BackupExportResponse extends BackupResponseBase {
  filePath?: string
  exportedImageCount: number
  exportedDownloadCount: number
}

interface BackupImportResponse extends BackupResponseBase {
  filePath?: string
  restoredImageCount: number
  restoredDownloadCount: number
  mergedTrackCount: number
  mergedPlaylistCount: number
}

type BackupOperationStatus = 'idle' | 'exporting' | 'importing'

function toExportScope(value: unknown): BackupExportScope {
  if (
    value === 'data-only'
    || value === 'data-with-images'
    || value === 'data-with-images-and-tracks'
  ) {
    return value
  }

  return 'data-only'
}

function uniqueValues(values: string[]): string[] {
  return values.filter((value, index) => value.length > 0 && values.indexOf(value) === index)
}

function isMediaExportEnabled(scope: BackupExportScope): boolean {
  return scope === 'data-with-images' || scope === 'data-with-images-and-tracks'
}

function isDownloadExportEnabled(scope: BackupExportScope): boolean {
  return scope === 'data-with-images-and-tracks'
}

function normalizeBackupFilePath(selectedPath: string): string {
  if (selectedPath.endsWith(BACKUP_FILE_SUFFIX) || selectedPath.endsWith('.zip')) {
    return selectedPath
  }

  return `${selectedPath}${BACKUP_FILE_SUFFIX}`
}

function createBackupTimestamp(date = new Date()): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .replace(/\.\d{3}Z$/, (suffix) => `-${suffix.slice(1, 4)}`)
}

function isZipArchivePath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.zip')
}

async function loadBackupArchive(filePath: string): Promise<JSZip> {
  if (!isZipArchivePath(filePath)) {
    throw new Error('Selected backup file must be a .zip archive.')
  }

  const archiveBuffer = await readFile(filePath)

  try {
    return await JSZip.loadAsync(archiveBuffer)
  } catch {
    throw new Error('Selected backup file is not a valid zip archive.')
  }
}

function readRequiredBackupEntries(zip: JSZip): {
  manifestFile: JSZip.JSZipObject
  snapshotFile: JSZip.JSZipObject
} {
  const manifestFile = zip.file('manifest.json')
  const snapshotFile = zip.file('snapshot.json')

  if (!manifestFile || !snapshotFile) {
    throw new Error('Backup archive must include both manifest.json and snapshot.json.')
  }

  return {
    manifestFile,
    snapshotFile,
  }
}

function toParentWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

function toMediaCacheUrl(fileName: string): string {
  return `${MEDIA_CACHE_SCHEME}://${MEDIA_CACHE_HOST}/${encodeURIComponent(fileName)}`
}

function sanitizeArchiveFileName(rawFileName: string): string | undefined {
  const fileName = basename(rawFileName.trim())
  if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return undefined
  }

  return fileName
}

function readMediaCacheFileName(url?: string): string | undefined {
  if (!url || !url.startsWith(`${MEDIA_CACHE_SCHEME}://`)) {
    return undefined
  }

  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== `${MEDIA_CACHE_SCHEME}:` || parsedUrl.hostname !== MEDIA_CACHE_HOST) {
      return undefined
    }

    return sanitizeArchiveFileName(decodeURIComponent(parsedUrl.pathname.slice(1)))
  } catch {
    return undefined
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const fileInfo = await stat(filePath)
    return fileInfo.isFile()
  } catch {
    return false
  }
}

function trackHash(trackId: string): string {
  return createHash('sha1').update(trackId).digest('hex')
}

function getTrackFileSuffix(trackId: string): string {
  return `__${trackHash(trackId)}`
}

async function findDownloadFilePaths(downloadsDirectoryPath: string, trackId: string): Promise<string[]> {
  const entries = await readdir(downloadsDirectoryPath, { withFileTypes: true }).catch(() => [])
  const hash = trackHash(trackId)
  const suffix = getTrackFileSuffix(trackId)
  const matchingPaths: string[] = []

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }

    const entryName = entry.name
    if (
      entryName === `${hash}.flac`
      || entryName === `${hash}.audio`
      || entryName.endsWith(`${suffix}.flac`)
    ) {
      matchingPaths.push(join(downloadsDirectoryPath, entryName))
    }
  }

  return matchingPaths
}

async function toPreparedImportedTrack(
  track: PersistedTrack,
  mediaCacheDirectoryPath: string,
): Promise<{ track: PersistedTrack; droppedLocalAsset: boolean }> {
  const fileName = readMediaCacheFileName(track.coverUrl)
  if (!track.coverUrl || !track.coverUrl.startsWith(`${MEDIA_CACHE_SCHEME}://`)) {
    return { track, droppedLocalAsset: false }
  }

  if (!fileName || !await fileExists(join(mediaCacheDirectoryPath, fileName))) {
    return {
      track: {
        ...track,
        coverUrl: undefined,
      },
      droppedLocalAsset: true,
    }
  }

  return {
    track: {
      ...track,
      coverUrl: toMediaCacheUrl(fileName),
    },
    droppedLocalAsset: false,
  }
}

async function toPreparedImportedPlaylist(
  playlist: PersistedPlaylist,
  mediaCacheDirectoryPath: string,
): Promise<{ playlist: PersistedPlaylist; droppedLocalAsset: boolean }> {
  const fileName = readMediaCacheFileName(playlist.imageUrl)
  if (!playlist.imageUrl || !playlist.imageUrl.startsWith(`${MEDIA_CACHE_SCHEME}://`)) {
    return { playlist, droppedLocalAsset: false }
  }

  if (!fileName || !await fileExists(join(mediaCacheDirectoryPath, fileName))) {
    return {
      playlist: {
        ...playlist,
        imageUrl: undefined,
      },
      droppedLocalAsset: true,
    }
  }

  return {
    playlist: {
      ...playlist,
      imageUrl: toMediaCacheUrl(fileName),
    },
    droppedLocalAsset: false,
  }
}

function mergeById<T extends { id: string }>(currentItems: T[], importedItems: T[]): T[] {
  const importedIds = new Set(importedItems.map((item) => item.id))
  return [
    ...importedItems,
    ...currentItems.filter((item) => !importedIds.has(item.id)),
  ]
}

function mergeStringLists(importedValues: string[], currentValues: string[]): string[] {
  return uniqueValues([...importedValues, ...currentValues])
}

function buildWarning(count: number, singular: string, plural: string): string | undefined {
  if (count <= 0) {
    return undefined
  }

  return count === 1 ? singular : plural.replace('{count}', String(count))
}

class BackupIpcModule implements AppModule {
  #appVersion = '0.0.0'
  #downloadsDirectoryPath = ''
  #mediaCacheDirectoryPath = ''
  #status: BackupOperationStatus = 'idle'

  async enable({ app }: ModuleContext): Promise<void> {
    await app.whenReady()

    const userDataPath = app.getPath('userData')
    this.#appVersion = app.getVersion()
    this.#downloadsDirectoryPath = join(userDataPath, DOWNLOADS_DIRECTORY_NAME)
    this.#mediaCacheDirectoryPath = join(userDataPath, MEDIA_CACHE_DIRECTORY_NAME)

    await mkdir(this.#downloadsDirectoryPath, { recursive: true })
    await mkdir(this.#mediaCacheDirectoryPath, { recursive: true })

    ipcMain.removeHandler('backup:export')
    ipcMain.handle('backup:export', async (event, rawInput: unknown) => {
      return this.#exportBackup(event, rawInput)
    })

    ipcMain.removeHandler('backup:import')
    ipcMain.handle('backup:import', async (event) => {
      return this.#importBackup(event)
    })

    ipcMain.removeHandler('backup:get-status')
    ipcMain.handle('backup:get-status', async () => {
      return {
        status: this.#status,
      }
    })
  }

  async #exportBackup(
    event: IpcMainInvokeEvent,
    rawInput: unknown,
  ): Promise<BackupExportResponse> {
    if (this.#status !== 'idle') {
      throw new Error('Another backup operation is already in progress.')
    }

    this.#status = 'exporting'

    try {
      const scope = toExportScope((rawInput as { scope?: unknown } | undefined)?.scope)
      const parentWindow = toParentWindow(event)
      const dialogOptions = {
        title: 'Export',
        defaultPath: `kaizer-backup-${createBackupTimestamp()}${BACKUP_FILE_SUFFIX}`,
        buttonLabel: 'Export',
        filters: [
          { name: 'Kaizer Backup', extensions: ['zip'] },
        ],
        showsTagField: false,
      }
      const selectedPathResult = parentWindow
        ? await dialog.showSaveDialog(parentWindow, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions)

      if (selectedPathResult.canceled || !selectedPathResult.filePath) {
        return {
          canceled: true,
          message: 'Backup export canceled.',
          warnings: [],
          exportedImageCount: 0,
          exportedDownloadCount: 0,
        }
      }

      const snapshot = storageService.getBootstrapSnapshot()
      const warnings: string[] = []
      const zip = new JSZip()
      const normalizedFilePath = normalizeBackupFilePath(selectedPathResult.filePath)
      const manifest: BackupManifest = {
        formatVersion: BACKUP_FORMAT_VERSION,
        appVersion: this.#appVersion,
        createdAt: new Date().toISOString(),
        exportScope: scope,
      }

      zip.file('manifest.json', JSON.stringify(manifest, null, 2))
      zip.file('snapshot.json', JSON.stringify(snapshot, null, 2))

      let exportedImageCount = 0
      if (isMediaExportEnabled(scope)) {
        const localImageFileNames = new Set<string>()
        let missingLocalImageCount = 0
        const localImageUrls = [
          ...snapshot.allTracks.map((track) => track.coverUrl),
          ...snapshot.playlists.map((playlist) => playlist.imageUrl),
        ]

        for (const imageUrl of localImageUrls) {
          const fileName = readMediaCacheFileName(imageUrl)
          if (!fileName) {
            if (imageUrl?.startsWith(`${MEDIA_CACHE_SCHEME}://`)) {
              missingLocalImageCount += 1
            }
            continue
          }

          const sourceFilePath = join(this.#mediaCacheDirectoryPath, fileName)
          if (!await fileExists(sourceFilePath)) {
            missingLocalImageCount += 1
            continue
          }

          localImageFileNames.add(fileName)
        }

        for (const fileName of localImageFileNames) {
          const sourceFilePath = join(this.#mediaCacheDirectoryPath, fileName)
          zip.file(`assets/media-cache/${fileName}`, await readFile(sourceFilePath))
        }

        exportedImageCount = localImageFileNames.size
        const imageWarning = buildWarning(
          missingLocalImageCount,
          'Skipped 1 referenced local image because the cached file was missing.',
          'Skipped {count} referenced local images because the cached files were missing.',
        )
        if (imageWarning) {
          warnings.push(imageWarning)
        }
      }

      let exportedDownloadCount = 0
      if (isDownloadExportEnabled(scope)) {
        const addedDownloadFileNames = new Set<string>()
        let missingDownloadCount = 0

        for (const trackId of uniqueValues(snapshot.downloadedTrackIds)) {
          const downloadFilePaths = await findDownloadFilePaths(this.#downloadsDirectoryPath, trackId)
          if (downloadFilePaths.length === 0) {
            missingDownloadCount += 1
            continue
          }

          for (const downloadFilePath of downloadFilePaths) {
            const fileName = basename(downloadFilePath)
            if (addedDownloadFileNames.has(fileName)) {
              continue
            }

            addedDownloadFileNames.add(fileName)
            zip.file(`assets/downloads/${fileName}`, await readFile(downloadFilePath))
          }
        }

        exportedDownloadCount = addedDownloadFileNames.size
        const downloadWarning = buildWarning(
          missingDownloadCount,
          'Skipped 1 downloaded track because no local file was found.',
          'Skipped {count} downloaded tracks because no local files were found.',
        )
        if (downloadWarning) {
          warnings.push(downloadWarning)
        }
      }

      const archiveBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      })

      await writeFile(normalizedFilePath, archiveBuffer)

      return {
        canceled: false,
        filePath: normalizedFilePath,
        message: `Backup exported to ${basename(normalizedFilePath)}.`,
        warnings,
        exportedImageCount,
        exportedDownloadCount,
      }
    } finally {
      this.#status = 'idle'
    }
  }

  async #importBackup(event: IpcMainInvokeEvent): Promise<BackupImportResponse> {
    if (this.#status !== 'idle') {
      throw new Error('Another backup operation is already in progress.')
    }

    this.#status = 'importing'

    try {
      const parentWindow = toParentWindow(event)
      const dialogOptions: OpenDialogOptions = {
        title: 'Import backup',
        buttonLabel: 'Import backup',
        properties: ['openFile'],
        filters: [
          { name: 'Kaizer Backup', extensions: ['zip'] },
        ],
      }
      const selectedPathResult = parentWindow
        ? await dialog.showOpenDialog(parentWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)

      const selectedFilePath = selectedPathResult.filePaths[0]
      if (selectedPathResult.canceled || !selectedFilePath) {
        return {
          canceled: true,
          message: 'Backup import canceled.',
          warnings: [],
          restoredImageCount: 0,
          restoredDownloadCount: 0,
          mergedTrackCount: 0,
          mergedPlaylistCount: 0,
        }
      }

      const zip = await loadBackupArchive(selectedFilePath)
      const { manifestFile, snapshotFile } = readRequiredBackupEntries(zip)

      const manifest = JSON.parse(await manifestFile.async('text')) as Partial<BackupManifest>
      if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
        throw new Error(`Unsupported backup format version: ${String(manifest.formatVersion ?? 'unknown')}.`)
      }

      const importedSnapshot = normalizeStorageSnapshot(JSON.parse(await snapshotFile.async('text')))
      const warnings: string[] = []

      const mediaCacheEntries = zip.file(/^assets\/media-cache\/[^/]+$/)
      const downloadEntries = zip.file(/^assets\/downloads\/[^/]+$/)

      let restoredImageCount = 0
      let skippedArchiveImageCount = 0
      for (const entry of mediaCacheEntries) {
        const fileName = sanitizeArchiveFileName(entry.name.replace(/^assets\/media-cache\//, ''))
        if (!fileName) {
          skippedArchiveImageCount += 1
          continue
        }

        await writeFile(join(this.#mediaCacheDirectoryPath, fileName), await entry.async('nodebuffer'))
        restoredImageCount += 1
      }

      let restoredDownloadCount = 0
      let skippedArchiveDownloadCount = 0
      for (const entry of downloadEntries) {
        const fileName = sanitizeArchiveFileName(entry.name.replace(/^assets\/downloads\//, ''))
        if (!fileName) {
          skippedArchiveDownloadCount += 1
          continue
        }

        await writeFile(join(this.#downloadsDirectoryPath, fileName), await entry.async('nodebuffer'))
        restoredDownloadCount += 1
      }

      const currentSnapshot = storageService.getBootstrapSnapshot()

      let missingImportedArtworkCount = 0
      const preparedImportedTracks: PersistedTrack[] = []
      for (const track of importedSnapshot.allTracks) {
        const preparedTrack = await toPreparedImportedTrack(track, this.#mediaCacheDirectoryPath)
        preparedImportedTracks.push(preparedTrack.track)
        if (preparedTrack.droppedLocalAsset) {
          missingImportedArtworkCount += 1
        }
      }

      const preparedImportedPlaylists: PersistedPlaylist[] = []
      for (const playlist of importedSnapshot.playlists) {
        const preparedPlaylist = await toPreparedImportedPlaylist(playlist, this.#mediaCacheDirectoryPath)
        preparedImportedPlaylists.push(preparedPlaylist.playlist)
        if (preparedPlaylist.droppedLocalAsset) {
          missingImportedArtworkCount += 1
        }
      }

      const mergedTracks = mergeById(currentSnapshot.allTracks, preparedImportedTracks)
      const validTrackIds = new Set(mergedTracks.map((track) => track.id))
      const mergedPlaylists = mergeById(currentSnapshot.playlists, preparedImportedPlaylists)
        .map((playlist) => ({
          ...playlist,
          trackIds: uniqueValues(playlist.trackIds).filter((trackId) => validTrackIds.has(trackId)),
        }))
      const validPlaylistIds = new Set(mergedPlaylists.map((playlist) => playlist.id))

      const importedFirstDownloadedTrackIds = mergeStringLists(
        importedSnapshot.downloadedTrackIds,
        currentSnapshot.downloadedTrackIds,
      )
      const mergedDownloadedTrackIds: string[] = []
      let missingImportedDownloadCount = 0

      for (const trackId of importedFirstDownloadedTrackIds) {
        if (!validTrackIds.has(trackId)) {
          continue
        }

        const hasLocalFile = (await findDownloadFilePaths(this.#downloadsDirectoryPath, trackId)).length > 0
        if (!hasLocalFile) {
          if (importedSnapshot.downloadedTrackIds.includes(trackId)) {
            missingImportedDownloadCount += 1
          }
          continue
        }

        mergedDownloadedTrackIds.push(trackId)
      }

      const mergedSnapshot: StorageSnapshot = {
        allTracks: mergedTracks,
        playlists: mergedPlaylists,
        bookmarkedPlaylistIds: mergeStringLists(
          importedSnapshot.bookmarkedPlaylistIds,
          currentSnapshot.bookmarkedPlaylistIds,
        ).filter((playlistId) => validPlaylistIds.has(playlistId)),
        autoDownloadPlaylistIds: mergeStringLists(
          importedSnapshot.autoDownloadPlaylistIds,
          currentSnapshot.autoDownloadPlaylistIds,
        ).filter((playlistId) => validPlaylistIds.has(playlistId)),
        albumLockedPlaylistIds: mergeStringLists(
          importedSnapshot.albumLockedPlaylistIds,
          currentSnapshot.albumLockedPlaylistIds,
        ).filter((playlistId) => validPlaylistIds.has(playlistId)),
        downloadedTrackIds: mergedDownloadedTrackIds,
        logs: mergeById(currentSnapshot.logs, importedSnapshot.logs).slice(0, 20),
        preferredServerId: importedSnapshot.preferredServerId,
        automaticUpdateCheckEnabled: importedSnapshot.automaticUpdateCheckEnabled,
        storageCapacityMb: importedSnapshot.storageCapacityMb,
      }

      storageService.saveSnapshot(mergedSnapshot)

      const invalidImageWarning = buildWarning(
        skippedArchiveImageCount,
        'Skipped 1 image file from the archive because the file name was invalid.',
        'Skipped {count} image files from the archive because the file names were invalid.',
      )
      if (invalidImageWarning) {
        warnings.push(invalidImageWarning)
      }

      const invalidDownloadWarning = buildWarning(
        skippedArchiveDownloadCount,
        'Skipped 1 downloaded-track file from the archive because the file name was invalid.',
        'Skipped {count} downloaded-track files from the archive because the file names were invalid.',
      )
      if (invalidDownloadWarning) {
        warnings.push(invalidDownloadWarning)
      }

      const missingArtworkWarning = buildWarning(
        missingImportedArtworkCount,
        'Dropped 1 imported local artwork reference because the file was unavailable after restore.',
        'Dropped {count} imported local artwork references because the files were unavailable after restore.',
      )
      if (missingArtworkWarning) {
        warnings.push(missingArtworkWarning)
      }

      const missingDownloadedWarning = buildWarning(
        missingImportedDownloadCount,
        'Skipped 1 imported downloaded-track entry because no local file was available.',
        'Skipped {count} imported downloaded-track entries because no local files were available.',
      )
      if (missingDownloadedWarning) {
        warnings.push(missingDownloadedWarning)
      }

      return {
        canceled: false,
        filePath: selectedFilePath,
        message: `Backup imported from ${basename(selectedFilePath)}.`,
        warnings,
        restoredImageCount,
        restoredDownloadCount,
        mergedTrackCount: mergedSnapshot.allTracks.length,
        mergedPlaylistCount: mergedSnapshot.playlists.length,
      }
    } finally {
      this.#status = 'idle'
    }
  }
}

export function backupIpcModule() {
  return new BackupIpcModule()
}
