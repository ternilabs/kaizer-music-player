/* eslint-disable react-refresh/only-export-components */

import {
  type PropsWithChildren,
  useCallback,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { send } from '@app/preload'
import {
  DEFAULT_PREFERRED_SERVER_ID,
  DEFAULT_STORAGE_CAPACITY_MB,
  initialServers,
} from './default-state'
import type {
  BackupExportScope,
  BackupOperationStatus,
  LogItem,
  Playlist,
  PreferredServerId,
  ServerStatus,
  Track,
} from './types'

interface AppStateContextValue {
  allTracks: Track[]
  playlists: Playlist[]
  bookmarkedPlaylistIds: string[]
  autoDownloadPlaylistIds: string[]
  albumLockedPlaylistIds: string[]
  downloadedTrackIds: string[]
  downloadingTrackIds: string[]
  downloadedTracks: Track[]
  downloadBatchProgress: DownloadBatchProgress
  activeTrack: Track | undefined
  activeTrackSelectionNonce: number
  playbackQueueTrackIds: string[]
  playbackQueuePlaylistId: string
  playbackShuffleEnabled: boolean
  logs: LogItem[]
  servers: ServerStatus[]
  preferredServerId: PreferredServerId
  automaticUpdateCheckEnabled: boolean
  storageCapacityMb: number
  totalDownloadedSizeMb: number
  lastSearchQuery: string
  lastSubmittedSearchQuery: string
  backupOperationStatus: BackupOperationStatus
  backupNotice: string
  backupNoticeTone: 'info' | 'warning'
  storageNotice: string
  storageNoticeTone: 'info' | 'warning'
  setActiveTrack: (trackId: string, options?: { queueTrackIds?: string[]; queuePlaylistId?: string }) => void
  setPlaybackShuffleEnabled: (enabled: boolean) => void
  upsertTracks: (tracks: Track[]) => void
  togglePlaylistBookmark: (playlistId: string) => 'bookmarked' | 'unbookmarked' | 'limit-reached' | 'missing'
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) => { addedCount: number; duplicateCount: number }
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void
  createPlaylist: (
    input?: { name?: string; imageUrl?: string; trackIds?: string[]; isAlbumLocked?: boolean; sourceAlbumId?: string },
  ) => string
  updatePlaylist: (
    playlistId: string,
    changes: { name?: string; imageUrl?: string },
  ) => 'updated' | 'missing' | 'locked' | 'unchanged'
  deletePlaylist: (playlistId: string) => void
  downloadTrack: (
    trackId: string,
    options?: { silentIfAlready?: boolean; trackOverride?: Track },
  ) => Promise<'downloaded' | 'already-downloaded'>
  downloadTracksBatch: (
    trackIds: string[],
    options?: { silentIfAlready?: boolean; logLabel?: string; trackOverrides?: Track[] },
  ) => Promise<{ total: number; downloaded: number; alreadyDownloaded: number; failedTrackIds: string[] }>
  deleteDownload: (trackId: string) => Promise<void>
  bulkDeleteDownloads: (trackIds: string[]) => Promise<void>
  clearDownloads: () => Promise<void>
  updateStorageCapacity: (valueMb: number) => void
  setPreferredServerId: (serverId: PreferredServerId) => void
  setPlaylistAutoDownloadOnAdd: (playlistId: string, enabled: boolean) => void
  retryFailedDownload: (trackId: string) => Promise<'downloaded' | 'already-downloaded'>
  retryFailedDownloads: () => Promise<{ total: number; downloaded: number; alreadyDownloaded: number; failedTrackIds: string[] }>
  pauseDownloadBatch: () => void
  resumeDownloadBatch: () => void
  terminateDownloadBatch: () => Promise<void>
  setAutomaticUpdateCheckEnabled: (enabled: boolean) => void
  refreshServers: () => Promise<void>
  reloadPersistedState: () => Promise<void>
  setLastSearchState: (input: { query: string; submittedQuery: string }) => void
  exportBackup: (scope: BackupExportScope) => Promise<void>
  importBackup: () => Promise<void>
  appendLog: (message: string) => void
  clearBackupNotice: () => void
  clearStorageNotice: () => void
}

export type DownloadBatchStatus = 'idle' | 'running' | 'paused' | 'terminating' | 'terminated' | 'completed'

export interface DownloadBatchProgress {
  total: number
  completed: number
  downloaded: number
  alreadyDownloaded: number
  failedTrackIds: string[]
  retryableTrackIds: string[]
  queuedTrackIds: string[]
  currentTrackId: string
  isRunning: boolean
  status: DownloadBatchStatus
}

interface DownloadQueueRequest {
  trackIds: string[]
  trackOverridesMap: Map<string, Track>
  silentIfAlready: boolean
  logLabel?: string
  downloaded: number
  alreadyDownloaded: number
  failedTrackIds: string[]
  nextIndex: number
  resolve: (summary: { total: number; downloaded: number; alreadyDownloaded: number; failedTrackIds: string[] }) => void
  reject: (error: Error) => void
}

interface AtlasHealthResponse {
  checkedAt: string
  servers: Array<{
    id: string
    status: 'working' | 'down'
    detail: string
  }>
}

interface StorageSnapshotResponse {
  allTracks: Track[]
  playlists: Playlist[]
  bookmarkedPlaylistIds: string[]
  autoDownloadPlaylistIds: string[]
  albumLockedPlaylistIds: string[]
  downloadedTrackIds: string[]
  logs: LogItem[]
  preferredServerId: PreferredServerId
  automaticUpdateCheckEnabled: boolean
  storageCapacityMb: number
  storageDebugMessage?: string
  storageDebugTone?: 'info' | 'warning'
}

interface BackupStatusResponse {
  status: BackupOperationStatus
}

interface BackupExportResult {
  canceled: boolean
  message: string
  warnings: string[]
}

interface BackupImportResult {
  canceled: boolean
  message: string
  warnings: string[]
}

const AppStateContext = createContext<AppStateContextValue | null>(null)
let logIdSequence = 0
const MAX_TRACK_CATALOG_SIZE = 1200
const MAX_BOOKMARKED_PLAYLISTS = 5
const LOCAL_MEDIA_SCHEME_PREFIX = 'kaizer-media://'
const EMPTY_DOWNLOAD_BATCH_PROGRESS: DownloadBatchProgress = {
  total: 0,
  completed: 0,
  downloaded: 0,
  alreadyDownloaded: 0,
  failedTrackIds: [],
  retryableTrackIds: [],
  queuedTrackIds: [],
  currentTrackId: '',
  isRunning: false,
  status: 'idle',
}

function createLog(message: string): LogItem {
  const now = new Date()
  const date = now.toISOString().replace('T', ' ').slice(0, 19)
  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `local-${Date.now()}-${logIdSequence++}`

  return {
    id: `log-${randomId}`,
    message,
    timestamp: date,
  }
}

function createPlaylistName(playlistCount: number): string {
  return `New playlist ${playlistCount + 1}`
}

function createPlaylistId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `playlist-${Date.now()}`
}

function isCachedMediaUrl(url?: string): boolean {
  return typeof url === 'string' && url.startsWith(LOCAL_MEDIA_SCHEME_PREFIX)
}

