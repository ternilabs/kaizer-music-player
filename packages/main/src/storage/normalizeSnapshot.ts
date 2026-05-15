import type { PreferredServerId, StorageSnapshot } from './types.js'
import { normalizeStorageCapacityMb } from './storageCapacity.js'

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toPreferredServerId(value: unknown): PreferredServerId {
  if (value === 'atlas-main' || value === 'orion-main' || value === 'helios-main') {
    return value
  }

  return 'helios-main'
}

export function normalizeStorageSnapshot(rawInput: unknown): StorageSnapshot {
  const input = (rawInput ?? {}) as Partial<StorageSnapshot>

  const allTracks = Array.isArray(input.allTracks)
    ? input.allTracks
      .map((track) => ({
        id: toStringValue(track?.id),
        title: toStringValue(track?.title),
        artist: toStringValue(track?.artist),
        album: toStringValue(track?.album),
        albumId: toStringValue(track?.albumId) || undefined,
        sourceServerId: toStringValue(track?.sourceServerId) || undefined,
        isHiRes: track?.isHiRes === true,
        duration: toStringValue(track?.duration) || '0:00',
        sizeMb: typeof track?.sizeMb === 'number' && Number.isFinite(track.sizeMb) ? track.sizeMb : 0,
        coverTone: toStringValue(track?.coverTone) || 'from-zinc-700 to-zinc-900',
        coverUrl: toStringValue(track?.coverUrl) || undefined,
      }))
      .filter((track) =>
        track.id.length > 0
        && track.title.length > 0
        && track.artist.length > 0
        && track.album.length > 0)
    : []

  const playlists = Array.isArray(input.playlists)
    ? input.playlists
      .map((playlist) => ({
        id: toStringValue(playlist?.id),
        name: toStringValue(playlist?.name),
        createdAt: toStringValue(playlist?.createdAt),
        trackIds: Array.isArray(playlist?.trackIds)
          ? playlist.trackIds.map((trackId) => toStringValue(trackId)).filter((trackId) => trackId.length > 0)
          : [],
        imageUrl: toStringValue(playlist?.imageUrl) || undefined,
        isAlbumLocked: playlist?.isAlbumLocked === true,
        sourceAlbumId: toStringValue(playlist?.sourceAlbumId) || undefined,
      }))
      .filter((playlist) =>
        playlist.id.length > 0
        && playlist.name.length > 0
        && playlist.createdAt.length > 0)
    : []

  const bookmarkedPlaylistIds = Array.isArray(input.bookmarkedPlaylistIds)
    ? input.bookmarkedPlaylistIds
      .map((playlistId) => toStringValue(playlistId))
      .filter((playlistId) => playlistId.length > 0)
    : []
  const autoDownloadPlaylistIds = Array.isArray(input.autoDownloadPlaylistIds)
    ? input.autoDownloadPlaylistIds
      .map((playlistId) => toStringValue(playlistId))
      .filter((playlistId) => playlistId.length > 0)
    : []
  const albumLockedPlaylistIds = Array.isArray(input.albumLockedPlaylistIds)
    ? input.albumLockedPlaylistIds
      .map((playlistId) => toStringValue(playlistId))
      .filter((playlistId) => playlistId.length > 0)
    : []

  const validTrackIds = new Set(allTracks.map((track) => track.id))

  const downloadedTrackIds = Array.isArray(input.downloadedTrackIds)
    ? input.downloadedTrackIds
      .map((trackId) => toStringValue(trackId))
      .filter((trackId) => trackId.length > 0 && validTrackIds.has(trackId))
    : []

  const logs = Array.isArray(input.logs)
    ? input.logs
      .map((log) => ({
        id: toStringValue(log?.id),
        message: toStringValue(log?.message),
        timestamp: toStringValue(log?.timestamp),
      }))
      .filter((log) => log.id.length > 0 && log.message.length > 0 && log.timestamp.length > 0)
      .slice(0, 20)
    : []

  const storageCapacityMb = normalizeStorageCapacityMb(input.storageCapacityMb, {
    allTracks,
    downloadedTrackIds,
  })

  return {
    allTracks,
    playlists,
    bookmarkedPlaylistIds,
    autoDownloadPlaylistIds,
    albumLockedPlaylistIds,
    downloadedTrackIds,
    logs,
    preferredServerId: toPreferredServerId(input.preferredServerId),
    automaticUpdateCheckEnabled: input.automaticUpdateCheckEnabled === true,
    storageCapacityMb,
  }
}
