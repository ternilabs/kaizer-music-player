import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { send } from '@app/preload'
import { ArrowDownToLine, ListMusic, LoaderCircle, Pause, Play, Repeat, ScrollText, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import type { PreferredServerId, Track } from '@/app/types'
import { useAppState } from '@/app/appStateContext'
import { LyricsPanel } from '@/components/ui/LyricsPanel'
import { QueuePanel } from '@/components/ui/QueuePanel'
import { cn } from '@/lib/cn'
import type { ActivePlayerPane } from './AppShell'

interface RemoteStreamResponse {
  version: string
  sourceServerId: string
  fallbackUsed: boolean
  data: {
    url: string
  }
}

interface LocalStreamResponse {
  exists: boolean
  url?: string
}

interface LyricsResponse {
  found: boolean
  plainLyrics: string
  syncedLyrics: string
  instrumental: boolean
}

type RepeatMode = 'off' | 'all' | 'one'

function parseDurationLabel(label?: string): number {
  if (!label) {
    return 0
  }

  const [minutesText, secondsText] = label.split(':')
  const minutes = Number(minutesText)
  const seconds = Number(secondsText)

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return 0
  }

  return Math.max(0, minutes * 60 + seconds)
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00'
  }

  const roundedSeconds = Math.floor(seconds)
  const minutes = Math.floor(roundedSeconds / 60)
  const remainder = roundedSeconds % 60

  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function getStreamTarget(trackId: string): { provider: 'atlas' | 'orion' | 'helios'; sourceTrackId: string; quality?: string } | undefined {
  if (trackId.startsWith('atlas:')) {
    return {
      provider: 'atlas',
      sourceTrackId: trackId.slice('atlas:'.length),
    }
  }

  if (trackId.startsWith('orion:')) {
    return {
      provider: 'orion',
      sourceTrackId: trackId.slice('orion:'.length),
    }
  }

  if (trackId.startsWith('helios:')) {
    const rawTrackPayload = trackId.slice('helios:'.length)
    const [sourceTrackId, ...qualityParts] = rawTrackPayload.split(':')
    const rawQuality = qualityParts.join(':')

    return {
      provider: 'helios',
      sourceTrackId: sourceTrackId.trim(),
      quality: rawQuality ? decodeURIComponent(rawQuality) : undefined,
    }
  }

  return undefined
}

function getStreamingProviderName(track?: Track): string {
  if (!track) {
    return 'Selected source'
  }

  if (track.sourceServerId?.startsWith('atlas')) {
    return 'Atlas'
  }

  if (track.sourceServerId?.startsWith('orion')) {
    return 'Orion'
  }

  if (track.sourceServerId?.startsWith('helios')) {
    return 'Helios'
  }

  if (track.id.startsWith('atlas:')) {
    return 'Atlas'
  }

  if (track.id.startsWith('orion:')) {
    return 'Orion'
  }

  if (track.id.startsWith('helios:')) {
    return 'Helios'
  }

  return 'Selected source'
}

function getPreferredServerBadgeLabel(serverId: PreferredServerId): 'Atlas' | 'Orion' | 'Helios' | null {
  if (serverId.startsWith('atlas')) {
    return 'Atlas'
  }

  if (serverId.startsWith('orion')) {
    return 'Orion'
  }

  if (serverId.startsWith('helios')) {
    return 'Helios'
  }

  return null
}

async function fetchLyrics(input: {
  artistName: string
  trackName: string
  albumName: string
}): Promise<LyricsResponse> {
  return send('lyrics:get', input) as Promise<LyricsResponse>
}

const DEFAULT_VOLUME = 0.4
const MAX_STREAM_CACHE_ENTRIES = 180
const LYRICS_QUERY_STALE_TIME_MS = 30 * 60 * 1000
const LYRICS_QUERY_GC_TIME_MS = 60 * 60 * 1000
const PREVIOUS_TRACK_RESTART_THRESHOLD_SECONDS = 2

