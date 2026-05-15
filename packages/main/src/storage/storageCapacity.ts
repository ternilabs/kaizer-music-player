import type { PersistedTrack } from './types.js'

export const DEFAULT_STORAGE_CAPACITY_MB = 30000

interface StorageCapacityContext {
  allTracks: Array<Pick<PersistedTrack, 'id' | 'sizeMb'>>
  downloadedTrackIds: string[]
}

export function getMinimumStorageCapacityMb({
  allTracks,
  downloadedTrackIds,
}: StorageCapacityContext): number {
  const trackSizeMap = new Map(allTracks.map((track) => [track.id, Math.max(0, Number(track.sizeMb) || 0)]))
  const usedStorageMb = downloadedTrackIds.reduce((total, trackId) => total + (trackSizeMap.get(trackId) ?? 0), 0)
  return Math.max(1, Math.ceil(usedStorageMb))
}

export function normalizeStorageCapacityMb(
  value: unknown,
  context: StorageCapacityContext,
): number {
  const rawStorageCapacityMb = Number(value)
  const storageCapacityMb = Number.isFinite(rawStorageCapacityMb) && rawStorageCapacityMb > 0
    ? rawStorageCapacityMb
    : DEFAULT_STORAGE_CAPACITY_MB

  return Math.max(storageCapacityMb, getMinimumStorageCapacityMb(context))
}
