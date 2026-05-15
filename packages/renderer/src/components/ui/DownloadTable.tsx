import type { Track } from '@/app/types'
import { PlaylistSearchBar } from './PlaylistSearchBar'
import { SongRow } from './SongRow'

interface DownloadTableProps {
  tracks: Track[]
  selectedTrackIds: string[]
  areAllSelected: boolean
  isActionPending?: boolean
  onToggleSelectAll: () => void
  onToggleSelectTrack: (trackId: string) => void
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  onBulkAddToPlaylist: () => void
  onBulkDelete: () => void
  onAddTrackToPlaylist: (trackId: string) => void
  onDeleteTrack: (trackId: string) => void
}

export function DownloadTable({
  tracks,
  selectedTrackIds,
  areAllSelected,
  isActionPending = false,
  onToggleSelectAll,
  onToggleSelectTrack,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  onBulkAddToPlaylist,
  onBulkDelete,
  onAddTrackToPlaylist,
  onDeleteTrack,
}: DownloadTableProps) {
  const hasSelectedRows = selectedTrackIds.length > 0

  return (
    <section className="mt-3 flex min-h-0 flex-1 flex-col">
      <div className="ui-surface-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="min-w-[720px]">
            <div className="sticky top-0 z-10 grid grid-cols-[48px_1.5fr_1fr_1fr_54px] items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <div className="flex items-center justify-center">
                <input
                  aria-label="Select all tracks"
                  checked={areAllSelected}
                  className="h-4 w-4 accent-emerald-400"
                  onChange={onToggleSelectAll}
                  type="checkbox"
                />
              </div>
              <span>Name</span>
              <span>Artist</span>
              <span>Album</span>
              <span className="text-center" />
            </div>

            {tracks.length === 0 ? (
              <div className="ui-empty-state flex min-h-[240px] items-center justify-center border-0 bg-transparent px-4 py-10">
                No downloaded tracks found.
              </div>
            ) : (
              tracks.map((track) => (
                <SongRow
                  actions={[
                    {
                      id: 'add-on-playlist',
                      label: 'Add on a playlist',
                      onSelect: () => onAddTrackToPlaylist(track.id),
                      disabled: isActionPending,
                    },
                    {
                      id: 'delete-track',
                      label: 'Delete',
                      onSelect: () => onDeleteTrack(track.id),
                      tone: 'danger',
                      disabled: isActionPending,
                    },
                  ]}
                  key={track.id}
                  mode="table"
                  onToggleSelect={onToggleSelectTrack}
                  selected={selectedTrackIds.includes(track.id)}
                  track={track}
                />
              ))
            )}
          </div>
        </div>

        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-900/90 px-3 py-2">
          <div className="min-w-0 flex-1">
            <PlaylistSearchBar
              className="min-h-10 w-full !bg-zinc-900/80 sm:w-[320px]"
              onChange={onSearchChange}
              placeholder={searchPlaceholder}
              value={searchValue}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              className="ui-btn-secondary rounded-lg"
              disabled={!hasSelectedRows || isActionPending}
              onClick={onBulkAddToPlaylist}
              type="button"
            >
              Add to playlist
            </button>
            <button
              className="ui-btn-danger rounded-lg"
              disabled={!hasSelectedRows || isActionPending}
              onClick={onBulkDelete}
              type="button"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