function normalizeQueueTrackIds(trackIds: string[]): string[] {
  return trackIds
    .map((trackId) => trackId.trim())
    .filter((trackId, index, queueTrackIds) =>
      trackId.length > 0 && queueTrackIds.indexOf(trackId) === index)
}

function uniqueTrackIds(trackIds: string[]): string[] {
  return trackIds
    .map((trackId) => trackId.trim())
    .filter((trackId, index, values) => trackId.length > 0 && values.indexOf(trackId) === index)
}

function isDownloadAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return true
  }

  return false
}

export function AppStateProvider({ children }: PropsWithChildren) {
  const [allTracks, setAllTracks] = useState<Track[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [bookmarkedPlaylistIds, setBookmarkedPlaylistIds] = useState<string[]>([])
  const [autoDownloadPlaylistIds, setAutoDownloadPlaylistIds] = useState<string[]>([])
  const [albumLockedPlaylistIds, setAlbumLockedPlaylistIds] = useState<string[]>([])
  const [downloadedTrackIds, setDownloadedTrackIds] = useState<string[]>([])
  const [downloadingTrackIds, setDownloadingTrackIds] = useState<string[]>([])
  const [downloadBatchProgress, setDownloadBatchProgress] = useState<DownloadBatchProgress>(EMPTY_DOWNLOAD_BATCH_PROGRESS)
  const [activeTrackId, setActiveTrackId] = useState('')
  const [activeTrackSelectionNonce, setActiveTrackSelectionNonce] = useState(0)
  const [playbackQueueTrackIds, setPlaybackQueueTrackIds] = useState<string[]>([])
  const [playbackQueuePlaylistId, setPlaybackQueuePlaylistId] = useState('')
  const [playbackShuffleEnabled, setPlaybackShuffleEnabled] = useState(false)
  const [logs, setLogs] = useState<LogItem[]>([])
  const [servers, setServers] = useState(initialServers)
  const [preferredServerId, setPreferredServerIdState] = useState<PreferredServerId>(DEFAULT_PREFERRED_SERVER_ID)
  const [automaticUpdateCheckEnabled, setAutomaticUpdateCheckEnabledState] = useState(true)
  const [storageCapacityMb, setStorageCapacityMb] = useState(DEFAULT_STORAGE_CAPACITY_MB)
  const [lastSearchQuery, setLastSearchQuery] = useState('')
  const [lastSubmittedSearchQuery, setLastSubmittedSearchQuery] = useState('')
  const [backupOperationStatus, setBackupOperationStatus] = useState<BackupOperationStatus>('idle')
  const [backupNotice, setBackupNotice] = useState('')
  const [backupNoticeTone, setBackupNoticeTone] = useState<'info' | 'warning'>('info')
  const [isStorageHydrated, setIsStorageHydrated] = useState(false)
  const [storageNotice, setStorageNotice] = useState('')
  const [storageNoticeTone, setStorageNoticeTone] = useState<'info' | 'warning'>('warning')
  const saveDebounceTimeoutRef = useRef<number | undefined>(undefined)
  const savePipelineRef = useRef(Promise.resolve())
  const trackLastSeenAtRef = useRef<Map<string, number>>(new Map())
  const pendingMediaCacheKeysRef = useRef<Set<string>>(new Set())
  const downloadBatchPauseRef = useRef(false)
  const downloadBatchTerminateRef = useRef(false)
  const downloadBatchActiveTrackIdRef = useRef('')
  const downloadBatchResumeWaitersRef = useRef<Array<() => void>>([])
  const downloadQueueRequestsRef = useRef<DownloadQueueRequest[]>([])
  const isDownloadQueueWorkerRunningRef = useRef(false)
  const downloadBatchSessionTotalRef = useRef(0)
  const downloadBatchSessionDownloadedRef = useRef(0)
  const downloadBatchSessionAlreadyDownloadedRef = useRef(0)
  const downloadBatchSessionFailedTrackIdsRef = useRef<string[]>([])

  const downloadedTracks = downloadedTrackIds
    .map((trackId) => allTracks.find((track) => track.id === trackId))
    .filter((track): track is Track => Boolean(track))

  const totalDownloadedSizeMb = downloadedTracks.reduce((sum, track) => sum + track.sizeMb, 0)

  const activeTrack = allTracks.find((track) => track.id === activeTrackId)

  const appendLog = useCallback((message: string) => {
    setLogs((prevLogs) => [createLog(message), ...prevLogs].slice(0, 20))
  }, [])

  const applyStorageSnapshot = useCallback((snapshot: StorageSnapshotResponse) => {
    setAllTracks(Array.isArray(snapshot.allTracks) ? snapshot.allTracks : [])
    setPlaylists(Array.isArray(snapshot.playlists) ? snapshot.playlists : [])
    setBookmarkedPlaylistIds(Array.isArray(snapshot.bookmarkedPlaylistIds) ? snapshot.bookmarkedPlaylistIds : [])
    setAutoDownloadPlaylistIds(Array.isArray(snapshot.autoDownloadPlaylistIds) ? snapshot.autoDownloadPlaylistIds : [])
    setAlbumLockedPlaylistIds(Array.isArray(snapshot.albumLockedPlaylistIds) ? snapshot.albumLockedPlaylistIds : [])
    setDownloadedTrackIds(Array.isArray(snapshot.downloadedTrackIds) ? snapshot.downloadedTrackIds : [])
    setLogs(Array.isArray(snapshot.logs) ? snapshot.logs.slice(0, 20) : [])
    setPreferredServerIdState(snapshot.preferredServerId ?? DEFAULT_PREFERRED_SERVER_ID)
    setAutomaticUpdateCheckEnabledState(snapshot.automaticUpdateCheckEnabled === true)
    setStorageCapacityMb(
      Number.isFinite(snapshot.storageCapacityMb) && snapshot.storageCapacityMb > 0
        ? snapshot.storageCapacityMb
        : DEFAULT_STORAGE_CAPACITY_MB,
    )

    if (snapshot.storageDebugMessage) {
      setStorageNoticeTone(snapshot.storageDebugTone ?? 'warning')
      setStorageNotice(snapshot.storageDebugMessage)
      return
    }

    setStorageNotice('')
    setStorageNoticeTone('warning')
  }, [])

  const reloadPersistedState = useCallback(async () => {
    const snapshot = await (send('storage:get-bootstrap') as Promise<StorageSnapshotResponse>)
    applyStorageSnapshot(snapshot)
  }, [applyStorageSnapshot])

  const refreshBackupStatus = useCallback(async () => {
    const result = await (send('backup:get-status') as Promise<BackupStatusResponse>)
    setBackupOperationStatus(result.status ?? 'idle')
    return result
  }, [])

  const exportBackup = useCallback(async (scope: BackupExportScope) => {
    setBackupOperationStatus('exporting')
    setBackupNotice('')

    try {
      const result = await (send('backup:export', {
        scope,
      }) as Promise<BackupExportResult>)

      if (result.canceled) {
        return
      }

      appendLog(result.message)
      setBackupNoticeTone(result.warnings.length > 0 ? 'warning' : 'info')
      setBackupNotice([result.message, ...result.warnings].join(' '))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to export backup right now.'
      appendLog(message)
      setBackupNoticeTone('warning')
      setBackupNotice(message)
      throw error
    } finally {
      await refreshBackupStatus().catch(() => {
        setBackupOperationStatus('idle')
      })
    }
  }, [appendLog, refreshBackupStatus])

  const importBackup = useCallback(async () => {
    setBackupOperationStatus('importing')
    setBackupNotice('')

    try {
      const result = await (send('backup:import') as Promise<BackupImportResult>)
      if (result.canceled) {
        return
      }

      await reloadPersistedState()
      appendLog(result.message)
      setBackupNoticeTone(result.warnings.length > 0 ? 'warning' : 'info')
      setBackupNotice([result.message, ...result.warnings].join(' '))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to import backup right now.'
      appendLog(message)
      setBackupNoticeTone('warning')
      setBackupNotice(message)
      throw error
    } finally {
      await refreshBackupStatus().catch(() => {
        setBackupOperationStatus('idle')
      })
    }
  }, [appendLog, refreshBackupStatus, reloadPersistedState])

  const releaseDownloadBatchWaiters = useCallback(() => {
    const waiters = downloadBatchResumeWaitersRef.current
    downloadBatchResumeWaitersRef.current = []
    for (const resolve of waiters) {
      resolve()
    }
  }, [])

  const waitForDownloadBatchResume = useCallback(async () => {
    while (downloadBatchPauseRef.current && !downloadBatchTerminateRef.current) {
      await new Promise<void>((resolve) => {
        downloadBatchResumeWaitersRef.current.push(resolve)
      })
    }
  }, [])

  const togglePlaylistBookmark = useCallback((playlistId: string) => {
    const playlist = playlists.find((item) => item.id === playlistId)
    if (!playlist) {
      return 'missing'
    }

    if (bookmarkedPlaylistIds.includes(playlistId)) {
      setBookmarkedPlaylistIds((prevIds) => prevIds.filter((id) => id !== playlistId))
      appendLog(`Removed bookmark from playlist "${playlist.name}".`)
      return 'unbookmarked'
    }

    if (bookmarkedPlaylistIds.length >= MAX_BOOKMARKED_PLAYLISTS) {
      return 'limit-reached'
    }

    setBookmarkedPlaylistIds((prevIds) => [...prevIds, playlistId])
    appendLog(`Bookmarked playlist "${playlist.name}".`)
    return 'bookmarked'
  }, [appendLog, bookmarkedPlaylistIds, playlists])

  const setActiveTrack = (trackId: string, options?: { queueTrackIds?: string[]; queuePlaylistId?: string }) => {
    setActiveTrackId(trackId)
    setActiveTrackSelectionNonce((previous) => previous + 1)
    setPlaybackQueueTrackIds(() => {
      const nextQueueTrackIds = normalizeQueueTrackIds(options?.queueTrackIds ?? [trackId])

      if (nextQueueTrackIds.includes(trackId)) {
        return nextQueueTrackIds
      }

      return [trackId, ...nextQueueTrackIds]
    })
    setPlaybackQueuePlaylistId(options?.queuePlaylistId?.trim() ?? '')
  }

  useEffect(() => {
    if (!playbackQueuePlaylistId) {
      return
    }

    const sourcePlaylist = playlists.find((playlist) => playlist.id === playbackQueuePlaylistId)
    if (!sourcePlaylist) {
      setPlaybackQueuePlaylistId('')
      return
    }

    const syncedQueueTrackIds = normalizeQueueTrackIds(
      activeTrackId && !sourcePlaylist.trackIds.includes(activeTrackId)
        ? [activeTrackId, ...sourcePlaylist.trackIds]
        : sourcePlaylist.trackIds,
    )

    setPlaybackQueueTrackIds((prevTrackIds) => {
      if (
        prevTrackIds.length === syncedQueueTrackIds.length
        && prevTrackIds.every((trackId, index) => trackId === syncedQueueTrackIds[index])
      ) {
        return prevTrackIds
      }

      return syncedQueueTrackIds
    })
  }, [activeTrackId, playbackQueuePlaylistId, playlists])

  const upsertTracks = useCallback((tracks: Track[]) => {
    if (tracks.length === 0) {
      return
    }

    const now = Date.now()
    for (const track of tracks) {
      if (track.id) {
        trackLastSeenAtRef.current.set(track.id, now)
      }
    }

    setAllTracks((prevTracks) => {
      const previousTrackMap = new Map(prevTracks.map((track) => [track.id, track]))

      for (const track of tracks) {
        const previousTrack = previousTrackMap.get(track.id)
        previousTrackMap.set(
          track.id,
          previousTrack?.coverUrl && isCachedMediaUrl(previousTrack.coverUrl) && !isCachedMediaUrl(track.coverUrl)
            ? { ...track, coverUrl: previousTrack.coverUrl }
            : track,
        )
      }

      let nextTracks = Array.from(previousTrackMap.values())
      if (nextTracks.length <= MAX_TRACK_CATALOG_SIZE) {
        return nextTracks
      }

      const pinnedTrackIds = new Set<string>()
      if (activeTrackId) {
        pinnedTrackIds.add(activeTrackId)
      }

      for (const trackId of playbackQueueTrackIds) {
        if (trackId) {
          pinnedTrackIds.add(trackId)
        }
      }

      for (const trackId of downloadedTrackIds) {
        if (trackId) {
          pinnedTrackIds.add(trackId)
        }
      }

      for (const playlist of playlists) {
        for (const trackId of playlist.trackIds) {
          if (trackId) {
            pinnedTrackIds.add(trackId)
          }
        }
      }

      const removableTrackIds = nextTracks
        .map((track) => track.id)
        .filter((trackId) => !pinnedTrackIds.has(trackId))
        .sort((leftTrackId, rightTrackId) =>
          (trackLastSeenAtRef.current.get(leftTrackId) ?? 0)
          - (trackLastSeenAtRef.current.get(rightTrackId) ?? 0))

      const overflowCount = nextTracks.length - MAX_TRACK_CATALOG_SIZE
      const trackIdsToRemove = new Set(removableTrackIds.slice(0, overflowCount))

      if (trackIdsToRemove.size === 0) {
        return nextTracks
      }

      for (const trackId of trackIdsToRemove) {
        trackLastSeenAtRef.current.delete(trackId)
      }

      nextTracks = nextTracks.filter((track) => !trackIdsToRemove.has(track.id))
      return nextTracks
    })
  }, [activeTrackId, downloadedTrackIds, playbackQueueTrackIds, playlists])

  const addTracksToPlaylist = (playlistId: string, trackIds: string[]) => {
    if (trackIds.length === 0) {
      return { addedCount: 0, duplicateCount: 0 }
    }

    if (albumLockedPlaylistIds.includes(playlistId)) {
      return { addedCount: 0, duplicateCount: 0 }
    }

    const uniqueRequestedTrackIds = uniqueTrackIds(trackIds)
    const targetPlaylist = playlists.find((playlist) => playlist.id === playlistId)
    const existingTrackIds = new Set(targetPlaylist?.trackIds ?? [])
    const duplicateCount = uniqueRequestedTrackIds.filter((trackId) => existingTrackIds.has(trackId)).length
    const addedTrackIds = uniqueRequestedTrackIds.filter((trackId) => !existingTrackIds.has(trackId))
    const addedCount = addedTrackIds.length

    setPlaylists((prevPlaylists) =>
      prevPlaylists.map((playlist) => {
        if (playlist.id !== playlistId) {
          return playlist
        }

        const nextTrackIds = [...playlist.trackIds]

        for (const trackId of uniqueRequestedTrackIds) {
          if (!nextTrackIds.includes(trackId)) {
            nextTrackIds.push(trackId)
          }
        }

        return {
          ...playlist,
          trackIds: nextTrackIds,
        }
      }),
    )

    if (addedCount > 0) {
      appendLog(`Added ${addedCount} track(s) to playlist.`)

      if (autoDownloadPlaylistIds.includes(playlistId)) {
        void downloadTracksBatch(addedTrackIds, {
          silentIfAlready: true,
          logLabel: 'Playlist auto-download',
        })
      }
    }

    return { addedCount, duplicateCount }
  }

  const removeTrackFromPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((prevPlaylists) =>
      prevPlaylists.map((playlist) => {
        if (playlist.id !== playlistId) {
          return playlist
        }

        return {
          ...playlist,
          trackIds: playlist.trackIds.filter((id) => id !== trackId),
        }
      }),
    )

    appendLog('Removed one track from playlist.')
  }

  const createPlaylist = (
    input?: { name?: string; imageUrl?: string; trackIds?: string[]; isAlbumLocked?: boolean; sourceAlbumId?: string },
  ) => {
    const playlistId = createPlaylistId()
    const normalizedSourceAlbumId = input?.sourceAlbumId?.trim() || ''
    if (input?.isAlbumLocked && normalizedSourceAlbumId) {
      const existingAlbumPlaylist = playlists.find((playlist) =>
        playlist.isAlbumLocked === true && playlist.sourceAlbumId === normalizedSourceAlbumId)

      if (existingAlbumPlaylist) {
        const nextTrackIds = uniqueTrackIds([...existingAlbumPlaylist.trackIds, ...(input?.trackIds ?? [])])

        setPlaylists((prevPlaylists) =>
          prevPlaylists.map((playlist) =>
            playlist.id === existingAlbumPlaylist.id
              ? {
                ...playlist,
                name: input?.name?.trim() || playlist.name,
                imageUrl: input?.imageUrl?.trim() || playlist.imageUrl,
                trackIds: nextTrackIds,
                isAlbumLocked: true,
                sourceAlbumId: normalizedSourceAlbumId,
              }
              : playlist,
          ),
        )
        setAlbumLockedPlaylistIds((prevIds) =>
          prevIds.includes(existingAlbumPlaylist.id) ? prevIds : [...prevIds, existingAlbumPlaylist.id])
        appendLog(`Album playlist "${existingAlbumPlaylist.name}" already exists.`)
        return existingAlbumPlaylist.id
      }
    }

    setPlaylists((prevPlaylists) => {
      const name = input?.name?.trim() || createPlaylistName(prevPlaylists.length)
      const imageUrl = input?.imageUrl?.trim()
      const trackIds = uniqueTrackIds(input?.trackIds ?? [])

      return [
        {
          id: playlistId,
          name,
          createdAt: new Date().toISOString(),
          trackIds,
          imageUrl: imageUrl || undefined,
          isAlbumLocked: input?.isAlbumLocked === true,
          sourceAlbumId: normalizedSourceAlbumId || undefined,
        },
        ...prevPlaylists,
      ]
    })

    if (input?.isAlbumLocked === true) {
      setAlbumLockedPlaylistIds((prevIds) => (prevIds.includes(playlistId) ? prevIds : [...prevIds, playlistId]))
    }

    appendLog(`Created playlist${input?.name?.trim() ? ` "${input.name.trim()}"` : ''}.`)
    return playlistId
  }

  const updatePlaylist = useCallback((
    playlistId: string,
    changes: { name?: string; imageUrl?: string },
  ): 'updated' | 'missing' | 'locked' | 'unchanged' => {
    const currentPlaylist = playlists.find((playlist) => playlist.id === playlistId)
    if (!currentPlaylist) {
      return 'missing'
    }

    if (albumLockedPlaylistIds.includes(playlistId)) {
      return 'locked'
    }

    const normalizedName = typeof changes.name === 'string' ? changes.name.trim() : undefined
    const normalizedImageUrl = typeof changes.imageUrl === 'string' ? changes.imageUrl.trim() : undefined
    const hasNameChange = normalizedName !== undefined
      && normalizedName.length > 0
      && normalizedName !== currentPlaylist.name
    const hasImageChange = normalizedImageUrl !== undefined
      && normalizedImageUrl.length > 0
      && normalizedImageUrl !== (currentPlaylist.imageUrl ?? '')

    if (!hasNameChange && !hasImageChange) {
      return 'unchanged'
    }

    setPlaylists((prevPlaylists) =>
      prevPlaylists.map((playlist) => {
        if (playlist.id !== playlistId) {
          return playlist
        }

        return {
          ...playlist,
          name: hasNameChange ? normalizedName : playlist.name,
          imageUrl: hasImageChange ? normalizedImageUrl : playlist.imageUrl,
        }
      }),
    )

    const nextPlaylistName = hasNameChange ? normalizedName! : currentPlaylist.name

    if (hasNameChange && hasImageChange) {
      appendLog(`Updated playlist "${currentPlaylist.name}" to "${nextPlaylistName}" with a new cover.`)
    } else if (hasNameChange) {
      appendLog(`Renamed playlist "${currentPlaylist.name}" to "${nextPlaylistName}".`)
    } else if (hasImageChange) {
      appendLog(`Changed the cover for playlist "${nextPlaylistName}".`)
    }

    return 'updated'
  }, [albumLockedPlaylistIds, appendLog, playlists])

  const deletePlaylist = useCallback((playlistId: string) => {
    const playlistName = playlists.find((playlist) => playlist.id === playlistId)?.name

    setPlaylists((prevPlaylists) => prevPlaylists.filter((playlist) => playlist.id !== playlistId))
    setBookmarkedPlaylistIds((prevIds) => prevIds.filter((id) => id !== playlistId))
    setAutoDownloadPlaylistIds((prevIds) => prevIds.filter((id) => id !== playlistId))
    setAlbumLockedPlaylistIds((prevIds) => prevIds.filter((id) => id !== playlistId))

    appendLog(`Deleted playlist${playlistName ? ` "${playlistName}"` : ''}.`)
  }, [appendLog, playlists])

  const performTrackDownload = useCallback(async (
    trackId: string,
    options?: { silentIfAlready?: boolean; trackOverride?: Track },
  ): Promise<'downloaded' | 'already-downloaded'> => {
    const normalizedTrackId = trackId.trim()
    if (!normalizedTrackId) {
      throw new Error('Track ID is required.')
    }

    const existingTrack = options?.trackOverride?.id === normalizedTrackId
      ? options.trackOverride
      : allTracks.find((track) => track.id === normalizedTrackId)
    if (!existingTrack) {
      throw new Error('Track metadata is unavailable for download.')
    }

    const nextTotalSizeMb = totalDownloadedSizeMb + Math.max(0, Math.round(existingTrack.sizeMb))
    if (!downloadedTrackIds.includes(normalizedTrackId) && nextTotalSizeMb > storageCapacityMb) {
      throw new Error('Storage capacity reached. Clear downloads or increase capacity.')
    }

    setDownloadingTrackIds((prevIds) =>
      prevIds.includes(normalizedTrackId) ? prevIds : [...prevIds, normalizedTrackId])

    try {
      const response = await (send('downloads:start', {
        trackId: normalizedTrackId,
        trackTitle: existingTrack.title,
        trackArtist: existingTrack.artist,
        storageCapacityMb,
      }) as Promise<{ status: 'downloaded' | 'already-downloaded' }>)

      if (response.status === 'downloaded') {
        setDownloadedTrackIds((prevIds) =>
          prevIds.includes(normalizedTrackId) ? prevIds : [normalizedTrackId, ...prevIds])
        appendLog(`Downloaded "${existingTrack.title}".`)
        return 'downloaded'
      }

      setDownloadedTrackIds((prevIds) =>
        prevIds.includes(normalizedTrackId) ? prevIds : [normalizedTrackId, ...prevIds])

      if (!options?.silentIfAlready) {
        appendLog(`"${existingTrack.title}" is already downloaded.`)
      }

      return 'already-downloaded'
    } finally {
      setDownloadingTrackIds((prevIds) => prevIds.filter((id) => id !== normalizedTrackId))
    }
  }, [allTracks, appendLog, downloadedTrackIds, storageCapacityMb, totalDownloadedSizeMb])

  const collectQueuedTrackIds = useCallback((skipCurrentTrackSlot: boolean) => {
    const queuedTrackIds: string[] = []

    for (const request of downloadQueueRequestsRef.current) {
      for (let index = request.nextIndex; index < request.trackIds.length; index += 1) {
        if (skipCurrentTrackSlot && request === downloadQueueRequestsRef.current[0] && index === request.nextIndex) {
          continue
        }

        queuedTrackIds.push(request.trackIds[index])
      }
    }

    return queuedTrackIds
  }, [])

  const resetDownloadBatchSession = useCallback((queuedTrackIds: string[]) => {
    downloadBatchPauseRef.current = false
    downloadBatchTerminateRef.current = false
    downloadBatchActiveTrackIdRef.current = ''
    downloadBatchSessionTotalRef.current = queuedTrackIds.length
    downloadBatchSessionDownloadedRef.current = 0
    downloadBatchSessionAlreadyDownloadedRef.current = 0
    downloadBatchSessionFailedTrackIdsRef.current = []
    setDownloadBatchProgress({
      total: queuedTrackIds.length,
      completed: 0,
      downloaded: 0,
      alreadyDownloaded: 0,
      failedTrackIds: [],
      retryableTrackIds: [],
      queuedTrackIds: [...queuedTrackIds],
      currentTrackId: '',
      isRunning: queuedTrackIds.length > 0,
      status: queuedTrackIds.length > 0 ? 'running' : 'idle',
    })
  }, [])

  const finalizeTerminatedQueue = useCallback(() => {
    const remainingTrackIds = collectQueuedTrackIds(false)
    const retryableTrackIds = uniqueTrackIds([
      ...downloadBatchSessionFailedTrackIdsRef.current,
      ...remainingTrackIds,
    ])

    for (const request of downloadQueueRequestsRef.current) {
      const pendingTrackIds = request.trackIds.slice(request.nextIndex)
      const failedTrackIds = uniqueTrackIds([...request.failedTrackIds, ...pendingTrackIds])
      if (request.logLabel) {
        appendLog(
          `${request.logLabel}: ${request.downloaded} downloaded, ${request.alreadyDownloaded} already downloaded, ${failedTrackIds.length} failed.`,
        )
      }
      request.resolve({
        total: request.trackIds.length,
        downloaded: request.downloaded,
        alreadyDownloaded: request.alreadyDownloaded,
        failedTrackIds,
      })
    }

    downloadQueueRequestsRef.current = []
    downloadBatchActiveTrackIdRef.current = ''
    setDownloadBatchProgress((previous) => ({
      ...previous,
      completed: previous.total - remainingTrackIds.length,
      failedTrackIds: [...downloadBatchSessionFailedTrackIdsRef.current],
      retryableTrackIds,
      queuedTrackIds: remainingTrackIds,
      currentTrackId: '',
      isRunning: false,
      status: 'terminated',
    }))
    appendLog(`Download Manager terminated with ${retryableTrackIds.length} track(s) remaining.`)
  }, [appendLog, collectQueuedTrackIds])

  const processDownloadQueue = useCallback(async () => {
    if (isDownloadQueueWorkerRunningRef.current) {
      return
    }

    isDownloadQueueWorkerRunningRef.current = true

    try {
      while (downloadQueueRequestsRef.current.length > 0) {
        await waitForDownloadBatchResume()

        if (downloadBatchTerminateRef.current) {
          finalizeTerminatedQueue()
          return
        }

        const currentRequest = downloadQueueRequestsRef.current[0]
        const trackId = currentRequest?.trackIds[currentRequest.nextIndex]

        if (!currentRequest || !trackId) {
          if (currentRequest) {
            if (currentRequest.logLabel) {
              appendLog(
                `${currentRequest.logLabel}: ${currentRequest.downloaded} downloaded, ${currentRequest.alreadyDownloaded} already downloaded, ${currentRequest.failedTrackIds.length} failed.`,
              )
            }
            currentRequest.resolve({
              total: currentRequest.trackIds.length,
              downloaded: currentRequest.downloaded,
              alreadyDownloaded: currentRequest.alreadyDownloaded,
              failedTrackIds: [...currentRequest.failedTrackIds],
            })
            downloadQueueRequestsRef.current.shift()
          }
          continue
        }

        downloadBatchActiveTrackIdRef.current = trackId
        setDownloadBatchProgress((previous) => ({
          ...previous,
          queuedTrackIds: collectQueuedTrackIds(true),
          currentTrackId: trackId,
          isRunning: true,
          status: 'running',
        }))

        try {
          const status = await performTrackDownload(trackId, {
            silentIfAlready: currentRequest.silentIfAlready,
            trackOverride: currentRequest.trackOverridesMap.get(trackId),
          })

          if (status === 'downloaded') {
            currentRequest.downloaded += 1
            downloadBatchSessionDownloadedRef.current += 1
          } else {
            currentRequest.alreadyDownloaded += 1
            downloadBatchSessionAlreadyDownloadedRef.current += 1
          }
        } catch (error) {
          if (downloadBatchTerminateRef.current || isDownloadAbortError(error)) {
            finalizeTerminatedQueue()
            return
          }

          currentRequest.failedTrackIds.push(trackId)
          downloadBatchSessionFailedTrackIdsRef.current = [
            ...downloadBatchSessionFailedTrackIdsRef.current,
            trackId,
          ]
        } finally {
          currentRequest.nextIndex += 1
          downloadBatchActiveTrackIdRef.current = ''
          setDownloadBatchProgress({
            total: downloadBatchSessionTotalRef.current,
            completed: downloadBatchSessionDownloadedRef.current
              + downloadBatchSessionAlreadyDownloadedRef.current
              + downloadBatchSessionFailedTrackIdsRef.current.length,
            downloaded: downloadBatchSessionDownloadedRef.current,
            alreadyDownloaded: downloadBatchSessionAlreadyDownloadedRef.current,
            failedTrackIds: [...downloadBatchSessionFailedTrackIdsRef.current],
            retryableTrackIds: uniqueTrackIds(downloadBatchSessionFailedTrackIdsRef.current),
            queuedTrackIds: collectQueuedTrackIds(false),
            currentTrackId: '',
            isRunning: !downloadBatchPauseRef.current && !downloadBatchTerminateRef.current,
            status: downloadBatchTerminateRef.current
              ? 'terminating'
              : downloadBatchPauseRef.current
                ? 'paused'
                : 'running',
          })
        }

        if (currentRequest.nextIndex >= currentRequest.trackIds.length) {
          if (currentRequest.logLabel) {
            appendLog(
              `${currentRequest.logLabel}: ${currentRequest.downloaded} downloaded, ${currentRequest.alreadyDownloaded} already downloaded, ${currentRequest.failedTrackIds.length} failed.`,
            )
          }
          currentRequest.resolve({
            total: currentRequest.trackIds.length,
            downloaded: currentRequest.downloaded,
            alreadyDownloaded: currentRequest.alreadyDownloaded,
            failedTrackIds: [...currentRequest.failedTrackIds],
          })
          downloadQueueRequestsRef.current.shift()
        }
      }

      setDownloadBatchProgress({
        total: downloadBatchSessionTotalRef.current,
        completed: downloadBatchSessionDownloadedRef.current
          + downloadBatchSessionAlreadyDownloadedRef.current
          + downloadBatchSessionFailedTrackIdsRef.current.length,
        downloaded: downloadBatchSessionDownloadedRef.current,
        alreadyDownloaded: downloadBatchSessionAlreadyDownloadedRef.current,
        failedTrackIds: [...downloadBatchSessionFailedTrackIdsRef.current],
        retryableTrackIds: uniqueTrackIds(downloadBatchSessionFailedTrackIdsRef.current),
        queuedTrackIds: [],
        currentTrackId: '',
        isRunning: false,
        status: downloadBatchSessionTotalRef.current > 0 ? 'completed' : 'idle',
      })
    } finally {
      isDownloadQueueWorkerRunningRef.current = false
    }
  }, [appendLog, collectQueuedTrackIds, finalizeTerminatedQueue, performTrackDownload, waitForDownloadBatchResume])

  const downloadTracksBatch = useCallback(async (
    trackIds: string[],
    options?: { silentIfAlready?: boolean; logLabel?: string; trackOverrides?: Track[] },
  ): Promise<{ total: number; downloaded: number; alreadyDownloaded: number; failedTrackIds: string[] }> => {
    const normalizedTrackIds = uniqueTrackIds(trackIds)
    if (normalizedTrackIds.length === 0) {
      if (downloadBatchProgress.status === 'idle') {
        setDownloadBatchProgress(EMPTY_DOWNLOAD_BATCH_PROGRESS)
      }
      return {
        total: 0,
        downloaded: 0,
        alreadyDownloaded: 0,
        failedTrackIds: [],
      }
    }

    const trackOverridesMap = new Map(
      (options?.trackOverrides ?? [])
        .filter((track) => typeof track.id === 'string' && track.id.trim().length > 0)
        .map((track) => [track.id, track]),
    )

    const isActiveSession = (
      downloadBatchProgress.status === 'running'
      || downloadBatchProgress.status === 'paused'
      || downloadBatchProgress.status === 'terminating'
    )

    if (!isActiveSession) {
      resetDownloadBatchSession(normalizedTrackIds)
    } else {
      downloadBatchSessionTotalRef.current += normalizedTrackIds.length
      setDownloadBatchProgress((previous) => ({
        ...previous,
        total: downloadBatchSessionTotalRef.current,
        queuedTrackIds: [...previous.queuedTrackIds, ...normalizedTrackIds],
      }))
    }

    const summaryPromise = new Promise<{ total: number; downloaded: number; alreadyDownloaded: number; failedTrackIds: string[] }>((resolve, reject) => {
      downloadQueueRequestsRef.current.push({
        trackIds: normalizedTrackIds,
        trackOverridesMap,
        silentIfAlready: options?.silentIfAlready ?? true,
        logLabel: options?.logLabel,
        downloaded: 0,
        alreadyDownloaded: 0,
        failedTrackIds: [],
        nextIndex: 0,
        resolve,
        reject,
      })
    })

    if (downloadBatchProgress.status !== 'paused') {
      void processDownloadQueue()
    }

    return summaryPromise
  }, [downloadBatchProgress.status, processDownloadQueue, resetDownloadBatchSession])

  const downloadTrack = useCallback(async (
    trackId: string,
    options?: { silentIfAlready?: boolean; trackOverride?: Track },
  ): Promise<'downloaded' | 'already-downloaded'> => {
    const summary = await downloadTracksBatch([trackId], {
      silentIfAlready: options?.silentIfAlready ?? false,
      trackOverrides: options?.trackOverride ? [options.trackOverride] : undefined,
    })

    if (summary.failedTrackIds.length > 0) {
      throw new Error('Failed to download track.')
    }

    return summary.downloaded > 0 ? 'downloaded' : 'already-downloaded'
  }, [downloadTracksBatch])

  const retryFailedDownload = useCallback(async (
    trackId: string,
  ): Promise<'downloaded' | 'already-downloaded'> => {
    const status = await downloadTrack(trackId, { silentIfAlready: true })
    setDownloadBatchProgress((previous) => ({
      ...previous,
      failedTrackIds: previous.failedTrackIds.filter((id) => id !== trackId),
      retryableTrackIds: previous.retryableTrackIds.filter((id) => id !== trackId),
    }))
    return status
  }, [downloadTrack])

  const retryFailedDownloads = useCallback(async () => {
    const trackIdsToRetry = downloadBatchProgress.retryableTrackIds
    if (trackIdsToRetry.length === 0) {
      return {
        total: 0,
        downloaded: 0,
        alreadyDownloaded: 0,
        failedTrackIds: [],
      }
    }

    return downloadTracksBatch(trackIdsToRetry, {
      silentIfAlready: true,
      logLabel: 'Retry remaining downloads',
    })
  }, [downloadBatchProgress.retryableTrackIds, downloadTracksBatch])

  const pauseDownloadBatch = useCallback(() => {
    if (downloadBatchProgress.status !== 'running') {
      return
    }

    downloadBatchPauseRef.current = true
    setDownloadBatchProgress((previous) => ({
      ...previous,
      isRunning: false,
      status: 'paused',
    }))
    appendLog('Download Manager paused.')
  }, [appendLog, downloadBatchProgress.status])

  const resumeDownloadBatch = useCallback(() => {
    if (downloadBatchProgress.status !== 'paused') {
      return
    }

    downloadBatchPauseRef.current = false
    releaseDownloadBatchWaiters()
    setDownloadBatchProgress((previous) => ({
      ...previous,
      isRunning: true,
      status: 'running',
    }))
    appendLog('Download Manager resumed.')
    void processDownloadQueue()
  }, [appendLog, downloadBatchProgress.status, processDownloadQueue, releaseDownloadBatchWaiters])

  const terminateDownloadBatch = useCallback(async () => {
    if (
      downloadBatchProgress.status !== 'running'
      && downloadBatchProgress.status !== 'paused'
      && downloadBatchProgress.status !== 'terminating'
    ) {
      return
    }

    downloadBatchTerminateRef.current = true
    downloadBatchPauseRef.current = false
    releaseDownloadBatchWaiters()
    setDownloadBatchProgress((previous) => ({
      ...previous,
      retryableTrackIds: uniqueTrackIds([
        ...previous.failedTrackIds,
        ...(previous.currentTrackId ? [previous.currentTrackId] : []),
        ...previous.queuedTrackIds,
      ]),
      isRunning: false,
      status: 'terminating',
    }))

    const currentTrackId = downloadBatchActiveTrackIdRef.current
    if (!currentTrackId) {
      finalizeTerminatedQueue()
      return
    }

    try {
      await send('downloads:cancel-active', {
        trackId: currentTrackId,
      })
    } catch {
      finalizeTerminatedQueue()
    }
  }, [downloadBatchProgress.status, finalizeTerminatedQueue, releaseDownloadBatchWaiters])

  const deleteDownload = useCallback(async (trackId: string): Promise<void> => {
    const normalizedTrackId = trackId.trim()
    if (!normalizedTrackId) {
      return
    }

    await send('downloads:delete', {
      trackId: normalizedTrackId,
    })

    setDownloadedTrackIds((prevIds) => prevIds.filter((id) => id !== normalizedTrackId))
    appendLog('Deleted one downloaded track.')
  }, [appendLog])

  const bulkDeleteDownloads = useCallback(async (trackIds: string[]): Promise<void> => {
    if (trackIds.length === 0) {
      return
    }

    const uniqueTrackIds = trackIds.filter((trackId, index) => trackIds.indexOf(trackId) === index)

    await send('downloads:delete-many', {
      trackIds: uniqueTrackIds,
    })

    setDownloadedTrackIds((prevIds) => prevIds.filter((id) => !trackIds.includes(id)))
    appendLog(`Bulk deleted ${trackIds.length} downloaded track(s).`)
  }, [appendLog])

  const clearDownloads = useCallback(async (): Promise<void> => {
    await send('downloads:clear')
    setDownloadedTrackIds([])
    appendLog('Cleared all downloads.')
  }, [appendLog])

  const updateStorageCapacity = (valueMb: number) => {
    const normalizedValueMb = Math.max(1, Math.round(valueMb))
    const minimumAllowedStorageMb = Math.max(1, Math.ceil(totalDownloadedSizeMb))

    if (normalizedValueMb < minimumAllowedStorageMb) {
      throw new Error(`Storage capacity cannot be lower than the current used storage (${minimumAllowedStorageMb} MB).`)
    }

    setStorageCapacityMb(normalizedValueMb)
    appendLog(`Storage capacity updated to ${normalizedValueMb} MB.`)
  }

  const setPreferredServerId = (serverId: PreferredServerId) => {
    setPreferredServerIdState(serverId)
    appendLog(`Preferred streaming server set to ${serverId}.`)
  }

  const setPlaylistAutoDownloadOnAdd = (playlistId: string, enabled: boolean) => {
    const normalizedPlaylistId = playlistId.trim()
    if (!normalizedPlaylistId) {
      return
    }

    const targetPlaylist = playlists.find((playlist) => playlist.id === normalizedPlaylistId)
    const playlistLabel = targetPlaylist?.name ?? normalizedPlaylistId

    setAutoDownloadPlaylistIds((prevIds) => {
      if (enabled) {
        return prevIds.includes(normalizedPlaylistId) ? prevIds : [...prevIds, normalizedPlaylistId]
      }

      return prevIds.filter((id) => id !== normalizedPlaylistId)
    })
    appendLog(`Playlist auto-download for "${playlistLabel}" ${enabled ? 'enabled' : 'disabled'}.`)
  }

  const setAutomaticUpdateCheckEnabled = (enabled: boolean) => {
    setAutomaticUpdateCheckEnabledState(enabled)
    appendLog(`Automatically check updates ${enabled ? 'enabled' : 'disabled'}.`)
  }

  const setLastSearchState = useCallback((input: { query: string; submittedQuery: string }) => {
    setLastSearchQuery(input.query)
    setLastSubmittedSearchQuery(input.submittedQuery)
  }, [])

  const refreshServers = useCallback(async () => {
    const statusMap = new Map<string, AtlasHealthResponse['servers'][number]>()
    const providerErrors: string[] = []

    const [atlasHealth, orionHealth, heliosHealth] = await Promise.allSettled([
      send('atlas-main:health') as Promise<AtlasHealthResponse>,
      send('orion-main:health') as Promise<AtlasHealthResponse>,
      send('helios-main:health') as Promise<AtlasHealthResponse>,
    ])

    if (atlasHealth.status === 'fulfilled') {
      for (const server of atlasHealth.value.servers) {
        statusMap.set(server.id, server)
      }
    } else {
      const message = atlasHealth.reason instanceof Error
        ? atlasHealth.reason.message
        : 'Atlas health check failed.'
      providerErrors.push(`Atlas: ${message}`)
    }

    if (orionHealth.status === 'fulfilled') {
      for (const server of orionHealth.value.servers) {
        statusMap.set(server.id, server)
      }
    } else {
      const message = orionHealth.reason instanceof Error
        ? orionHealth.reason.message
        : 'Orion health check failed.'
      providerErrors.push(`Orion: ${message}`)
    }

    if (heliosHealth.status === 'fulfilled') {
      for (const server of heliosHealth.value.servers) {
        statusMap.set(server.id, server)
      }
    } else {
      const message = heliosHealth.reason instanceof Error
        ? heliosHealth.reason.message
        : 'Helios health check failed.'
      providerErrors.push(`Helios: ${message}`)
    }

    setServers((prevServers) =>
      prevServers.map((server) => {
        if (server.id === 'kaizer-main' || server.id === 'nyx-main') {
          return { ...server, status: 'down' }
        }

        const mappedServer = statusMap.get(server.id)
        if (mappedServer) {
          return {
            ...server,
            status: mappedServer.status,
          }
        }

        if (
          server.id === 'atlas-main'
          || server.id === 'atlas-alt'
          || server.id === 'orion-main'
          || server.id.startsWith('helios-')
        ) {
          return { ...server, status: 'down' }
        }

        return server
      }),
    )

    const workingServers = Array.from(statusMap.values())
      .filter((server) => server.status === 'working')
      .map((server) => server.id)

    if (workingServers.length > 0) {
      appendLog(`Backend health refreshed. Working: ${workingServers.join(', ')}.`)
      return
    }

    if (providerErrors.length > 0) {
      appendLog(`Backend health check failed: ${providerErrors.join(' | ')}`)
      return
    }

    appendLog('Backend health refreshed. All backend endpoints are down.')
  }, [appendLog])

  useEffect(() => {
    let isDisposed = false

    void reloadPersistedState()
      .then(() => {
        if (isDisposed) {
          return
        }
      })
      .catch(() => {
        if (isDisposed) {
          return
        }

        setLogs((prevLogs) => [createLog('Unable to load local storage snapshot.'), ...prevLogs].slice(0, 20))
        setStorageNoticeTone('warning')
        setStorageNotice('Unable to load local storage snapshot. Starting with empty state.')
      })
      .finally(() => {
        if (!isDisposed) {
          setIsStorageHydrated(true)
        }
      })

    return () => {
      isDisposed = true
    }
  }, [reloadPersistedState])

  useEffect(() => {
    void refreshBackupStatus().catch(() => {
      setBackupOperationStatus('idle')
    })
  }, [refreshBackupStatus])

  useEffect(() => {
    if (backupOperationStatus === 'idle') {
      return
    }

    const intervalId = window.setInterval(() => {
      void refreshBackupStatus().catch(() => {
        setBackupOperationStatus('idle')
      })
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [backupOperationStatus, refreshBackupStatus])

  useEffect(() => {
    if (!isStorageHydrated) {
      return
    }

    for (const playlist of playlists) {
      const imageUrl = playlist.imageUrl?.trim()
      const cacheKey = `playlist:${playlist.id}`

      if (!imageUrl || isCachedMediaUrl(imageUrl) || pendingMediaCacheKeysRef.current.has(cacheKey)) {
        continue
      }

      pendingMediaCacheKeysRef.current.add(cacheKey)

      void (send('media-cache:cache-image', {
        cacheKey,
        imageUrl,
      }) as Promise<{ cachedUrl: string | null }>)
        .then((result) => {
          if (!result.cachedUrl) {
            return
          }

          setPlaylists((prevPlaylists) =>
            prevPlaylists.map((currentPlaylist) =>
              currentPlaylist.id === playlist.id && currentPlaylist.imageUrl === imageUrl
                ? { ...currentPlaylist, imageUrl: result.cachedUrl ?? undefined }
                : currentPlaylist,
            ),
          )
        })
        .catch(() => {
          // Keep the original URL when caching fails.
        })
        .finally(() => {
          pendingMediaCacheKeysRef.current.delete(cacheKey)
        })
    }
  }, [isStorageHydrated, playlists])

  useEffect(() => {
    if (!isStorageHydrated) {
      return
    }

    for (const track of downloadedTracks) {
      const coverUrl = track.coverUrl?.trim()
      const cacheKey = `track:${track.id}`

      if (!coverUrl || isCachedMediaUrl(coverUrl) || pendingMediaCacheKeysRef.current.has(cacheKey)) {
        continue
      }

      pendingMediaCacheKeysRef.current.add(cacheKey)

      void (send('media-cache:cache-image', {
        cacheKey,
        imageUrl: coverUrl,
      }) as Promise<{ cachedUrl: string | null }>)
        .then((result) => {
          if (!result.cachedUrl) {
            return
          }

          setAllTracks((prevTracks) =>
            prevTracks.map((currentTrack) =>
              currentTrack.id === track.id && currentTrack.coverUrl === coverUrl
                ? { ...currentTrack, coverUrl: result.cachedUrl ?? undefined }
                : currentTrack,
            ),
          )
        })
        .catch(() => {
          // Keep the original cover URL when caching fails.
        })
        .finally(() => {
          pendingMediaCacheKeysRef.current.delete(cacheKey)
        })
    }
  }, [downloadedTracks, isStorageHydrated])

  useEffect(() => {
    if (!isStorageHydrated) {
      return
    }

    if (saveDebounceTimeoutRef.current !== undefined) {
      clearTimeout(saveDebounceTimeoutRef.current)
    }

    const persistedTrackIds = new Set<string>()
    for (const playlist of playlists) {
      for (const trackId of playlist.trackIds) {
        if (trackId) {
          persistedTrackIds.add(trackId)
        }
      }
    }

    for (const trackId of downloadedTrackIds) {
      if (trackId) {
        persistedTrackIds.add(trackId)
      }
    }

    const persistedTracks = allTracks.filter((track) => persistedTrackIds.has(track.id))

    const nextSnapshot = {
      allTracks: persistedTracks,
      playlists,
      bookmarkedPlaylistIds,
      autoDownloadPlaylistIds,
      albumLockedPlaylistIds,
      downloadedTrackIds,
      logs: logs.slice(0, 20),
      preferredServerId,
      automaticUpdateCheckEnabled,
      storageCapacityMb,
    }

    saveDebounceTimeoutRef.current = window.setTimeout(() => {
      savePipelineRef.current = savePipelineRef.current
        .then(() => send('storage:save-snapshot', nextSnapshot))
        .then(() => {
          setStorageNotice('')
        })
        .catch((error) => {
          console.error('Failed to save storage snapshot.', error)
          setStorageNoticeTone('warning')
          setStorageNotice('Failed to save local data. Recent changes may not persist.')
        })
    }, 400)

    return () => {
      if (saveDebounceTimeoutRef.current !== undefined) {
        clearTimeout(saveDebounceTimeoutRef.current)
      }
    }
  }, [
    allTracks,
    isStorageHydrated,
    playlists,
    bookmarkedPlaylistIds,
    autoDownloadPlaylistIds,
    albumLockedPlaylistIds,
    downloadedTrackIds,
    logs,
    preferredServerId,
    automaticUpdateCheckEnabled,
    storageCapacityMb,
  ])

  useEffect(() => {
    if (!isStorageHydrated) {
      return
    }

    void refreshServers()
  }, [isStorageHydrated, refreshServers])

  return (
    <AppStateContext.Provider
      value={{
        allTracks,
        playlists,
        bookmarkedPlaylistIds,
        autoDownloadPlaylistIds,
        albumLockedPlaylistIds,
        downloadedTrackIds,
        downloadingTrackIds,
        downloadedTracks,
        downloadBatchProgress,
        activeTrack,
        activeTrackSelectionNonce,
        playbackQueueTrackIds,
        playbackQueuePlaylistId,
        playbackShuffleEnabled,
        logs,
        servers,
        preferredServerId,
        automaticUpdateCheckEnabled,
        storageCapacityMb,
        lastSearchQuery,
        lastSubmittedSearchQuery,
        backupOperationStatus,
        backupNotice,
        backupNoticeTone,
        storageNotice,
        storageNoticeTone,
        totalDownloadedSizeMb,
        setActiveTrack,
        setPlaybackShuffleEnabled,
        upsertTracks,
        togglePlaylistBookmark,
        addTracksToPlaylist,
        removeTrackFromPlaylist,
        createPlaylist,
        updatePlaylist,
        deletePlaylist,
        downloadTrack,
        downloadTracksBatch,
        deleteDownload,
        bulkDeleteDownloads,
        clearDownloads,
        updateStorageCapacity,
        setPreferredServerId,
        setPlaylistAutoDownloadOnAdd,
        retryFailedDownload,
        retryFailedDownloads,
        pauseDownloadBatch,
        resumeDownloadBatch,
        terminateDownloadBatch,
        setAutomaticUpdateCheckEnabled,
        refreshServers,
        reloadPersistedState,
        setLastSearchState,
        exportBackup,
        importBackup,
        appendLog,
        clearBackupNotice: () => {
          setBackupNotice('')
          setBackupNoticeTone('info')
        },
        clearStorageNotice: () => {
          setStorageNotice('')
          setStorageNoticeTone('warning')
        },
      }}
    >
      {children}
    </AppStateContext.Provider>
  )
}

export function useAppState(): AppStateContextValue {
  const context = useContext(AppStateContext)

  if (!context) {
    throw new Error('useAppState must be used inside AppStateProvider')
  }

  return context
}
