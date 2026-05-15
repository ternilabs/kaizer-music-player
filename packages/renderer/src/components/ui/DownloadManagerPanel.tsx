import { LoaderCircle, Pause, Play, RotateCcw, Square } from 'lucide-react'
import type { DownloadBatchProgress } from '@/app/appStateContext'
import type { Track } from '@/app/types'
import { cn } from '@/lib/cn'
import { SidePane } from './SidePane'

interface DownloadManagerPanelProps {
  isOpen: boolean
  progress: DownloadBatchProgress
  tracks: Track[]
  onClose: () => void
  onPause: () => void
  onResume: () => void
  onTerminate: () => void
  onRetry: () => void
}

export function DownloadManagerPanel({
  isOpen,
  progress,
  tracks,
  onClose,
  onPause,
  onResume,
  onTerminate,
  onRetry,
}: DownloadManagerPanelProps) {
  const trackMap = new Map(tracks.map((track) => [track.id, track]))
  const currentTrack = progress.currentTrackId ? trackMap.get(progress.currentTrackId) : undefined
  const queuedTracks = progress.queuedTrackIds
    .map((trackId) => trackMap.get(trackId))
    .filter((track): track is Track => Boolean(track))
  const progressPercent = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0
  const canPause = progress.status === 'running'
  const canResume = progress.status === 'paused'
  const canTerminate = progress.status === 'running' || progress.status === 'paused' || progress.status === 'terminating'
  const canRetry = (progress.status === 'terminated' || progress.status === 'completed')
    && progress.retryableTrackIds.length > 0
  const isIdle = progress.total === 0 && progress.status === 'idle'
  const statusTitle = isIdle
    ? 'Ready to download'
    : progress.status === 'running'
      ? 'Downloading now'
      : progress.status === 'paused'
        ? 'Queue paused'
        : progress.status === 'terminating'
          ? 'Stopping queue'
          : progress.status === 'terminated'
            ? 'Queue terminated'
            : 'Latest queue summary'
  const currentTrackDescription = currentTrack
    ? null
    : progress.status === 'running' || progress.status === 'terminating'
      ? 'Preparing the next track...' : 'No track is currently downloading.'
  const actionButtons = [
    canPause ? (
      <button
        className="ui-btn-secondary w-full px-4 text-zinc-100"
        key="pause"
        onClick={onPause}
        type="button"
      >
        <span className="inline-flex items-center gap-2">
          <Pause className="h-4 w-4" />
          Pause
        </span>
      </button>
    ) : null,
    canResume ? (
      <button
        className="ui-btn-primary w-full px-4"
        key="resume"
        onClick={onResume}
        type="button"
      >
        <span className="inline-flex items-center gap-2">
          <Play className="h-4 w-4" />
          Start
        </span>
      </button>
    ) : null,
    canTerminate ? (
      <button
        className="ui-btn-danger w-full px-4"
        disabled={progress.status === 'terminating'}
        key="terminate"
        onClick={() => {
          void onTerminate()
        }}
        type="button"
      >
        <span className="inline-flex items-center gap-2">
          {progress.status === 'terminating' ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          {progress.status === 'terminating' ? 'Stopping...' : 'Stop'}
        </span>
      </button>
    ) : null,
    canRetry ? (
      <button
        className="ui-btn-primary min-w-[120px] flex-1 px-4"
        key="retry"
        onClick={onRetry}
        type="button"
      >
        <span className="inline-flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          Retry
        </span>
      </button>
    ) : null,
  ].filter(Boolean)
  const footerGridClassName = actionButtons.length === 0
    ? 'grid-cols-1'
    : actionButtons.length === 1
      ? 'grid-cols-2'
      : 'grid-cols-3'
  const footerActions = [
    ...actionButtons,
    (
      <button
        className="ui-btn-secondary w-full px-4 text-zinc-100"
        key="close"
        onClick={onClose}
        type="button"
      >
        Close
      </button>
    ),
  ]

  return (
    <SidePane
      bodyClassName="flex min-h-0 flex-col gap-4"
      className="rounded-none"
      footer={(
        <div className={cn('grid w-full gap-3', footerGridClassName)}>
          {footerActions}
        </div>
      )}
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={false}
      title="Download Manager"
    >
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="font-medium text-zinc-100">{statusTitle}</p>
          <span className="text-xs text-zinc-400">
            {progress.completed}/{progress.total}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-300">
          <div className="flex flex-col items-start">
            <span>Downloaded: {progress.downloaded}</span>
            <span className={progress.failedTrackIds.length > 0 ? 'text-rose-300' : ''}>
              Failed: {progress.failedTrackIds.length}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span>Skipped: {progress.alreadyDownloaded}</span>
            <span>Queued: {progress.queuedTrackIds.length}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Current track</p>
        {currentTrack ? (
          <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-3">
            <p className="truncate text-sm font-medium text-zinc-100">{currentTrack.title}</p>
            <p className="truncate text-xs text-zinc-500">{currentTrack.artist}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-zinc-500">{currentTrackDescription}</p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Remaining queue</p>
          <span className="text-xs text-zinc-500">{queuedTracks.length} track(s)</span>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          {queuedTracks.length > 0 ? (
            <div className="space-y-1.5">
              {queuedTracks.map((track) => (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/75 px-3 py-2" key={track.id}>
                  <p className="truncate text-sm text-zinc-100">{track.title}</p>
                  <p className="truncate text-xs text-zinc-500">{track.artist}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-full flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-900/75 px-3 py-6 text-center text-sm leading-6 text-zinc-500">
              <span>No remaining tracks in the queue.</span>
            </div>
          )}
        </div>
      </div>
    </SidePane>
  )
}
