export type PreferredServerId = 'atlas-main' | 'orion-main' | 'helios-main'

export interface PersistedTrack {
  id: string
  title: string
  artist: string
  album: string
  albumId?: string
  sourceServerId?: string
  isHiRes?: boolean
  duration: string
  sizeMb: number
  coverTone: string
  coverUrl?: string
}

export interface PersistedPlaylist {
  id: string
  name: string
  createdAt: string
  trackIds: string[]
  imageUrl?: string
  isAlbumLocked?: boolean
  sourceAlbumId?: string
}

export interface PersistedLog {
  id: string
  message: string
  timestamp: string
}

export interface StorageSnapshot {
  allTracks: PersistedTrack[]
  playlists: PersistedPlaylist[]
  bookmarkedPlaylistIds: string[]
  autoDownloadPlaylistIds: string[]
  albumLockedPlaylistIds: string[]
  downloadedTrackIds: string[]
  logs: PersistedLog[]
  preferredServerId: PreferredServerId
  automaticUpdateCheckEnabled: boolean
  storageCapacityMb: number
}
