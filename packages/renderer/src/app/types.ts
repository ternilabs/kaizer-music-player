export type ServerHealth = 'working' | 'down'
export type PreferredServerId = 'atlas-main' | 'orion-main' | 'helios-main'
export type BackupExportScope = 'data-only' | 'data-with-images' | 'data-with-images-and-tracks'
export type BackupOperationStatus = 'idle' | 'exporting' | 'importing'

export interface Track {
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

export interface Playlist {
  id: string
  name: string
  createdAt: string
  trackIds: string[]
  imageUrl?: string
  isAlbumLocked?: boolean
  sourceAlbumId?: string
}

export interface ServerStatus {
  id: string
  name: string
  status: ServerHealth
}

export interface LogItem {
  id: string
  message: string
  timestamp: string
}
