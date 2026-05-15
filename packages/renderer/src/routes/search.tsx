import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { send } from '@app/preload'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAppState } from '@/app/appStateContext'
import type { PreferredServerId, Track } from '@/app/types'
import { AlbumDetailsDialog, type AlbumDetailsData } from '@/components/ui/AlbumDetailsDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PlaylistPickerDialog } from '@/components/ui/PlaylistPickerDialog'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SongCard } from '@/components/ui/SongCard'
import { TopSearchBar } from '@/components/ui/TopSearchBar'
import { useToast } from '@/components/ui/useToast'
import {
  getFirstValidationIssue,
  normalizeSingleLineTextInput,
  searchQueryDraftSchema,
  searchQueryRouteSchema,
  searchQuerySubmitSchema,
  submittedSearchQueryRouteSchema,
} from '@/lib/inputValidation'
import { cn } from '@/lib/cn'

interface RemoteSearchResponse {
  version: string
  sourceServerId: string
  fallbackUsed: boolean
  data: {
    items: ReturnType<typeof useAppState>['allTracks']
    totalNumberOfItems: number
  }
}

interface RemoteAlbumResponse {
  version: string
  sourceServerId: string
  fallbackUsed: boolean
  data: AlbumDetailsData
}

interface SearchTracksQueryResult {
  tracks: Track[]
  infoMessage: string
}

interface AlbumQueryResult {
  album: AlbumDetailsData
  sourceServerId: string
}

type SearchProviderId = PreferredServerId
const KNOWN_TRACK_ID_PREFIXES = ['atlas:', 'orion:', 'helios:'] as const
const SEARCH_PROVIDER_ORDER: SearchProviderId[] = ['atlas-main', 'orion-main', 'helios-main']

function parseDurationLabel(label: string): number {
  const [minutesText, secondsText] = label.split(':')
  const minutes = Number(minutesText)
  const seconds = Number(secondsText)

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return 0
  }

  return Math.max(0, minutes * 60 + seconds)
}

function createTrackCoverTone(seed: string): string {
  const tones = [
    'from-zinc-700 to-zinc-900',
    'from-slate-700 to-slate-900',
    'from-neutral-700 to-neutral-900',
    'from-stone-700 to-stone-900',
    'from-gray-700 to-gray-900',
  ] as const

  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0
  }

  return tones[Math.abs(hash) % tones.length]
}

function getProviderFallbackChain(preferredProviderId: SearchProviderId): SearchProviderId[] {
  return [preferredProviderId, ...SEARCH_PROVIDER_ORDER.filter((providerId) => providerId !== preferredProviderId)]
}

function normalizeTrackIdForProvider(trackId: string, sourceServerId: string): string {
  const normalizedTrackId = trackId.trim()
  if (!normalizedTrackId) {
    return normalizedTrackId
  }

  if (KNOWN_TRACK_ID_PREFIXES.some((prefix) => normalizedTrackId.startsWith(prefix))) {
    return normalizedTrackId
  }

  if (sourceServerId.startsWith('orion')) {
    return `orion:${normalizedTrackId}`
  }

  if (sourceServerId.startsWith('helios')) {
    return `helios:${normalizedTrackId}:${encodeURIComponent('LOSSLESS')}`
  }

  if (sourceServerId.startsWith('atlas')) {
    return `atlas:${normalizedTrackId}`
  }

  return normalizedTrackId
}

function getSearchProviderChannel(providerId: SearchProviderId): 'atlas-main:search-tracks' | 'orion-main:search-tracks' | 'helios-main:search-tracks' {
  if (providerId === 'orion-main') {
    return 'orion-main:search-tracks'
  }

  if (providerId === 'helios-main') {
    return 'helios-main:search-tracks'
  }

  return 'atlas-main:search-tracks'
}

function getAlbumProviderChannel(providerId: SearchProviderId): 'atlas-main:get-album' | 'orion-main:get-album' | 'helios-main:get-album' {
  if (providerId === 'orion-main') {
    return 'orion-main:get-album'
  }

  if (providerId === 'helios-main') {
    return 'helios-main:get-album'
  }

  return 'atlas-main:get-album'
}