function shuffleTrackIds(trackIds: string[]): string[] {
  const nextTrackIds = [...trackIds]

  for (let index = nextTrackIds.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const currentValue = nextTrackIds[index]
    nextTrackIds[index] = nextTrackIds[randomIndex]
    nextTrackIds[randomIndex] = currentValue
  }

  return nextTrackIds
}

function buildShuffledQueue(
  currentOrder: string[],
  nextQueueTrackIds: string[],
): string[] {
  const preservedTrackIds = currentOrder.filter((trackId) => nextQueueTrackIds.includes(trackId))
  const missingTrackIds = nextQueueTrackIds.filter((trackId) => !preservedTrackIds.includes(trackId))
  return [...preservedTrackIds, ...shuffleTrackIds(missingTrackIds)]
}

function buildAnchoredShuffledQueue(
  currentOrder: string[],
  nextQueueTrackIds: string[],
  activeTrackId?: string,
): string[] {
  if (!activeTrackId || !nextQueueTrackIds.includes(activeTrackId)) {
    return buildShuffledQueue(currentOrder, nextQueueTrackIds)
  }

  const remainingTrackIds = nextQueueTrackIds.filter((trackId) => trackId !== activeTrackId)
  const preservedTrackIds = currentOrder.filter((trackId) => remainingTrackIds.includes(trackId))
  const missingTrackIds = remainingTrackIds.filter((trackId) => !preservedTrackIds.includes(trackId))

  return [activeTrackId, ...preservedTrackIds, ...shuffleTrackIds(missingTrackIds)]
}

interface PlayerBarProps {
  activePlayerPane: ActivePlayerPane
  onActivePlayerPaneChange: (pane: ActivePlayerPane) => void
}

