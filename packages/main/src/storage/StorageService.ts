import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { asc, desc } from 'drizzle-orm'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema.js'
import {
  downloadsTable,
  logsTable,
  playlistTracksTable,
  playlistsTable,
  settingsTable,
  tracksTable,
} from './schema.js'
import { DEFAULT_STORAGE_CAPACITY_MB, normalizeStorageCapacityMb } from './storageCapacity.js'
import type { PreferredServerId, StorageSnapshot } from './types.js'

const DEFAULT_PREFERRED_SERVER_ID: PreferredServerId = 'helios-main'
const MAX_BOOKMARKED_PLAYLISTS = 5

function isPreferredServerId(value: string): value is PreferredServerId {
  return (
    value === 'atlas-main'
    || value === 'orion-main'
    || value === 'helios-main'
  )
}

class StorageService {
  #sqlite: Database.Database | undefined
  #db: BetterSQLite3Database<typeof schema> | undefined
  #userDataPath: string | undefined
  #storageInitDebugMessage = ''

  init(userDataPath: string): void {
    this.#userDataPath = userDataPath

    if (this.#sqlite && this.#db) {
      return
    }

    mkdirSync(userDataPath, { recursive: true })
    const databasePath = join(userDataPath, 'kaizer.db')
    const sqlite = new Database(databasePath)
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')

    this.#sqlite = sqlite
    this.#db = drizzle(sqlite, { schema })
    try {
      const migrationsFolder = this.#resolveMigrationsFolder()
      migrate(this.#db, {
        migrationsFolder,
      })
      this.#storageInitDebugMessage = `Storage initialized via Drizzle.`
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.#storageInitDebugMessage = `Storage migration initialization failed (${errorMessage}).`
      throw error
    }
  }

  reset(userDataPath?: string): void {
    const nextUserDataPath = userDataPath ?? this.#userDataPath
    if (!nextUserDataPath) {
      throw new Error('StorageService cannot reset before initialization path is known.')
    }

    this.#userDataPath = nextUserDataPath

    const databasePath = join(nextUserDataPath, 'kaizer.db')
    const now = Date.now()

    this.#sqlite?.close()
    this.#sqlite = undefined
    this.#db = undefined

    for (const candidatePath of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
      if (!existsSync(candidatePath)) {
        continue
      }

      try {
        renameSync(candidatePath, `${candidatePath}.broken-${now}`)
      } catch (error) {
        console.error(`Failed to rotate broken storage file "${candidatePath}".`, error)
      }
    }

    this.init(nextUserDataPath)
  }

  createEmptySnapshot(): StorageSnapshot {
    return {
      allTracks: [],
      playlists: [],
      bookmarkedPlaylistIds: [],
      autoDownloadPlaylistIds: [],
      albumLockedPlaylistIds: [],
      downloadedTrackIds: [],
      logs: [],
      preferredServerId: DEFAULT_PREFERRED_SERVER_ID,
      automaticUpdateCheckEnabled: true,
      storageCapacityMb: DEFAULT_STORAGE_CAPACITY_MB,
    }
  }

  getInitDebugMessage(): string {
    return this.#storageInitDebugMessage
  }

  getBootstrapSnapshot(): StorageSnapshot {
    const db = this.#requireDb()

    const trackRows = db
      .select()
      .from(tracksTable)
      .orderBy(desc(tracksTable.updatedAt))
      .all()

    const playlistRows = db
      .select()
      .from(playlistsTable)
      .orderBy(desc(playlistsTable.updatedAt))
      .all()

    const playlistTrackRows = db
      .select()
      .from(playlistTracksTable)
      .orderBy(asc(playlistTracksTable.position))
      .all()

    const playlistTrackIdsMap = new Map<string, string[]>()
    for (const playlistTrackRow of playlistTrackRows) {
      const existingTrackIds = playlistTrackIdsMap.get(playlistTrackRow.playlistId) ?? []
      existingTrackIds.push(playlistTrackRow.trackId)
      playlistTrackIdsMap.set(playlistTrackRow.playlistId, existingTrackIds)
    }
    const playlistIdSet = new Set(playlistRows.map((playlistRow) => playlistRow.id))

    const downloadedRows = db
      .select()
      .from(downloadsTable)
      .orderBy(desc(downloadsTable.downloadedAt))
      .all()

    const settingRows = db
      .select()
      .from(settingsTable)
      .all()

    const logRows = db
      .select()
      .from(logsTable)
      .orderBy(desc(logsTable.createdAt))
      .limit(20)
      .all()

    const settingsMap = new Map(settingRows.map((settingRow) => [settingRow.key, settingRow.value]))
    const preferredServerValue = settingsMap.get('preferredServerId') ?? DEFAULT_PREFERRED_SERVER_ID
    const preferredServerId = isPreferredServerId(preferredServerValue)
      ? preferredServerValue
      : DEFAULT_PREFERRED_SERVER_ID
    const autoDownloadPlaylistIds = parseStringArraySetting(settingsMap.get('autoDownloadPlaylistIds'))
      .filter((playlistId) => playlistIdSet.has(playlistId))
    const albumLockedPlaylistIds = parseStringArraySetting(settingsMap.get('albumLockedPlaylistIds'))
      .filter((playlistId) => playlistIdSet.has(playlistId))
    const albumPlaylistSourceMap = parseStringRecordSetting(settingsMap.get('albumPlaylistSourceMap'))
    const automaticUpdateSetting = settingsMap.get('automaticUpdateCheckEnabled')
    const automaticUpdateCheckEnabled = automaticUpdateSetting === undefined
      ? true
      : automaticUpdateSetting === '1'

    const bookmarkedPlaylistIds = parseStringArraySetting(settingsMap.get('bookmarkedPlaylistIds'))
      .filter((playlistId) => playlistIdSet.has(playlistId))
      .slice(0, MAX_BOOKMARKED_PLAYLISTS)
    const allTracks = trackRows.map((trackRow) => ({
      id: trackRow.id,
      title: trackRow.title,
      artist: trackRow.artist,
      album: trackRow.album,
      albumId: trackRow.albumId ?? undefined,
      sourceServerId: trackRow.sourceServerId ?? undefined,
      isHiRes: trackRow.isHiRes,
      duration: trackRow.duration,
      sizeMb: trackRow.sizeMb,
      coverTone: trackRow.coverTone,
      coverUrl: trackRow.coverUrl ?? undefined,
    }))
    const downloadedTrackIds = downloadedRows
      .map((downloadedRow) => downloadedRow.trackId)
      .filter((trackId, index, trackIds) => trackIds.indexOf(trackId) === index)
    const storageCapacityMb = normalizeStorageCapacityMb(settingsMap.get('storageCapacityMb'), {
      allTracks,
      downloadedTrackIds,
    })

    return {
      allTracks,
      playlists: playlistRows.map((playlistRow) => ({
        id: playlistRow.id,
        name: playlistRow.name,
        createdAt: playlistRow.createdAt,
        trackIds: playlistTrackIdsMap.get(playlistRow.id) ?? [],
        imageUrl: playlistRow.imageUrl ?? undefined,
        isAlbumLocked: albumLockedPlaylistIds.includes(playlistRow.id),
        sourceAlbumId: albumPlaylistSourceMap[playlistRow.id] || undefined,
      })),
      bookmarkedPlaylistIds,
      autoDownloadPlaylistIds,
      albumLockedPlaylistIds,
      downloadedTrackIds,
      logs: logRows.map((logRow) => ({
        id: logRow.id,
        message: logRow.message,
        timestamp: logRow.timestamp,
      })),
      preferredServerId,
      automaticUpdateCheckEnabled,
      storageCapacityMb,
    }
  }

  saveSnapshot(snapshot: StorageSnapshot): void {
    const db = this.#requireDb()
    const now = Date.now()
    const uniqueTracks = Array.from(
      new Map(
        snapshot.allTracks
          .filter((track) => typeof track.id === 'string' && track.id.trim().length > 0)
          .map((track) => [track.id, track]),
      ).values(),
    )

    const uniquePlaylists = Array.from(
      new Map(
        snapshot.playlists
          .filter((playlist) =>
            typeof playlist.id === 'string'
            && playlist.id.trim().length > 0
            && typeof playlist.name === 'string'
            && playlist.name.trim().length > 0
            && typeof playlist.createdAt === 'string'
            && playlist.createdAt.trim().length > 0)
          .map((playlist) => [
            playlist.id,
            {
              ...playlist,
              trackIds: playlist.trackIds
                .filter((trackId, index, trackIds) =>
                  typeof trackId === 'string'
                  && trackId.trim().length > 0
                  && trackIds.indexOf(trackId) === index),
            },
          ]),
      ).values(),
    )

    const validPlaylistIds = new Set(uniquePlaylists.map((playlist) => playlist.id))
    const validTrackIds = new Set(uniqueTracks.map((track) => track.id))

    const uniqueBookmarkedPlaylistIds = snapshot.bookmarkedPlaylistIds
      .filter((playlistId, index, playlistIds) =>
        typeof playlistId === 'string'
        && playlistId.trim().length > 0
        && playlistIds.indexOf(playlistId) === index
        && validPlaylistIds.has(playlistId))
      .slice(0, MAX_BOOKMARKED_PLAYLISTS)
    const uniqueAutoDownloadPlaylistIds = snapshot.autoDownloadPlaylistIds
      .filter((playlistId, index, playlistIds) =>
        typeof playlistId === 'string'
        && playlistId.trim().length > 0
        && playlistIds.indexOf(playlistId) === index
        && validPlaylistIds.has(playlistId))
    const uniqueAlbumLockedPlaylistIds = snapshot.albumLockedPlaylistIds
      .filter((playlistId, index, playlistIds) =>
        typeof playlistId === 'string'
        && playlistId.trim().length > 0
        && playlistIds.indexOf(playlistId) === index
        && validPlaylistIds.has(playlistId))
    const albumPlaylistSourceMap = Object.fromEntries(
      uniquePlaylists
        .filter((playlist) =>
          typeof playlist.sourceAlbumId === 'string'
          && playlist.sourceAlbumId.trim().length > 0
          && validPlaylistIds.has(playlist.id))
        .map((playlist) => [playlist.id, playlist.sourceAlbumId!.trim()]),
    )

    const uniqueDownloadedTrackIds = snapshot.downloadedTrackIds
      .filter((trackId, index, trackIds) =>
        typeof trackId === 'string'
        && trackId.trim().length > 0
        && trackIds.indexOf(trackId) === index
        && validTrackIds.has(trackId))
    const normalizedStorageCapacityMb = normalizeStorageCapacityMb(snapshot.storageCapacityMb, {
      allTracks: uniqueTracks,
      downloadedTrackIds: uniqueDownloadedTrackIds,
    })

    const uniqueLogs = snapshot.logs
      .filter((log) =>
        typeof log.id === 'string'
        && log.id.trim().length > 0
        && typeof log.message === 'string'
        && log.message.trim().length > 0
        && typeof log.timestamp === 'string'
        && log.timestamp.trim().length > 0)
      .filter((log, index, logs) => logs.findIndex((candidate) => candidate.id === log.id) === index)
      .slice(0, 20)

    db.transaction((tx) => {
      tx.delete(playlistTracksTable).run()
      tx.delete(downloadsTable).run()
      tx.delete(playlistsTable).run()
      tx.delete(tracksTable).run()
      tx.delete(logsTable).run()
      tx.delete(settingsTable).run()

      if (uniqueTracks.length > 0) {
        tx.insert(tracksTable).values(
          uniqueTracks.map((track, index) => ({
            id: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album,
            albumId: track.albumId ?? null,
            sourceServerId: track.sourceServerId ?? null,
            isHiRes: track.isHiRes === true,
            duration: track.duration,
            sizeMb: Math.max(0, Math.round(track.sizeMb)),
            coverTone: track.coverTone,
            coverUrl: track.coverUrl ?? null,
            updatedAt: now - index,
          })),
        ).run()
      }

      if (uniquePlaylists.length > 0) {
        tx.insert(playlistsTable).values(
          uniquePlaylists.map((playlist, index) => ({
            id: playlist.id,
            name: playlist.name,
            createdAt: playlist.createdAt,
            imageUrl: playlist.imageUrl ?? null,
            updatedAt: now - index,
          })),
        ).run()

        const playlistTrackValues = uniquePlaylists.flatMap((playlist) =>
          playlist.trackIds.map((trackId, position) => ({
            playlistId: playlist.id,
            trackId,
            position,
          })))

        if (playlistTrackValues.length > 0) {
          tx.insert(playlistTracksTable).values(playlistTrackValues).run()
        }
      }

      if (uniqueDownloadedTrackIds.length > 0) {
        tx.insert(downloadsTable).values(
          uniqueDownloadedTrackIds.map((trackId, index) => ({
            trackId,
            downloadedAt: now - index,
          })),
        ).run()
      }

      if (uniqueLogs.length > 0) {
        tx.insert(logsTable).values(
          uniqueLogs.map((log, index) => ({
            id: log.id,
            message: log.message,
            timestamp: log.timestamp,
            createdAt: now - index,
          })),
        ).onConflictDoNothing().run()
      }

      tx.insert(settingsTable).values([
        { key: 'preferredServerId', value: snapshot.preferredServerId },
        { key: 'automaticUpdateCheckEnabled', value: snapshot.automaticUpdateCheckEnabled ? '1' : '0' },
        { key: 'storageCapacityMb', value: String(normalizedStorageCapacityMb) },
        { key: 'bookmarkedPlaylistIds', value: JSON.stringify(uniqueBookmarkedPlaylistIds) },
        { key: 'autoDownloadPlaylistIds', value: JSON.stringify(uniqueAutoDownloadPlaylistIds) },
        { key: 'albumLockedPlaylistIds', value: JSON.stringify(uniqueAlbumLockedPlaylistIds) },
        { key: 'albumPlaylistSourceMap', value: JSON.stringify(albumPlaylistSourceMap) },
      ]).run()
    })
  }

  #requireDb(): BetterSQLite3Database<typeof schema> {
    if (!this.#db) {
      throw new Error('StorageService is not initialized.')
    }

    return this.#db
  }

  #resolveMigrationsFolder(): string {
    const currentFileDirectory = dirname(fileURLToPath(import.meta.url))
    const resourcePathCandidates = typeof process.resourcesPath === 'string'
      ? [
        resolve(process.resourcesPath, 'app.asar/node_modules/@app/main/drizzle'),
        resolve(process.resourcesPath, 'app.asar.unpacked/node_modules/@app/main/drizzle'),
      ]
      : []

    const candidateMigrationFolders = [
      resolve(currentFileDirectory, '../../drizzle'),
      resolve(currentFileDirectory, '../../../main/drizzle'),
      ...resourcePathCandidates,
      resolve(process.cwd(), 'packages/main/drizzle'),
      resolve(process.cwd(), 'drizzle'),
    ]

    for (const candidateMigrationFolder of candidateMigrationFolders) {
      if (existsSync(candidateMigrationFolder)) {
        return candidateMigrationFolder
      }
    }

    throw new Error(
      `Drizzle migrations folder was not found. Checked: ${candidateMigrationFolders.join(', ')}`,
    )
  }

}

function parseStringArraySetting(value: string | undefined): string[] {
  if (!value) {
    return []
  }

  try {
    const parsedValue = JSON.parse(value)
    return Array.isArray(parsedValue)
      ? parsedValue.filter((playlistId): playlistId is string => typeof playlistId === 'string' && playlistId.trim().length > 0)
      : []
  } catch {
    return []
  }
}

function parseStringRecordSetting(value: string | undefined): Record<string, string> {
  if (!value) {
    return {}
  }

  try {
    const parsedValue = JSON.parse(value)
    if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsedValue)
        .filter(([key, itemValue]) => key.trim().length > 0 && typeof itemValue === 'string' && itemValue.trim().length > 0),
    ) as Record<string, string>
  } catch {
    return {}
  }
}

export const storageService = new StorageService()
