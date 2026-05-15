import { Download, LoaderCircle, Play } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Dialog } from './Dialog'

export interface AlbumDetailsTrack {
  id: string
  title: string
  artist: string
  duration: string
  isHiRes: boolean
}

export interface AlbumDetailsData {
  id: string
  title: string
  artist: string
  coverUrl?: string
  releaseDate?: string
  trackCount: number
  tracks: AlbumDetailsTrack[]
}

interface AlbumDetailsDialogProps {
  isOpen: boolean
  isLoading: boolean
  error?: string
  album?: AlbumDetailsData
  onPlayTrack?: (track: AlbumDetailsTrack) => void
  onDownloadTrack?: (track: AlbumDetailsTrack) => void
  onDownloadAll?: () => void
  isDownloadAllPending?: boolean
  onClose: () => void
}

export function AlbumDetailsDialog({
  isOpen,
  isLoading,
  error,
  album,
  onPlayTrack,
  onDownloadTrack,
  onDownloadAll,
  isDownloadAllPending = false,
  onClose,
}: AlbumDetailsDialogProps) {
  return (
    <Dialog
      hideHeader
      isOpen={isOpen}
      maxWidthClassName="max-w-3xl"
      onClose={onClose}
      title=""
      footer={(
        <button
          className="ui-btn-secondary min-h-11 rounded-lg px-4"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      )}
    >
      {isLoading ? (
        <div className="flex min-h-56 items-center justify-center">
          <LoaderCircle className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {!isLoading && !error && album ? (
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-800 ring-1 ring-inset ring-zinc-700/80">
                {album.coverUrl ? (
                  <img
                    alt={`Album cover for ${album.title}`}
                    className="h-full w-full object-cover"
                    src={album.coverUrl}
                  />
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold text-zinc-100">{album.title}</p>
                <p className="truncate text-sm text-zinc-300">{album.artist}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {album.trackCount} {album.trackCount === 1 ? 'track' : 'tracks'}
                  {album.releaseDate ? ` · ${album.releaseDate}` : ''}
                </p>
              </div>
            </div>
            <div className="shrink-0 self-start pt-0.5">
              <button
                className="ui-btn-secondary min-h-9 px-3 text-xs font-semibold text-zinc-100"
                disabled={!onDownloadAll || isDownloadAllPending}
                onClick={onDownloadAll}
                type="button"
              >
                {isDownloadAllPending ? (
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    Downloading...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Download className="h-3.5 w-3.5" />
                    Download all
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="mt-4 max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
            {album.tracks.length === 0 ? (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-4 text-sm text-zinc-500">
                No tracks returned for this album.
              </div>
            ) : null}

            {album.tracks.map((track, index) => (
              <div
                className="grid grid-cols-[34px_1fr_30px_56px_40px] items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2"
                key={`${track.id}-${index}`}
              >
                <button
                  aria-label={`Play ${track.title}`}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  disabled={!onPlayTrack}
                  onClick={() => onPlayTrack?.(track)}
                  title={`Play ${track.title}`}
                  type="button"
                >
                  <Play className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">{track.title}</p>
                  <p className="truncate text-xs text-zinc-500">{track.artist}</p>
                </div>
                <button
                  aria-label={`Download ${track.title}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!onDownloadTrack}
                  onClick={() => onDownloadTrack?.(track)}
                  title={`Download ${track.title}`}
                  type="button"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                <div className="flex w-[56px] justify-end">
                  <span
                    className={cn(
                      'inline-flex h-5 min-w-[52px] items-center justify-center rounded bg-emerald-500/15 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300',
                      !track.isHiRes && 'invisible',
                    )}
                  >
                    Hi-Res
                  </span>
                </div>
                <span className="inline-flex w-[40px] items-center justify-end text-right font-mono text-xs tabular-nums text-zinc-400">
                  {track.duration}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}
