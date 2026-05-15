import { useState } from 'react'
import { CheckCircle2, Download, Play } from 'lucide-react'
import type { Track } from '@/app/types'
import { cn } from '@/lib/cn'
import { MenuDropdown, type MenuDropdownItem } from './MenuDropdown'

type SongRowMode = 'playlist' | 'table'

interface SongRowProps {
  mode: SongRowMode
  track: Track
  actions: MenuDropdownItem[]
  onPlay?: (trackId: string) => void
  onDoubleClickPlay?: (trackId: string) => void
  showAlbumColumn?: boolean
  selected?: boolean
  onToggleSelect?: (trackId: string) => void
  downloadStatus?: 'downloaded' | 'not-downloaded'
}

export function SongRow({
  mode,
  track,
  actions,
  onPlay,
  onDoubleClickPlay,
  showAlbumColumn = true,
  selected = false,
  onToggleSelect,
  downloadStatus,
}: SongRowProps) {
  const [failedCoverUrl, setFailedCoverUrl] = useState('')
  const coverUrl = track.coverUrl ?? ''
  const showImage = coverUrl.length > 0 && failedCoverUrl !== coverUrl
  const artworkToneClass = showImage
    ? 'bg-zinc-900 text-zinc-100'
    : `bg-gradient-to-br ${track.coverTone} text-zinc-700 hover:text-zinc-900`

  if (mode === 'table') {
    return (
      <div className="grid grid-cols-[48px_1.5fr_1fr_1fr_54px] items-center gap-2 border-b border-zinc-800/80 px-2 py-1.5 text-sm last:border-b-0 hover:bg-zinc-900/80">
        <div className="flex items-center justify-center">
          <input
            aria-label={`Select ${track.title}`}
            checked={selected}
            className="h-4 w-4 accent-emerald-400"
            onChange={() => onToggleSelect?.(track.id)}
            type="checkbox"
          />
        </div>

        <span className="truncate font-medium text-zinc-100">{track.title}</span>
        <span className="truncate text-zinc-300">{track.artist}</span>
        <span className="truncate text-zinc-400">{track.album}</span>

        <div className="flex justify-center">
          <MenuDropdown items={actions} label={`Track actions for ${track.title}`} />
        </div>
      </div>
    )
  }

  const playlistGridClassName = showAlbumColumn
    ? 'grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)_32px_56px_36px]'
    : 'grid-cols-[minmax(0,1fr)_32px_56px_36px]'

  return (
    <article
      className={cn(
        'group grid min-h-[62px] items-center gap-3 rounded-md px-3 py-2 text-left transition hover:bg-white/[0.06]',
        playlistGridClassName,
        onDoubleClickPlay && 'cursor-default select-none',
      )}
      onDoubleClick={(event) => {
        if (!onDoubleClickPlay) {
          return
        }

        const target = event.target
        if (target instanceof HTMLElement && target.closest('button, input, [role="menu"], [role="menuitem"]')) {
          return
        }

        onDoubleClickPlay(track.id)
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          aria-label={`Play ${track.title}`}
          className={cn(
            'group/cover relative h-11 w-11 shrink-0 overflow-hidden rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
            artworkToneClass,
          )}
          onClick={() => onPlay?.(track.id)}
          type="button"
        >
          {showImage ? (
            <img
              alt={`Cover art for ${track.title}`}
              className="h-full w-full object-cover brightness-[0.9] contrast-[1.05]"
              loading="lazy"
              onError={() => {
                if (coverUrl) {
                  setFailedCoverUrl(coverUrl)
                }
              }}
              src={coverUrl}
            />
          ) : null}
          <span className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset ring-zinc-900/90" />
          <span className={cn(
            'pointer-events-none absolute inset-0 flex items-center justify-center transition',
            showImage
              ? 'bg-black/0 group-hover/cover:bg-black/45'
              : 'bg-black/10 group-hover/cover:bg-black/20',
          )}
          >
            <Play className={cn(
              'h-4 w-4 fill-current text-zinc-100 opacity-0 transition group-hover/cover:opacity-100',
              !showImage && 'text-zinc-900/80',
            )}
            />
          </span>
        </button>

        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-zinc-100">{track.title}</p>
          <p className="truncate text-sm text-zinc-400">{track.artist}</p>
        </div>
      </div>

      {showAlbumColumn ? (
        <p className="truncate text-sm text-zinc-500">{track.album}</p>
      ) : null}

      <div className="flex items-center justify-center">
        {downloadStatus ? (
          <span
            aria-label={downloadStatus === 'downloaded' ? 'Downloaded locally' : 'Not downloaded'}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center',
              downloadStatus === 'downloaded'
                ? 'text-emerald-400'
                : 'text-zinc-600',
            )}
            title={downloadStatus === 'downloaded' ? 'Downloaded locally' : 'Not downloaded'}
          >
            {downloadStatus === 'downloaded' ? <CheckCircle2 className="h-4.5 w-4.5" /> : <Download className="h-4 w-4" />}
          </span>
        ) : <span className="inline-flex h-8 w-8" />}
      </div>

      <span className="w-14 text-right text-sm tabular-nums text-zinc-500">{track.duration}</span>

      <div className="flex justify-end">
        <MenuDropdown items={actions} label={`Track actions for ${track.title}`} />
      </div>
    </article>
  )
}