function getProviderLabel(providerId: SearchProviderId): 'Atlas' | 'Orion' | 'Helios' {
  if (providerId === 'orion-main') {
    return 'Orion'
  }

  if (providerId === 'helios-main') {
    return 'Helios'
  }

  return 'Atlas'
}

function getTrackProviderId(track: Track, preferredServerId: SearchProviderId): SearchProviderId {
  if (track.id.startsWith('helios:') || track.sourceServerId?.startsWith('helios')) {
    return 'helios-main'
  }

  if (track.id.startsWith('orion:') || track.sourceServerId?.startsWith('orion')) {
    return 'orion-main'
  }

  if (track.id.startsWith('atlas:') || track.sourceServerId?.startsWith('atlas')) {
    return 'atlas-main'
  }

  return preferredServerId
}

async function fetchSearchTracks(input: {
  query: string
  preferredProviderId: SearchProviderId
  localTracks: Track[]
}): Promise<SearchTracksQueryResult> {
  const normalizedQuery = input.query.trim()
  const preferredProviderLabel = getProviderLabel(input.preferredProviderId)
  const candidateProviders = getProviderFallbackChain(input.preferredProviderId)
  const providerFailures: string[] = []

  let selectedProviderId: SearchProviderId | undefined
  let response: RemoteSearchResponse | undefined

  for (const providerId of candidateProviders) {
    const providerChannel = getSearchProviderChannel(providerId)
    const providerLabel = getProviderLabel(providerId)

    try {
      response = await (send(providerChannel, {
        query: normalizedQuery,
        offset: 0,
        type: 'track',
      }) as Promise<RemoteSearchResponse>)
      selectedProviderId = providerId
      break
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : 'Unknown failure'
      providerFailures.push(`${providerLabel}: ${failureMessage}`)
    }
  }

  if (response && selectedProviderId) {
    const infoParts: string[] = []

    if (selectedProviderId !== input.preferredProviderId) {
      infoParts.push(`${preferredProviderLabel} unavailable. Switched to ${getProviderLabel(selectedProviderId)}.`)
    }

    return {
      tracks: response.data.items,
      infoMessage: infoParts.join(' '),
    }
  }

  const localFallbackTracks = input.localTracks.filter((track) => {
    const searchable = `${track.title} ${track.artist} ${track.album}`.toLowerCase()
    return searchable.includes(normalizedQuery.toLowerCase())
  })

  if (localFallbackTracks.length > 0) {
    return {
      tracks: localFallbackTracks,
      infoMessage: 'All remote providers are unavailable. Showing local fallback results.',
    }
  }

  const summarizedFailures = providerFailures.slice(0, 4).join(' | ')
  throw new Error(summarizedFailures || 'Search failed.')
}

async function fetchAlbumDetails(input: {
  albumId: string
  providerId: SearchProviderId
}): Promise<AlbumQueryResult> {
  const response = await (send(getAlbumProviderChannel(input.providerId), {
    albumId: input.albumId,
  }) as Promise<RemoteAlbumResponse>)

  return {
    album: response.data,
    sourceServerId: response.sourceServerId,
  }
}