export function PlayerBar({ activePlayerPane, onActivePlayerPaneChange }: PlayerBarProps) {
  const {
    activeTrack,
    activeTrackSelectionNonce,
    allTracks,
    downloadBatchProgress,
    playbackShuffleEnabled,
    playbackQueueTrackIds,
    playbackQueuePlaylistId,
    playlists,
    preferredServerId,
    setActiveTrack,
    setPlaybackShuffleEnabled,
  } = useAppState()
  const [failedCoverUrl, setFailedCoverUrl] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isStreamLoading, setIsStreamLoading] = useState(false)
  const [streamError, setStreamError] = useState('')
  const [streamInfo, setStreamInfo] = useState('')
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [volume, setVolume] = useState(DEFAULT_VOLUME)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off')
  const [shuffledQueueTrackIds, setShuffledQueueTrackIds] = useState<string[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const streamRequestIdRef = useRef(0)
  const streamCacheRef = useRef<Record<string, string>>({})
  const streamSourceServerCacheRef = useRef<Record<string, string>>({})
  const streamCacheOrderRef = useRef<string[]>([])
  const queueNavigationTargetTrackIdRef = useRef<string>('')
  const previousVolumeRef = useRef(DEFAULT_VOLUME)
  const coverUrl = activeTrack?.coverUrl ?? ''
  const showCoverImage = coverUrl.length > 0 && failedCoverUrl !== coverUrl
  const hasActiveTrack = Boolean(activeTrack)
  const isPlayerIdle = !hasActiveTrack
  const isShuffleEnabled = playbackShuffleEnabled
  const hasPlaylistQueueContext = playbackQueuePlaylistId.trim().length > 0
  const canUseShuffledQueue = hasPlaylistQueueContext && isShuffleEnabled && shuffledQueueTrackIds.length > 0
  const navigationQueueTrackIds = canUseShuffledQueue ? shuffledQueueTrackIds : playbackQueueTrackIds
  const navigationQueueTracks = navigationQueueTrackIds
    .map((trackId) => allTracks.find((track) => track.id === trackId))
    .filter((track): track is Track => Boolean(track))
  const canNavigateQueue = hasActiveTrack && navigationQueueTracks.length > 1
  const queueSignature = playbackQueueTrackIds.join('|')
  const sourceQueueSignature = playbackQueuePlaylistId
    ? (playlists.find((playlist) => playlist.id === playbackQueuePlaylistId)?.trackIds ?? []).join('|')
    : ''
  const preferredServerBadgeLabel = getPreferredServerBadgeLabel(preferredServerId)
  const hasLyricsTrack = Boolean(activeTrack?.title && activeTrack?.artist)
  const isLyricsPanelOpen = activePlayerPane === 'lyrics'
  const isLyricsHighlighted = isLyricsPanelOpen
  const hasPlaylistQueue = hasPlaylistQueueContext && navigationQueueTracks.length > 0
  const isQueuePanelOpen = activePlayerPane === 'queue'
  const isQueueHighlighted = isQueuePanelOpen
  const isDownloadManagerRunning = downloadBatchProgress.status === 'running'
  const isDownloadManagerOpen = activePlayerPane === 'downloads'
  const isDownloadManagerHighlighted = isDownloadManagerOpen || isDownloadManagerRunning
  const activeQueueTrackIndex = activeTrack
    ? navigationQueueTracks.findIndex((track) => track.id === activeTrack.id)
    : -1
  const hasPreviousTrack = activeQueueTrackIndex > 0
  const hasNextTrack = activeQueueTrackIndex >= 0 && activeQueueTrackIndex < navigationQueueTracks.length - 1
  const lyricsQuery = useQuery({
    queryKey: ['lyrics', activeTrack?.title ?? '', activeTrack?.artist ?? '', activeTrack?.album ?? ''],
    queryFn: () => fetchLyrics({
      artistName: activeTrack?.artist ?? '',
      trackName: activeTrack?.title ?? '',
      albumName: activeTrack?.album ?? '',
    }),
    enabled: hasLyricsTrack,
    staleTime: LYRICS_QUERY_STALE_TIME_MS,
    gcTime: LYRICS_QUERY_GC_TIME_MS,
    retry: false,
    networkMode: 'always',
  })

  useEffect(() => {
    if (!activeTrack && (activePlayerPane === 'lyrics' || activePlayerPane === 'queue')) {
      onActivePlayerPaneChange(null)
    }
  }, [activePlayerPane, activeTrack, onActivePlayerPaneChange])

  useEffect(() => {
    if (!hasPlaylistQueue && activePlayerPane === 'queue') {
      onActivePlayerPaneChange(null)
    }
  }, [activePlayerPane, hasPlaylistQueue, onActivePlayerPaneChange])

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.volume = DEFAULT_VOLUME
    audioRef.current = audio

    const onTimeUpdate = () => {
      setCurrentTimeSeconds(audio.currentTime || 0)
    }

    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationSeconds(audio.duration)
      }
    }

    const onPlay = () => {
      setIsPlaying(true)
    }

    const onPause = () => {
      setIsPlaying(false)
    }

    const onError = () => {
      setStreamError('Failed to stream this track.')
      setIsStreamLoading(false)
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('error', onError)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('error', onError)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    audio.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    audio.loop = repeatMode === 'one'
  }, [repeatMode])

  useEffect(() => {
    let frameId: number | null = null

    if (!hasPlaylistQueueContext || !isShuffleEnabled || playbackQueueTrackIds.length <= 1) {
      queueNavigationTargetTrackIdRef.current = ''
      if (shuffledQueueTrackIds.length > 0) {
        frameId = window.requestAnimationFrame(() => {
          setShuffledQueueTrackIds([])
        })
      }

      return () => {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId)
        }
      }
    }

    const uniqueTrackIds = playbackQueueTrackIds.filter((trackId, index, trackIds) =>
      trackId.length > 0 && trackIds.indexOf(trackId) === index)

    const activeTrackId = activeTrack?.id ?? ''
    const isInternalQueueNavigation = queueNavigationTargetTrackIdRef.current === activeTrackId

    if (uniqueTrackIds.length > 1 && isInternalQueueNavigation && shuffledQueueTrackIds.length > 0) {
      if (queueSignature === sourceQueueSignature) {
        queueNavigationTargetTrackIdRef.current = ''
      }
      return
    }

    if (uniqueTrackIds.length <= 1) {
      queueNavigationTargetTrackIdRef.current = ''
      frameId = window.requestAnimationFrame(() => {
        setShuffledQueueTrackIds(uniqueTrackIds)
      })

      return () => {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId)
        }
      }
    }

    frameId = window.requestAnimationFrame(() => {
      setShuffledQueueTrackIds((prevTrackIds) => {
        const nextTrackIds = buildAnchoredShuffledQueue(prevTrackIds, uniqueTrackIds, activeTrackId)

        if (
          prevTrackIds.length === nextTrackIds.length
          && prevTrackIds.every((trackId, index) => trackId === nextTrackIds[index])
        ) {
          return prevTrackIds
        }

        return nextTrackIds
      })
    })

    queueNavigationTargetTrackIdRef.current = ''

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [activeTrack?.id, hasPlaylistQueueContext, isShuffleEnabled, playbackQueueTrackIds, playlists, queueSignature, shuffledQueueTrackIds.length, sourceQueueSignature])

  const moveToQueueTrack = useCallback((nextIndex: number) => {
    if (!activeTrack) {
      return
    }

    if (navigationQueueTracks.length <= 1) {
      return
    }
    const nextTrack = navigationQueueTracks[nextIndex]

    if (!nextTrack) {
      return
    }

    queueNavigationTargetTrackIdRef.current = nextTrack.id
    setActiveTrack(nextTrack.id, {
      queueTrackIds: navigationQueueTrackIds,
      queuePlaylistId: playbackQueuePlaylistId || undefined,
    })
  }, [activeTrack, navigationQueueTrackIds, navigationQueueTracks, playbackQueuePlaylistId, setActiveTrack])

  const handleNextTrack = useCallback(() => {
    if (!activeTrack || navigationQueueTracks.length <= 1) {
      return
    }

    if (hasNextTrack) {
      moveToQueueTrack(activeQueueTrackIndex + 1)
      return
    }

    if (repeatMode === 'all') {
      moveToQueueTrack(0)
    }
  }, [activeQueueTrackIndex, activeTrack, hasNextTrack, moveToQueueTrack, navigationQueueTracks.length, repeatMode])

  const handlePreviousTrack = useCallback(() => {
    if (!activeTrack) {
      return
    }

    const audio = audioRef.current
    if (!audio) {
      return
    }

    if (audio.currentTime > PREVIOUS_TRACK_RESTART_THRESHOLD_SECONDS) {
      audio.currentTime = 0
      setCurrentTimeSeconds(0)
      return
    }

    if (hasPreviousTrack) {
      moveToQueueTrack(activeQueueTrackIndex - 1)
      return
    }

    if (repeatMode === 'all' && navigationQueueTracks.length > 1) {
      moveToQueueTrack(navigationQueueTracks.length - 1)
      return
    }

    audio.currentTime = 0
    setCurrentTimeSeconds(0)
  }, [activeQueueTrackIndex, activeTrack, hasPreviousTrack, moveToQueueTrack, navigationQueueTracks.length, repeatMode])

  const setCachedStream = useCallback((trackId: string, streamUrl: string, sourceServerId: string) => {
    streamCacheRef.current[trackId] = streamUrl
    streamSourceServerCacheRef.current[trackId] = sourceServerId

    streamCacheOrderRef.current = [
      ...streamCacheOrderRef.current.filter((cachedTrackId) => cachedTrackId !== trackId),
      trackId,
    ]

    while (streamCacheOrderRef.current.length > MAX_STREAM_CACHE_ENTRIES) {
      const oldestTrackId = streamCacheOrderRef.current.shift()
      if (!oldestTrackId) {
        break
      }

      delete streamCacheRef.current[oldestTrackId]
      delete streamSourceServerCacheRef.current[oldestTrackId]
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    const onEnded = () => {
      if (repeatMode === 'one') {
        return
      }

      if (hasNextTrack) {
        handleNextTrack()
        return
      }

      if (repeatMode === 'all' && canNavigateQueue) {
        moveToQueueTrack(0)
        return
      }

      setIsPlaying(false)
    }

    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('ended', onEnded)
    }
  }, [canNavigateQueue, handleNextTrack, hasNextTrack, moveToQueueTrack, repeatMode])

  const startStreamForTrack = useCallback((track: Track, autoplay: boolean) => {
    const streamTarget = getStreamTarget(track.id)
    const streamChannel = streamTarget?.provider === 'orion'
      ? 'orion-main:get-stream'
      : streamTarget?.provider === 'helios'
        ? 'helios-main:get-stream'
        : 'atlas-main:get-stream'
    const providerName = streamTarget?.provider === 'orion'
      ? 'Orion'
      : streamTarget?.provider === 'helios'
        ? 'Helios'
        : 'Atlas'
    const shouldUseCache = streamTarget
      ? streamTarget.provider !== 'helios'
      : false

    const applyStreamUrl = (url: string) => {
      const audio = audioRef.current
      if (!audio) {
        return
      }

      const hasSameSource = audio.src === url
      if (!hasSameSource) {
        audio.src = url
        audio.load()
      }

      if (!autoplay) {
        return
      }

      if (hasSameSource) {
        // Re-selecting the same track should restart playback from the beginning.
        audio.currentTime = 0
      }

      void audio.play().catch(() => {
        setStreamError('Unable to start playback.')
      })
    }

    const requestId = streamRequestIdRef.current + 1
    streamRequestIdRef.current = requestId

    setIsStreamLoading(true)
    setStreamError('')
    setStreamInfo('')

    void (send('downloads:get-local-stream', {
      trackId: track.id,
    }) as Promise<LocalStreamResponse>)
      .then((response) => {
        if (streamRequestIdRef.current !== requestId) {
          return
        }

        if (response.exists && response.url) {
          setStreamInfo('Streaming locally')
          applyStreamUrl(response.url)
          return
        }

        if (!streamTarget) {
          setStreamError('This track is not stream-ready yet.')
          return
        }

        const cachedStreamUrl = shouldUseCache ? streamCacheRef.current[track.id] : undefined
        if (cachedStreamUrl) {
          const cachedSourceServerId = streamSourceServerCacheRef.current[track.id]
          setStreamInfo(
            cachedSourceServerId
              ? `Streaming with ${providerName} (${cachedSourceServerId})`
              : `Streaming with ${providerName}`,
          )
          applyStreamUrl(cachedStreamUrl)
          return
        }

        return (send(streamChannel, {
          trackId: streamTarget.sourceTrackId,
          quality: streamTarget.quality,
        }) as Promise<RemoteStreamResponse>)
          .then((remoteResponse) => {
            if (streamRequestIdRef.current !== requestId) {
              return
            }

            const streamUrl = remoteResponse.data.url.trim()
            if (!streamUrl) {
              setStreamError('The selected provider returned an empty stream URL.')
              return
            }

            if (shouldUseCache) {
              setCachedStream(track.id, streamUrl, remoteResponse.sourceServerId)
            }

            setStreamInfo(`Streaming with ${providerName} (${remoteResponse.sourceServerId})`)

            applyStreamUrl(streamUrl)
          })
      })
      .catch((error) => {
        if (streamRequestIdRef.current !== requestId) {
          return
        }

        const message = error instanceof Error ? error.message : 'Unable to load stream URL.'
        setStreamError(message)
      })
      .finally(() => {
        if (streamRequestIdRef.current === requestId) {
          setIsStreamLoading(false)
        }
      })
  }, [setCachedStream])

  useEffect(() => {
    const audio = audioRef.current
    setCurrentTimeSeconds(0)
    setDurationSeconds(parseDurationLabel(activeTrack?.duration))
    setStreamError('')
    setStreamInfo('')
    setIsPlaying(false)

    if (!audio) {
      return
    }

    audio.pause()

    if (!activeTrack) {
      streamRequestIdRef.current += 1
      audio.removeAttribute('src')
      audio.load()
      return
    }

    startStreamForTrack(activeTrack, true)
  }, [activeTrack, activeTrackSelectionNonce, startStreamForTrack])

  const handleTogglePlay = () => {
    if (!activeTrack) {
      return
    }

    const audio = audioRef.current
    if (!audio) {
      return
    }

    if (isPlaying) {
      audio.pause()
      return
    }

    if (audio.src) {
      void audio.play().catch(() => {
        setStreamError('Unable to resume playback.')
      })
      return
    }

    startStreamForTrack(activeTrack, true)
  }

  const handleSeek = (nextValue: number) => {
    const audio = audioRef.current
    if (!audio || durationSeconds <= 0) {
      return
    }

    const boundedValue = Math.min(1000, Math.max(0, nextValue))
    const nextTime = (durationSeconds * boundedValue) / 1000
    audio.currentTime = nextTime
    setCurrentTimeSeconds(nextTime)
  }

  const setPlayerVolume = (nextValue: number) => {
    const boundedValue = Math.min(1, Math.max(0, nextValue))

    if (boundedValue > 0) {
      previousVolumeRef.current = boundedValue
    }

    setVolume(boundedValue)
  }

  const handleTogglePane = (pane: Exclude<ActivePlayerPane, null>) => {
    onActivePlayerPaneChange(activePlayerPane === pane ? null : pane)
  }

  const handleToggleMute = () => {
    if (volume > 0) {
      previousVolumeRef.current = volume
      setVolume(0)
      return
    }

    setPlayerVolume(previousVolumeRef.current > 0 ? previousVolumeRef.current : DEFAULT_VOLUME)
  }

  const progressValue = durationSeconds > 0
    ? Math.round((currentTimeSeconds / durationSeconds) * 1000)
    : 0
  const progressPercentage = Math.min(100, Math.max(0, (progressValue / 1000) * 100))
  const volumePercentage = Math.min(100, Math.max(0, volume * 100))
  const isMuted = volume === 0
  const progressRangeStyle = {
    '--range-fill-percentage': `${progressPercentage}%`,
  } as CSSProperties
  const volumeRangeStyle = {
    '--range-fill-percentage': `${volumePercentage}%`,
  } as CSSProperties
  const elapsedLabel = hasActiveTrack ? formatClock(currentTimeSeconds) : '-:--'
  const durationLabel = hasActiveTrack
    ? durationSeconds > 0
      ? formatClock(durationSeconds)
      : activeTrack?.duration ?? '-:--'
    : '-:--'

  const streamStatusText = streamError
    ? streamError
    : isStreamLoading
      ? 'Loading stream...'
      : streamInfo || `Streaming with ${getStreamingProviderName(activeTrack)}`

  const streamStatusToneClass = streamError ? 'text-rose-400' : streamInfo ? 'text-emerald-300/90' : 'text-zinc-500'
  const repeatButtonLabel = repeatMode === 'off'
    ? 'Enable playlist loop'
    : repeatMode === 'all'
      ? 'Enable single-track loop'
      : 'Disable repeat'
  const isRepeatTrackEnabled = repeatMode === 'one'
  const lyricsData = lyricsQuery.data
  const hasLyrics = Boolean(lyricsData?.found)
  const currentQueueTrack = activeQueueTrackIndex >= 0 ? navigationQueueTracks[activeQueueTrackIndex] : activeTrack
  const upcomingQueueTracks = activeQueueTrackIndex >= 0
    ? navigationQueueTracks.slice(activeQueueTrackIndex + 1)
    : []

  return (
    <>
      <footer className="app-player shrink-0 px-3 pb-3 pt-1 lg:px-4 lg:pb-4 xl:px-5 2xl:px-8 2xl:pb-5">
        <div className="flex w-full flex-col gap-3 pt-2 sm:px-1 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,520px)_minmax(0,1fr)] lg:items-end lg:gap-4">
          {isPlayerIdle ? (
            <div className="flex min-w-0 items-center gap-3 lg:justify-self-start">
              <div className="h-16 w-16 shrink-0 rounded-md border border-zinc-800 bg-zinc-900/80" />
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="truncate text-base font-medium text-zinc-200">
                  No selected music to stream
                </p>
                <p className="truncate text-xs text-zinc-500">
                  Pick a track to start playback.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-3 lg:justify-self-start">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-zinc-100 to-zinc-300">
                {showCoverImage ? (
                  <img
                    alt={`Cover art for ${activeTrack?.title ?? 'track'}`}
                    className="h-full w-full object-cover"
                    onError={() => {
                      if (coverUrl) {
                        setFailedCoverUrl(coverUrl)
                      }
                    }}
                    src={coverUrl}
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="app-player__title truncate text-xl font-semibold leading-[1.12] tracking-[-0.015em] text-zinc-100 xl:text-2xl">
                  {activeTrack?.title}
                </p>
                <p className="truncate text-sm text-zinc-400">{activeTrack?.artist}</p>
                <p className={cn('truncate text-xs', streamStatusToneClass)}>{streamStatusText}</p>
              </div>
            </div>
          )}

          <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-2 lg:justify-self-center xl:max-w-[520px]">
            <div className="flex items-center gap-1 text-zinc-500">
              <button
                aria-label={isShuffleEnabled ? 'Disable shuffle' : 'Enable shuffle'}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40',
                  isShuffleEnabled ? 'text-emerald-300 hover:text-emerald-200' : 'hover:text-zinc-100',
                )}
                disabled={!canNavigateQueue}
                onClick={() => setPlaybackShuffleEnabled(!isShuffleEnabled)}
                type="button"
              >
                <Shuffle className="h-4 w-4" />
              </button>
              <button
                aria-label="Previous track"
                className="flex h-8 w-8 items-center justify-center rounded-sm transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!hasActiveTrack}
                onClick={handlePreviousTrack}
                type="button"
              >
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                aria-label={isPlaying ? 'Pause track' : 'Play track'}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-500 text-zinc-100 transition hover:border-zinc-300 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!hasActiveTrack}
                onClick={handleTogglePlay}
                type="button"
              >
                {isStreamLoading ? (
                  <LoaderCircle className="h-6 w-6 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6" />
                )}
              </button>
              <button
                aria-label="Next track"
                className="flex h-8 w-8 items-center justify-center rounded-sm transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canNavigateQueue || (!hasNextTrack && repeatMode !== 'all')}
                onClick={handleNextTrack}
                type="button"
              >
                <SkipForward className="h-4 w-4" />
              </button>
              <button
                aria-label={repeatButtonLabel}
                className={cn(
                  'relative flex h-8 w-8 items-center justify-center rounded-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40',
                  repeatMode !== 'off' ? 'text-emerald-300 hover:text-emerald-200' : 'text-zinc-500 hover:text-zinc-100',
                )}
                disabled={!hasActiveTrack}
                onClick={() => setRepeatMode((previous) =>
                  previous === 'off'
                    ? 'all'
                    : previous === 'all'
                      ? 'one'
                      : 'off')}
                type="button"
              >
                <Repeat className="h-4 w-4" />
                {isRepeatTrackEnabled ? (
                  <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-400 px-0.5 text-[9px] font-bold leading-none text-emerald-950">
                    1
                  </span>
                ) : null}
              </button>
            </div>

            <div className={cn('flex w-full items-center gap-2 text-xs', hasActiveTrack ? 'text-zinc-600' : 'text-zinc-700')}>
              <span className="w-8 text-right tabular-nums">{elapsedLabel}</span>
              <input
                className={cn('media-progress-range h-1 flex-1', hasActiveTrack ? 'cursor-pointer' : 'cursor-not-allowed opacity-55')}
                disabled={!hasActiveTrack}
                max={1000}
                min={0}
                onChange={(event) => handleSeek(Number(event.target.value))}
                style={progressRangeStyle}
                type="range"
                value={progressValue}
              />
              <span className="w-8 tabular-nums">{durationLabel}</span>
            </div>
          </div>

          <div className="flex flex-col items-start gap-1.5 lg:justify-self-end lg:items-end">
            <div className="flex w-full items-center justify-start gap-2 lg:w-auto lg:justify-end">
              <button
                aria-label="Open Lyrics"
                className={cn(
                  'inline-flex size-4 items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40',
                  isLyricsHighlighted
                    ? 'text-emerald-300 hover:text-emerald-200'
                    : hasLyrics
                      ? 'text-zinc-300 hover:text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300',
                )}
                disabled={!hasActiveTrack}
                onClick={() => handleTogglePane('lyrics')}
                type="button"
              >
                {lyricsQuery.isFetching ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ScrollText className="h-4 w-4" />
                )}
              </button>
              <button
                aria-label="Open Queue"
                className={cn(
                  'inline-flex size-4 items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40',
                  isQueueHighlighted
                    ? 'text-emerald-300 hover:text-emerald-200'
                    : hasPlaylistQueue
                      ? 'text-zinc-300 hover:text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300',
                )}
                disabled={!hasPlaylistQueue}
                onClick={() => handleTogglePane('queue')}
                type="button"
              >
                <ListMusic className="h-4 w-4" />
              </button>
              <button
                aria-label="Open Download Manager"
                className={cn(
                  'relative inline-flex size-4 items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
                  isDownloadManagerHighlighted
                    ? 'text-emerald-300 hover:text-emerald-200'
                    : 'text-zinc-400 hover:text-zinc-100',
                )}
                onClick={() => handleTogglePane('downloads')}
                type="button"
              >
                <ArrowDownToLine className="h-4 w-4" />
                {isDownloadManagerRunning ? (
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                ) : null}
              </button>
              {preferredServerBadgeLabel ? (
                <span className="inline-flex items-center rounded-full border border-zinc-700/90 bg-zinc-900/95 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-300/95">
                  {preferredServerBadgeLabel}
                </span>
              ) : null}
            </div>
            <div className="flex w-full items-center justify-start gap-2 text-zinc-500 lg:w-auto lg:justify-end">
              <button
                aria-label={isMuted ? 'Unmute volume' : 'Mute volume'}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
                  isMuted ? 'text-zinc-300 hover:text-zinc-100' : 'hover:text-zinc-100',
                )}
                onClick={handleToggleMute}
                type="button"
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <input
                aria-label="Volume"
                className="media-progress-range media-progress-range--soft h-1 w-full max-w-[170px] cursor-pointer lg:min-w-[140px]"
                max={1}
                min={0}
                onChange={(event) => setPlayerVolume(Number(event.target.value))}
                step={0.01}
                style={volumeRangeStyle}
                type="range"
                value={volume}
              />
            </div>
          </div>
        </div>
      </footer>
      <LyricsPanel
        artist={activeTrack?.artist ?? 'No selected music to stream'}
        currentTimeSeconds={currentTimeSeconds}
        hasLyrics={hasLyrics}
        isLoading={lyricsQuery.isLoading || lyricsQuery.isFetching}
        isOpen={isLyricsPanelOpen}
        onClose={() => onActivePlayerPaneChange(null)}
        plainLyrics={lyricsData?.plainLyrics ?? ''}
        syncedLyrics={lyricsData?.syncedLyrics ?? ''}
        title={activeTrack?.title ?? 'Lyrics'}
      />
      <QueuePanel
        currentTrack={currentQueueTrack}
        isOpen={isQueuePanelOpen}
        onClose={() => onActivePlayerPaneChange(null)}
        onSelectTrack={(trackId) => {
          if (!playbackQueuePlaylistId) {
            return
          }

          queueNavigationTargetTrackIdRef.current = trackId
          setActiveTrack(trackId, {
            queueTrackIds: navigationQueueTrackIds,
            queuePlaylistId: playbackQueuePlaylistId,
          })
        }}
        upcomingTracks={upcomingQueueTracks}
      />
    </>
  )
}
