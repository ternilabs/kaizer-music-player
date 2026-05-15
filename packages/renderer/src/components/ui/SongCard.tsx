import { useState } from 'react'
import { Disc3, Play } from 'lucide-react'
import type { Track } from '@/app/types'
import { cn } from '@/lib/cn'
import { MenuDropdown, type MenuDropdownItem } from './MenuDropdown'

interface SongCardProps {
  track: Track
  onPlay: (trackId: string) => void
  onAlbumClick?: (track: Track) => void
  actions: MenuDropdownItem[]
  animationDelayMs?: number
}

export function SongCard({ track, onPlay, onAlbumClick, actions, animationDelayMs = 0 }: SongCardProps) {
  const [failedCoverUrl, setFailedCoverUrl] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const coverUrl = track.coverUrl ?? ''
  const showImage = coverUrl.length > 0 && failedCoverUrl !== coverUrl
  const isHiRes = track.isHiRes === true
  const artworkToneClass = showImage
    ? 'bg-zinc-900 text-zinc-100'
    : `bg-gradient-to-br ${track.coverTone} text-zinc-700 hover:text-zinc-900`

  return (
    <article
      className={cn(
        'animate-card-rise relative rounded-md border border-zinc-800 bg-zinc-800/55 p-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.25)]',
        isMenuOpen ? 'z-40' : 'z-0',
      )}
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      <div className="flex items-start gap-3">
        <button
          aria-label={`Play ${track.title}`}
          className={cn(
            'group relative flex h-[74px] w-[74px] shrink-0 items-center justify-center overflow-hidden rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
            artworkToneClass,
          )}
          onClick={() => onPlay(track.id)}
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
          ) : (
            <Disc3 className="absolute right-1 top-1 h-3.5 w-3.5 text-zinc-600/70" />
          )}
          <span className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset ring-zinc-900/90" />
          <span className={cn('absolute inset-0 flex items-center justify-center transition', showImage ? 'bg-black/25 group-hover:bg-black/35' : 'bg-black/0')}>
            <Play className={cn(
              'h-5 w-5 transition group-hover:scale-110',
              isHiRes
                ? 'text-emerald-300 drop-shadow-[0_0_6px_rgba(16,185,129,0.45)]'
                : showImage
                  ? 'text-zinc-100'
                  : '',
            )}
            />
          </span>
        </button>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-base font-semibold leading-[1.15] tracking-normal text-zinc-100 lg:text-[20px]">
            {track.title}
          </p>
          <p className="mt-1 truncate text-sm leading-none text-zinc-400">{track.artist}</p>
          {track.albumId && onAlbumClick ? (
            <button
              className="mt-1 block max-w-full truncate text-left text-xs leading-none text-zinc-500 transition hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              onClick={() => onAlbumClick(track)}
              title={`View album: ${track.album}`}
              type="button"
            >
              {track.album}
            </button>
          ) : (
            <p className="mt-1 truncate text-xs leading-none text-zinc-500">{track.album}</p>
          )}
        </div>

        <MenuDropdown
          items={actions}
          label={`Track actions for ${track.title}`}
          onOpenChange={setIsMenuOpen}
        />
      </div>
    </article>
  )
}
