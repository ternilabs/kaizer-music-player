import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { SidePane } from './SidePane'

export const LYRICS_PANEL_PORTAL_TARGET_ID = 'app-shell-lyrics-panel-root'

interface LyricsPanelProps {
  isOpen: boolean
  onClose: () => void
  title: string
  artist: string
  isLoading: boolean
  plainLyrics: string
  syncedLyrics: string
  hasLyrics: boolean
  currentTimeSeconds: number
}

interface SyncedLyricLine {
  id: string
  timeSeconds: number
  text: string
}

function scrollLyricLineIntoView(line: HTMLElement | null) {
  if (!line) {
    return
  }

  line.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
  })
}

function parseSyncedLyrics(input: string): SyncedLyricLine[] {
  return input
    .split('\n')
    .flatMap((rawLine, lineIndex) => {
      const matches = Array.from(rawLine.matchAll(/\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g))
      if (matches.length === 0) {
        return []
      }

      const text = rawLine.replace(/\[[^\]]+\]/g, '').trim() || '...'

      return matches.map((match, matchIndex) => {
        const minutes = Number(match[1] ?? 0)
        const seconds = Number(match[2] ?? 0)
        const fractionText = match[3] ?? '0'
        const fraction = Number(`0.${fractionText.padEnd(3, '0')}`)

        return {
          id: `${lineIndex}-${matchIndex}-${minutes}-${seconds}-${fractionText}`,
          timeSeconds: minutes * 60 + seconds + fraction,
          text,
        }
      })
    })
}

function findActiveLineIndex(lines: SyncedLyricLine[], currentTimeSeconds: number): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (currentTimeSeconds + 0.12 >= line.timeSeconds) {
      return index
    }
  }

  return -1
}

export function LyricsPanel({
  isOpen,
  onClose,
  title,
  artist,
  isLoading,
  plainLyrics,
  syncedLyrics,
  hasLyrics,
  currentTimeSeconds,
}: LyricsPanelProps) {
  const syncedLines = useMemo(() => parseSyncedLyrics(syncedLyrics), [syncedLyrics])
  const hasSyncedLyrics = syncedLines.length > 0
  const activeLineIndex = hasSyncedLyrics ? findActiveLineIndex(syncedLines, currentTimeSeconds) : -1
  const activeLineRef = useRef<HTMLParagraphElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const footer = (
    <button
      className="ui-btn-secondary w-full px-4 text-zinc-100"
      onClick={onClose}
      type="button"
    >
      Close
    </button>
  )
  const portalTarget = typeof document !== 'undefined'
    ? document.getElementById(LYRICS_PANEL_PORTAL_TARGET_ID)
    : null

  useEffect(() => {
    if (!isOpen) {
      return
    }

    scrollContainerRef.current?.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }, [artist, isOpen, plainLyrics, syncedLyrics, title])

  useEffect(() => {
    if (!isOpen || !hasSyncedLyrics || activeLineIndex < 0) {
      return
    }

    scrollLyricLineIntoView(activeLineRef.current)
  }, [activeLineIndex, hasSyncedLyrics, isOpen])

  if (!portalTarget) {
    return null
  }

  return createPortal(
    <SidePane
      bodyClassName="flex min-h-0 flex-col"
      className="rounded-none"
      description={artist}
      footer={footer}
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={false}
      title={title || 'Lyrics'}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {isLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <LoaderCircle className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        ) : !hasLyrics ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-1 text-left text-sm leading-7 text-zinc-500">
            Lyrics do not exist for this track.
          </div>
        ) : hasSyncedLyrics ? (
          <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto pr-2" ref={scrollContainerRef}>
            <div className="space-y-4 pb-4">
              {syncedLines.map((line, index) => {
                const isActive = index === activeLineIndex

                return (
                  <p
                    className={cn(
                      'px-1 text-left text-lg leading-9 text-zinc-500 transition duration-200',
                      isActive && 'font-semibold text-zinc-100',
                      index < activeLineIndex && 'text-zinc-400',
                    )}
                    key={line.id}
                    ref={isActive ? activeLineRef : null}
                  >
                    {line.text}
                  </p>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto pr-2" ref={scrollContainerRef}>
            <pre className="whitespace-pre-wrap px-1 text-left font-inherit text-base leading-8 text-zinc-200">
              {plainLyrics}
            </pre>
          </div>
        )}

        <p className="border-t border-zinc-800/70 pt-3 text-xs text-zinc-500">
          Lyrics provided by LRCLIB.
        </p>
      </div>
    </SidePane>,
    portalTarget,
  )
}