function SearchRouteComponent() {
  const {
    allTracks,
    playlists,
    preferredServerId,
    addTracksToPlaylist,
    createPlaylist,
    downloadTrack,
    downloadTracksBatch,
    setLastSearchState,
    setActiveTrack,
    upsertTracks,
  } = useAppState()
  const { pushToast } = useToast()
  const navigate = useNavigate({ from: '/search' })
  const { q: query, submitted: submittedQuery } = Route.useSearch()
  const [queryDraft, setQueryDraft] = useState(query)
  const [playlistTrackIds, setPlaylistTrackIds] = useState<string[]>([])
  const [searchResults, setSearchResults] = useState<ReturnType<typeof useAppState>['allTracks']>([])
  const [searchInfo, setSearchInfo] = useState('')
  const [resultsTransitionKey, setResultsTransitionKey] = useState(0)
  const [isResultsExiting, setIsResultsExiting] = useState(false)
  const [isAlbumDialogOpen, setIsAlbumDialogOpen] = useState(false)
  const [isAlbumBulkDownloading, setIsAlbumBulkDownloading] = useState(false)
  const [isAlbumDownloadConfirmOpen, setIsAlbumDownloadConfirmOpen] = useState(false)
  const [albumRequest, setAlbumRequest] = useState<{ albumId: string; providerId: SearchProviderId } | null>(null)
  const [didAttemptSearchSubmit, setDidAttemptSearchSubmit] = useState(false)
  const allTracksRef = useRef(allTracks)
  const upsertTracksRef = useRef(upsertTracks)

  useEffect(() => {
    allTracksRef.current = allTracks
  }, [allTracks])

  useEffect(() => {
    upsertTracksRef.current = upsertTracks
  }, [upsertTracks])

  useEffect(() => {
    setQueryDraft(query)
  }, [query])

  useEffect(() => {
    setLastSearchState({
      query,
      submittedQuery,
    })
  }, [query, setLastSearchState, submittedQuery])

  const searchDraftValidation = searchQueryDraftSchema.safeParse(queryDraft)
  const searchSubmitValidation = searchQuerySubmitSchema.safeParse(queryDraft)
  const searchInputError = !searchDraftValidation.success
    ? getFirstValidationIssue(searchDraftValidation.error)
    : didAttemptSearchSubmit && !searchSubmitValidation.success
      ? getFirstValidationIssue(searchSubmitValidation.error)
      : ''
  const hasInputQuery = queryDraft.trim().length > 0
  const hasSubmittedQuery = submittedQuery.length > 0

  const searchQuery = useQuery({
    queryKey: ['search-tracks', submittedQuery, preferredServerId],
    queryFn: () => fetchSearchTracks({
      query: submittedQuery,
      preferredProviderId: preferredServerId,
      localTracks: allTracksRef.current,
    }),
    enabled: hasSubmittedQuery,
    staleTime: 60_000,
    gcTime: 2 * 60_000,
    retry: false,
  })

  const albumQuery = useQuery({
    queryKey: ['album-details', albumRequest?.albumId ?? '', albumRequest?.providerId ?? 'atlas-main'],
    queryFn: () => {
      if (!albumRequest) {
        throw new Error('Album request missing.')
      }

      return fetchAlbumDetails({
        albumId: albumRequest.albumId,
        providerId: albumRequest.providerId,
      })
    },
    enabled: isAlbumDialogOpen && Boolean(albumRequest?.albumId),
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  })

  useEffect(() => {
    if (!searchQuery.data) {
      return
    }

    setSearchResults(searchQuery.data.tracks)
    setResultsTransitionKey((previous) => previous + 1)
    setIsResultsExiting(false)
    setSearchInfo(searchQuery.data.infoMessage)
    upsertTracksRef.current(searchQuery.data.tracks)
  }, [searchQuery.data, searchQuery.dataUpdatedAt])

  useEffect(() => {
    if (!searchQuery.isError) {
      return
    }

    setSearchResults([])
    setResultsTransitionKey((previous) => previous + 1)
    setIsResultsExiting(false)
  }, [searchQuery.errorUpdatedAt, searchQuery.isError])

  const isSearchLoading = searchQuery.isFetching
  const isSearchActionDisabled = !hasInputQuery || isSearchLoading || !searchSubmitValidation.success
  const searchError = searchQuery.isError
    ? searchQuery.error instanceof Error
      ? searchQuery.error.message
      : 'Search failed.'
    : ''
  const searchInfoTone = searchInfo.toLowerCase().includes('unavailable') ? 'warning' : 'info'

  const albumDetails = albumQuery.data?.album
  const albumSourceServerId = albumQuery.data?.sourceServerId ?? ''
  const albumError = albumQuery.isError
    ? albumQuery.error instanceof Error
      ? albumQuery.error.message
      : `${albumRequest ? getProviderLabel(albumRequest.providerId) : 'Selected provider'} album request failed.`
    : ''
  const isAlbumLoading = isAlbumDialogOpen && (albumQuery.isPending || albumQuery.isFetching)

  const onAlbumDialogClose = () => {
    setIsAlbumDialogOpen(false)
    setIsAlbumDownloadConfirmOpen(false)
    setAlbumRequest(null)
  }

  const onAlbumClick = (track: Track) => {
    if (!track.albumId) {
      return
    }

    setAlbumRequest({
      albumId: track.albumId,
      providerId: getTrackProviderId(track, preferredServerId),
    })
    setIsAlbumDialogOpen(true)
  }

  const toAlbumTrack = (albumTrack: AlbumDetailsData['tracks'][number]): Track | undefined => {
    if (!albumDetails) {
      return undefined
    }

    const sourceServerId = albumSourceServerId || preferredServerId
    const normalizedTrackId = normalizeTrackIdForProvider(albumTrack.id, sourceServerId)
    if (!normalizedTrackId) {
      return undefined
    }

    const existingTrack = allTracks.find((track) =>
      track.id === normalizedTrackId || track.id === albumTrack.id)
    if (existingTrack) {
      return existingTrack
    }

    const durationSeconds = parseDurationLabel(albumTrack.duration)
    const hydratedTrack: Track = {
      id: normalizedTrackId,
      title: albumTrack.title || 'Unknown track',
      artist: albumTrack.artist || albumDetails.artist || 'Unknown artist',
      album: albumDetails.title || 'Unknown album',
      albumId: albumDetails.id || undefined,
      sourceServerId: sourceServerId || undefined,
      isHiRes: albumTrack.isHiRes,
      duration: albumTrack.duration || '0:00',
      sizeMb: Math.max(3, Math.round(durationSeconds / 32) || 8),
      coverTone: createTrackCoverTone(normalizedTrackId),
      coverUrl: albumDetails.coverUrl,
    }
    upsertTracks([hydratedTrack])
    return hydratedTrack
  }

  const onAlbumTrackPlay = (albumTrack: AlbumDetailsData['tracks'][number]) => {
    const track = toAlbumTrack(albumTrack)
    if (!track) {
      return
    }

    setActiveTrack(track.id)
  }

  const onTrackDownload = async (track: Track) => {
    try {
      const status = await downloadTrack(track.id)
      if (status === 'already-downloaded') {
        pushToast({
          message: <><strong>{track.title}</strong> is already downloaded.</>,
        })
        return
      }

      pushToast({
        message: <>Successfully downloaded <strong>{track.title}</strong>.</>,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download failed.'
      pushToast({
        message,
        tone: 'warning',
      })
    }
  }

  const onAlbumTrackDownload = (albumTrack: AlbumDetailsData['tracks'][number]) => {
    const track = toAlbumTrack(albumTrack)
    if (!track) {
      return
    }

    void onTrackDownload(track)
  }

  const onAlbumDownloadAll = () => {
    if (!albumDetails || isAlbumBulkDownloading) {
      return
    }

    setIsAlbumDownloadConfirmOpen(true)
  }

  const confirmAlbumDownloadAll = async () => {
    if (!albumDetails || isAlbumBulkDownloading) {
      return
    }

    const albumTracks = albumDetails.tracks
      .map((albumTrack) => toAlbumTrack(albumTrack))
      .filter((track): track is Track => Boolean(track))
    if (albumTracks.length === 0) {
      pushToast({
        message: 'No downloadable tracks were found for this album.',
        tone: 'warning',
      })
      return
    }

    const trackIds = albumTracks.map((track) => track.id)
    setIsAlbumBulkDownloading(true)
    setIsAlbumDownloadConfirmOpen(false)

    try {
      upsertTracks(albumTracks)
      createPlaylist({
        name: albumDetails.title,
        imageUrl: albumDetails.coverUrl,
        trackIds,
        isAlbumLocked: true,
        sourceAlbumId: albumDetails.id,
      })
      pushToast({
        durationMs: 4200,
        message: <>Created playlist <strong>{albumDetails.title}</strong> and started downloading <strong>{trackIds.length}</strong> tracks in the background.</>,
      })

      void downloadTracksBatch(trackIds, {
        silentIfAlready: true,
        logLabel: `Album "${albumDetails.title}"`,
        trackOverrides: albumTracks,
      })
        .then((summary) => {
          pushToast({
            durationMs: 4200,
            message: <>Album download complete: <strong>{summary.downloaded}</strong> downloaded, <strong>{summary.failedTrackIds.length}</strong> failed.</>,
            tone: summary.failedTrackIds.length > 0 ? 'warning' : 'info',
          })
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Album download failed.'
          pushToast({
            message,
            tone: 'warning',
          })
        })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Album download failed.'
      pushToast({
        message,
        tone: 'warning',
      })
    } finally {
      setIsAlbumBulkDownloading(false)
    }
  }

  const onSearchSubmit = () => {
    const validatedQuery = searchQuerySubmitSchema.safeParse(queryDraft)
    if (!validatedQuery.success) {
      setDidAttemptSearchSubmit(true)
      return
    }

    const nextQuery = validatedQuery.data
    const normalizedNextQuery = nextQuery.toLowerCase()
    const normalizedSubmittedQuery = submittedQuery.trim().toLowerCase()

    setDidAttemptSearchSubmit(false)

    if (!nextQuery) {
      setIsResultsExiting(false)
      setQueryDraft('')
      void navigate({
        search: (previous) => ({
          ...previous,
          q: '',
          submitted: '',
        }),
        replace: true,
      })
      setSearchResults([])
      setSearchInfo('')
      return
    }

    if (isSearchLoading) {
      return
    }

    if (normalizedNextQuery === normalizedSubmittedQuery && hasSubmittedQuery) {
      return
    }

    setSearchInfo('')
    setIsResultsExiting(searchResults.length > 0)
    setQueryDraft(nextQuery)
    void navigate({
      search: (previous) => ({
        ...previous,
        q: nextQuery,
        submitted: nextQuery,
      }),
      replace: true,
    })
  }

  const onQueryChange = (nextValue: string) => {
    const sanitizedNextValue = normalizeSingleLineTextInput(nextValue)
    const nextDraftValidation = searchQueryDraftSchema.safeParse(sanitizedNextValue)

    setQueryDraft(sanitizedNextValue)

    if (!nextDraftValidation.success) {
      return
    }

    if (didAttemptSearchSubmit) {
      setDidAttemptSearchSubmit(false)
    }

    void navigate({
      search: (previous) => ({
        ...previous,
        q: searchQueryRouteSchema.parse(sanitizedNextValue),
        submitted: sanitizedNextValue.trim() ? previous.submitted : '',
      }),
      replace: true,
    })

    if (sanitizedNextValue.trim()) {
      return
    }

    setIsResultsExiting(false)
    setSearchResults([])
    setSearchInfo('')
  }

  const filteredTracks = hasSubmittedQuery ? searchResults : []

  return (
    <section className="flex h-full min-h-0 flex-col">
      <SectionHeader
        title="Browse your favorite songs"
        titleClassName="font-semibold tracking-[-0.052em] !text-zinc-100/95"
      />
      <TopSearchBar
        className="!mt-4 min-h-[58px] rounded-md !border-0 bg-gradient-to-r from-zinc-800/70 to-zinc-800/50 px-5 focus-within:!border-0"
        disabled={isSearchLoading}
        iconClassName="h-[18px] w-[18px] text-zinc-500/95"
        inputClassName="text-base text-zinc-100 placeholder:text-zinc-500/95"
        isLoading={isSearchLoading}
        onChange={onQueryChange}
        onEnter={onSearchSubmit}
        placeholder="Just A Feeling"
        error={searchInputError || undefined}
        submitButton={{
          ariaLabel: 'Submit search',
          onClick: onSearchSubmit,
          disabled: isSearchActionDisabled,
          icon: <ArrowRight className="h-4 w-4" />,
        }}
        value={queryDraft}
      />

      {searchError ? (
        <div className="mt-5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {searchError}
        </div>
      ) : null}

      {searchInfo ? (
        <div className={cn(
          'mt-3 rounded-lg border px-4 py-3 text-sm',
          searchInfoTone === 'warning'
            ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
        )}
        >
          {searchInfo}
        </div>
      ) : null}

      {hasSubmittedQuery && !isSearchLoading && !searchError && filteredTracks.length === 0 ? (
        <div className="ui-empty-state mt-5">
          No track matches this query.
        </div>
      ) : null}

      {filteredTracks.length > 0 ? (
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          <div
            className={cn(
              'animate-search-results grid gap-3 transition-all duration-200 ease-out md:grid-cols-2 2xl:grid-cols-3',
              isResultsExiting ? 'pointer-events-none -translate-y-1 opacity-0' : 'translate-y-0 opacity-100',
            )}
            key={`results-${resultsTransitionKey}`}
          >
            {filteredTracks.map((track, index) => (
              <SongCard
                actions={[
                  {
                    id: 'add-to-playlist',
                    label: 'Add on a playlist',
                    onSelect: () => setPlaylistTrackIds([track.id]),
                  },
                  {
                    id: 'download',
                    label: 'Download',
                    onSelect: () => {
                      void onTrackDownload(track)
                    },
                  },
                ]}
                animationDelayMs={index * 45}
                key={track.id}
                onAlbumClick={onAlbumClick}
                onPlay={setActiveTrack}
                track={track}
              />
            ))}
          </div>
        </div>
      ) : <div className="min-h-0 flex-1" />}

      <PlaylistPickerDialog
        isOpen={playlistTrackIds.length > 0}
        onCancel={() => setPlaylistTrackIds([])}
        onConfirm={(playlistId) => {
          const result = addTracksToPlaylist(playlistId, playlistTrackIds)
          if (result.duplicateCount > 0) {
            pushToast({
              message: 'Some of your choices are already in the playlist.',
              tone: 'warning',
            })
          }
          setPlaylistTrackIds([])
        }}
        playlists={playlists.filter((playlist) => !playlist.isAlbumLocked)}
        trackCount={playlistTrackIds.length}
      />

      <AlbumDetailsDialog
        album={albumDetails}
        error={albumError || undefined}
        isLoading={isAlbumLoading}
        isOpen={isAlbumDialogOpen}
        onClose={onAlbumDialogClose}
        isDownloadAllPending={isAlbumBulkDownloading}
        onDownloadAll={() => {
          void onAlbumDownloadAll()
        }}
        onDownloadTrack={onAlbumTrackDownload}
        onPlayTrack={onAlbumTrackPlay}
      />

      <ConfirmDialog
        confirmLabel={albumDetails ? `Download ${albumDetails.trackCount} tracks` : 'Download tracks'}
        description={albumDetails
          ? `This will create a playlist named "${albumDetails.title}" with its cover and ${albumDetails.trackCount} track(s), then start downloading them in the background.`
          : 'This will create a playlist for the album and start background downloads.'}
        isOpen={isAlbumDownloadConfirmOpen}
        onCancel={() => {
          if (!isAlbumBulkDownloading) {
            setIsAlbumDownloadConfirmOpen(false)
          }
        }}
        onConfirm={() => {
          void confirmAlbumDownloadAll()
        }}
        title="Download album tracks?"
      />
    </section>
  )
}

export const Route = createFileRoute('/search')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: searchQueryRouteSchema.parse(search.q),
    submitted: submittedSearchQueryRouteSchema.parse(search.submitted),
  }),
  component: SearchRouteComponent,
})
