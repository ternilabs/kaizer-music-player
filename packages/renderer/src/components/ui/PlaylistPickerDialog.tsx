import { Search } from 'lucide-react'
import { useState } from 'react'
import type { Playlist } from '@/app/types'
import { normalizeFilterTextInput } from '@/lib/inputValidation'
import { cn } from '@/lib/cn'
import { Dialog } from './Dialog'

interface PlaylistPickerDialogProps {
  isOpen: boolean
  playlists: Playlist[]
  trackCount: number
  title?: string
  onCancel: () => void
  onConfirm: (playlistId: string) => void
}

export function PlaylistPickerDialog({
  isOpen,
  playlists,
  trackCount,
  title = 'Add to a playlist',
  onCancel,
  onConfirm,
}: PlaylistPickerDialogProps) {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(playlists[0]?.id ?? '')
  const [query, setQuery] = useState('')

  const normalizedQuery = query.trim().toLowerCase()
  const filteredPlaylists = normalizedQuery
    ? playlists.filter((playlist) => playlist.name.toLowerCase().includes(normalizedQuery))
    : playlists
  const visiblePlaylists = filteredPlaylists.slice(0, 10)
  const hasMoreFilteredPlaylists = filteredPlaylists.length > visiblePlaylists.length

  const normalizedSelectedPlaylistId = visiblePlaylists.some((playlist) => playlist.id === selectedPlaylistId)
    ? selectedPlaylistId
    : (visiblePlaylists[0]?.id ?? '')

  const canSubmit = Boolean(normalizedSelectedPlaylistId) && visiblePlaylists.length > 0

  const resetDialogState = () => {
    setSelectedPlaylistId(playlists[0]?.id ?? '')
    setQuery('')
  }

  return (
    <Dialog
      description={`Choose where to place ${trackCount} selected track${trackCount === 1 ? '' : 's'}.`}
      isOpen={isOpen}
      onClose={() => {
        resetDialogState()
        onCancel()
      }}
      title={title}
      footer={(
        <>
          <button
            className="ui-btn-secondary min-h-11 rounded-lg px-4"
            onClick={() => {
              resetDialogState()
              onCancel()
            }}
            type="button"
          >
            Cancel
          </button>
          <button
            className="ui-btn-primary min-h-11 rounded-lg px-4"
            disabled={!canSubmit}
            onClick={() => {
              resetDialogState()
              onConfirm(normalizedSelectedPlaylistId)
            }}
            type="button"
          >
            Add
          </button>
        </>
      )}
    >
      <div>
        <label className="mb-3 ui-control-search rounded-lg bg-zinc-950 px-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            className="ui-control-input"
            onChange={(event) => setQuery(normalizeFilterTextInput(event.target.value))}
            placeholder="Search playlist"
            value={query}
          />
        </label>

        {hasMoreFilteredPlaylists ? (
          <p className="mb-2 text-xs text-zinc-500">
            Showing first {visiblePlaylists.length} of {filteredPlaylists.length} playlists.
          </p>
        ) : null}
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {playlists.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-4 text-sm text-zinc-500">
            No playlist available for this action.
          </p>
        ) : null}

        {playlists.length > 0 && visiblePlaylists.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-4 text-sm text-zinc-500">
            No playlist matches this search.
          </p>
        ) : null}

        {visiblePlaylists.map((playlist) => {
          const isSelected = playlist.id === normalizedSelectedPlaylistId

          return (
            <label
              className={cn(
                'flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-left transition',
                isSelected
                  ? 'border-emerald-400/60 bg-emerald-500/10'
                  : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500',
              )}
              key={playlist.id}
            >
              <input
                checked={isSelected}
                className="mt-0.5 h-4 w-4 accent-emerald-400"
                name="playlist"
                onChange={() => setSelectedPlaylistId(playlist.id)}
                type="radio"
              />
              <span>
                <span className="block text-sm font-medium text-zinc-100">{playlist.name}</span>
                <span className="block text-xs text-zinc-500">
                  {playlist.trackIds.length} {playlist.trackIds.length === 1 ? 'track' : 'tracks'}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </Dialog>
  )
}
