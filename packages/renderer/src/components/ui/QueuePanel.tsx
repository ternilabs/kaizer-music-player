import { createPortal } from 'react-dom'
import { ListMusic } from 'lucide-react'
import type { Track } from '@/app/types'
import { SidePane } from './SidePane'

export const QUEUE_PANEL_PORTAL_TARGET_ID = 'app-shell-queue-panel-root'

interface QueuePanelProps {
  isOpen: boolean
  onClose: () => void
  currentTrack?: Track
  upcomingTracks: Track[]
  onSelectTrack: (trackId: string) => void
}

export function QueuePanel({
  isOpen,
  onClose,
  currentTrack,
  upcomingTracks,
  onSelectTrack,
}: QueuePanelProps) {
  const portalTarget = typeof document !== 'undefined'
    ? document.getElementById(QUEUE_PANEL_PORTAL_TARGET_ID)
    : null

  if (!portalTarget) {
    return null
  }

  return createPortal(
    <SidePane
      bodyClassName="flex min-h-0 flex-col gap-4"
      className="rounded-none"
      footer={(
        <button
          className="ui-btn-secondary w-full px-4 text-zinc-100"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      )}
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={false}
      title="Queue"
    >
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Now playing</p>
        </div>
        {currentTrack ? (
          <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-3">
            <p className="truncate text-sm font-medium text-zinc-100">{currentTrack.title}</p>
            <p className="truncate text-xs text-zinc-400">{currentTrack.artist}</p>
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-zinc-800 bg-zinc-900/60 px-3 py-6 text-center text-sm text-zinc-500">
            No active track in the playlist queue.
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Up next</p>
          <span className="text-xs text-zinc-500">{upcomingTracks.length} track(s)</span>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          {upcomingTracks.length > 0 ? (
            <div className="space-y-1.5">
              {upcomingTracks.map((track) => (
                <button
                  className="flex w-full items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/75 px-3 py-3 text-left transition hover:border-zinc-700 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  key={track.id}
                  onClick={() => onSelectTrack(track.id)}
                  type="button"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-100">{track.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-zinc-500">{track.artist}</span>
                  </span>
                  <ListMusic className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-full items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-900/60 px-3 py-6 text-center text-sm leading-6 text-zinc-500">
              No more tracks remain in this playlist queue.
            </div>
          )}
        </div>
      </div>
    </SidePane>,
    portalTarget,
  )
}
