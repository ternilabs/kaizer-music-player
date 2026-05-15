import type { ReactNode } from 'react'
import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Bookmark, Clock3, Download, LoaderCircle, Play, Settings2, Shuffle } from 'lucide-react'
import { formatPlaylistCreatedAt } from '@/app/playlistCreatedAt'
import { useAppState } from '@/app/appStateContext'
import type { Playlist } from '@/app/types'
import { Dialog } from '@/components/ui/Dialog'
import { PlaylistManagementDialog, type PlaylistManagementStep } from '@/components/ui/PlaylistManagementDialog'
import { PlaylistSearchBar } from '@/components/ui/PlaylistSearchBar'
import { PlaylistPickerDialog } from '@/components/ui/PlaylistPickerDialog'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SongRow } from '@/components/ui/SongRow'
import { Switch } from '@/components/ui/Switch'
import { useToast } from '@/components/ui/useToast'
import { normalizeFilterTextInput } from '@/lib/inputValidation'
import { cn } from '@/lib/cn'

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

function PlaylistRouteComponent() {
  const { playlistId } = Route.useParams()
  const {
    allTracks,
    playlists,
    autoDownloadPlaylistIds,
    bookmarkedPlaylistIds,
    playbackShuffleEnabled,
    addTracksToPlaylist,
    downloadTrack,
    downloadTracksBatch,
    downloadedTrackIds,
    deletePlaylist,
    updatePlaylist,
    removeTrackFromPlaylist,
    togglePlaylistBookmark,
    setPlaylistAutoDownloadOnAdd,
    setActiveTrack,
    setPlaybackShuffleEnabled,
  } = useAppState()
  const { pushToast } = useToast()
  const navigate = useNavigate({ from: '/playlist/$playlistId' })
  const [trackIdToMove, setTrackIdToMove] = useState('')
  const [trackSearchQuery, setTrackSearchQuery] = useState('')
  const [isBulkDownloadDialogOpen, setIsBulkDownloadDialogOpen] = useState(false)
  const [isPlaylistBulkDownloading, setIsPlaylistBulkDownloading] = useState(false)
  const [playlistManagementStep, setPlaylistManagementStep] = useState<PlaylistManagementStep | null>(null)

  const playlist = playlists.find((item) => item.id === playlistId)

  if (!playlist) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-8 text-center text-zinc-400">
        Playlist not found.
      </section>
    )
  }

  const playlistTracks = playlist.trackIds
    .map((trackId) => allTracks.find((track) => track.id === trackId))
    .filter((track): track is NonNullable<(typeof allTracks)[number]> => Boolean(track))
  const isAlbumPlaylist = playlist.isAlbumLocked === true
  const isBookmarked = bookmarkedPlaylistIds.includes(playlist.id)
  const isShuffleEnabled = playbackShuffleEnabled
  const normalizedTrackSearchQuery = trackSearchQuery.trim().toLowerCase()
  const filteredPlaylistTracks = normalizedTrackSearchQuery
    ? playlistTracks.filter((track) => {
        const searchable = `${track.title} ${track.artist} ${track.album}`.toLowerCase()
        return searchable.includes(normalizedTrackSearchQuery)
      })
    : playlistTracks
  const handlePlayPlaylistTrack = (trackId: string) => {
    setActiveTrack(trackId, { queueTrackIds: playlist.trackIds, queuePlaylistId: playlist.id })
  }
  const handlePlayPlaylist = () => {
    const firstTrackId = playlist.trackIds[0]
    if (!firstTrackId) {
      return
    }

    const queueTrackIds = isShuffleEnabled ? shuffleTrackIds(playlist.trackIds) : playlist.trackIds
    const queueTrackId = queueTrackIds[0]

    if (!queueTrackId) {
      return
    }

    setPlaybackShuffleEnabled(isShuffleEnabled)
    setActiveTrack(queueTrackId, { queueTrackIds, queuePlaylistId: playlist.id })
  }
  const trackCountText = `${playlist.trackIds.length} ${playlist.trackIds.length === 1 ? 'track' : 'tracks'}`
  const isAutoDownloadOnAdd = autoDownloadPlaylistIds.includes(playlist.id)
  const playlistDownloadedTrackCount = playlist.trackIds.filter((trackId) => downloadedTrackIds.includes(trackId)).length

  const onPlaylistTrackDownload = async (trackId: string) => {
    const track = playlistTracks.find((item) => item.id === trackId)
    if (!track) {
      return
    }

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
      const message = error instanceof Error ? error.message : 'Failed to download track.'
      pushToast({
        message,
        tone: 'warning',
      })
    }
  }

  const onPlaylistBulkDownload = async () => {
    if (isPlaylistBulkDownloading || playlist.trackIds.length === 0) {
      return
    }

    setIsPlaylistBulkDownloading(true)
    try {
      void downloadTracksBatch(playlist.trackIds, {
        silentIfAlready: true,
        logLabel: `Playlist "${playlist.name}"`,
      })
        .then((summary) => {
          pushToast({
            durationMs: 4200,
            message: <>Playlist download complete: <strong>{summary.downloaded}</strong> downloaded, <strong>{summary.failedTrackIds.length}</strong> failed.</>,
            tone: summary.failedTrackIds.length > 0 ? 'warning' : 'info',
          })
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Playlist download failed.'
          pushToast({
            message,
            tone: 'warning',
          })
        })
      pushToast({
        durationMs: 4200,
        message: <>Queued <strong>{playlist.trackIds.length}</strong> playlist track(s) in Download Manager.</>,
      })
      setIsBulkDownloadDialogOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Playlist download failed.'
      pushToast({
        message,
        tone: 'warning',
      })
    } finally {
      setIsPlaylistBulkDownloading(false)
    }
  }

  const handleTogglePlaylistBookmark = (targetPlaylist: Playlist) => {
    const result = togglePlaylistBookmark(targetPlaylist.id)

    if (result === 'limit-reached') {
      pushToast({
        message: 'You can bookmark up to 5 playlists only.',
        tone: 'warning',
      })
    }
  }

  const applyPlaylistUpdate = (
    targetPlaylistId: string,
    changes: { name?: string; imageUrl?: string },
    successMessage: ReactNode,
  ) => {
    const result = updatePlaylist(targetPlaylistId, changes)

    if (result === 'updated') {
      pushToast({
        message: successMessage,
      })
      return true
    }

    if (result === 'locked') {
      pushToast({
        message: 'Album-generated playlists cannot be renamed or have their cover changed.',
        tone: 'warning',
      })
      return false
    }

    if (result === 'missing') {
      pushToast({
        message: 'This playlist is no longer available.',
        tone: 'warning',
      })
      return false
    }

    pushToast({
      message: 'No playlist changes were detected.',
      tone: 'warning',
    })
    return false
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <SectionHeader
        subtitle={`${trackCountText} • ${formatPlaylistCreatedAt(playlist.createdAt)}`}
        title={playlist.name}
        titleClassName="font-semibold tracking-[-0.052em] !text-zinc-100/95"
        actionsClassName="mb-2 w-full justify-between"
        actions={(
          <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex shrink-0 items-center gap-4">
              <button
                aria-label="Play playlist"
                className="inline-flex size-11 items-center justify-center rounded-full bg-emerald-400 text-emerald-950 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={playlist.trackIds.length === 0}
                onClick={handlePlayPlaylist}
                title="Play playlist"
                type="button"
              >
                <Play className="h-4 w-4 fill-current" />
              </button>
              <button
                aria-label="Shuffle playlist"
                aria-pressed={isShuffleEnabled}
                className={cn(
                  'inline-flex items-center justify-center text-zinc-500 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-45',
                  isShuffleEnabled && 'text-emerald-300 hover:text-emerald-200',
                )}
                disabled={playlist.trackIds.length === 0}
                onClick={() => setPlaybackShuffleEnabled(!isShuffleEnabled)}
                title={isShuffleEnabled ? 'Disable shuffle for playlist play' : 'Enable shuffle for playlist play'}
                type="button"
              >
                <Shuffle className="h-4 w-4" />
              </button>
              <button
                aria-label={`${isBookmarked ? 'Remove bookmark from' : 'Bookmark'} playlist ${playlist.name}`}
                aria-pressed={isBookmarked}
                className={cn(
                  'inline-flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-45',
                  isBookmarked
                    ? 'text-emerald-300 hover:text-emerald-200'
                    : 'text-zinc-500 hover:text-emerald-300',
                )}
                onClick={() => handleTogglePlaylistBookmark(playlist)}
                title={isBookmarked ? 'Remove bookmark from playlist' : 'Bookmark playlist'}
                type="button"
              >
                <Bookmark className="h-4 w-4" fill={isBookmarked ? 'currentColor' : 'none'} />
              </button>
              <button
                aria-label={isAutoDownloadOnAdd ? 'Playlist auto-download is enabled' : 'Download playlist tracks'}
                className={cn(
                  'inline-flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-45',
                  isAutoDownloadOnAdd
                    ? 'text-emerald-300 hover:text-emerald-200'
                    : 'text-zinc-500 hover:text-zinc-100',
                )}
                disabled={playlist.trackIds.length === 0}
                onClick={() => setIsBulkDownloadDialogOpen(true)}
                title={isAutoDownloadOnAdd
                  ? 'Auto-download for newly added playlist tracks is enabled'
                  : 'Open playlist download options'}
                type="button"
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                aria-label={`Open settings for playlist ${playlist.name}`}
                className="inline-flex items-center justify-center text-zinc-500 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                onClick={() => setPlaylistManagementStep('menu')}
                title="Playlist settings"
                type="button"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </div>
            <PlaylistSearchBar onChange={(value) => setTrackSearchQuery(normalizeFilterTextInput(value))} value={trackSearchQuery} />
          </div>
        )}
      />

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {playlistTracks.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-4 py-8 text-center text-zinc-500">
            This playlist has no tracks yet.
          </div>
        ) : filteredPlaylistTracks.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-4 py-8 text-center text-zinc-500">
            No track matches this playlist search.
          </div>
        ) : (
          <div>
            <div
              className={cn(
                'grid items-center gap-3 border-b border-white/8 px-3 pb-2 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500',
                isAlbumPlaylist
                  ? 'grid-cols-[minmax(0,1fr)_32px_56px_36px]'
                  : 'grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)_32px_56px_36px]',
              )}
            >
              <span>Title</span>
              {isAlbumPlaylist ? null : <span>Album</span>}
              <span aria-hidden="true" />
              <span className="flex w-14 justify-end justify-self-end pr-2">
                <Clock3 className="h-3.5 w-3.5" />
              </span>
              <span aria-hidden="true" />
            </div>

            <div className="mt-1 space-y-0.5">
              {filteredPlaylistTracks.map((track) => {
                const isDownloaded = downloadedTrackIds.includes(track.id)

                return (
                  <SongRow
                    actions={[
                      {
                        id: 'download-track',
                        label: 'Download',
                        disabled: isDownloaded,
                        onSelect: () => {
                          void onPlaylistTrackDownload(track.id)
                        },
                      },
                      {
                        id: 'remove-from-playlist',
                        label: 'Remove from the playlist',
                        onSelect: () => removeTrackFromPlaylist(playlist.id, track.id),
                        tone: 'danger',
                      },
                      {
                        id: 'add-to-another-playlist',
                        label: 'Add it from another playlist',
                        onSelect: () => setTrackIdToMove(track.id),
                      },
                    ]}
                    downloadStatus={isDownloaded ? 'downloaded' : 'not-downloaded'}
                    key={track.id}
                    mode="playlist"
                    onDoubleClickPlay={handlePlayPlaylistTrack}
                    onPlay={handlePlayPlaylistTrack}
                    showAlbumColumn={!isAlbumPlaylist}
                    track={track}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>

      <PlaylistPickerDialog
        isOpen={Boolean(trackIdToMove)}
        onCancel={() => setTrackIdToMove('')}
        onConfirm={(targetPlaylistId) => {
          if (trackIdToMove) {
            const result = addTracksToPlaylist(targetPlaylistId, [trackIdToMove])
            if (result.duplicateCount > 0) {
              pushToast({
                message: 'Some of your choices are already in the playlist.',
                tone: 'warning',
              })
            }
          }
          setTrackIdToMove('')
        }}
        playlists={playlists.filter((item) => item.id !== playlist.id && !item.isAlbumLocked)}
        title="Add to another playlist"
        trackCount={trackIdToMove ? 1 : 0}
      />

      <PlaylistManagementDialog
        isOpen={playlistManagementStep !== null}
        onClose={() => setPlaylistManagementStep(null)}
        onDelete={() => {
          const deletedPlaylistName = playlist.name

          setPlaylistManagementStep(null)
          void navigate({ replace: true, to: '/playlist' }).then(() => {
            deletePlaylist(playlist.id)
            pushToast({
              message: <>Deleted playlist <strong>{deletedPlaylistName}</strong>.</>,
            })
          })
        }}
        onDeleteRequest={() => setPlaylistManagementStep('delete')}
        onSaveCover={(nextImageUrl) => {
          const didUpdate = applyPlaylistUpdate(
            playlist.id,
            { imageUrl: nextImageUrl },
            <>Updated the cover for <strong>{playlist.name}</strong>.</>,
          )

          if (didUpdate) {
            setPlaylistManagementStep('menu')
          }
        }}
        onSaveName={(nextName) => {
          const didUpdate = applyPlaylistUpdate(
            playlist.id,
            { name: nextName },
            <>Renamed playlist to <strong>{nextName}</strong>.</>,
          )

          if (didUpdate) {
            setPlaylistManagementStep('menu')
          }
        }}
        onStepChange={setPlaylistManagementStep}
        playlist={playlist}
        step={playlistManagementStep ?? 'menu'}
      />

      <Dialog
        isOpen={isBulkDownloadDialogOpen}
        onClose={() => {
          if (!isPlaylistBulkDownloading) {
            setIsBulkDownloadDialogOpen(false)
          }
        }}
        title="Download playlist tracks"
        footer={(
          <>
            <button
              className="ui-btn-secondary px-4 text-zinc-100"
              disabled={isPlaylistBulkDownloading}
              onClick={() => setIsBulkDownloadDialogOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="ui-btn-primary px-4"
              disabled={isPlaylistBulkDownloading || playlist.trackIds.length === 0}
              onClick={() => {
                void onPlaylistBulkDownload()
              }}
              type="button"
            >
              {isPlaylistBulkDownloading ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Downloading...
                </span>
              ) : 'Download playlist'}
            </button>
          </>
        )}
      >
        <div className="space-y-3">
          <p className="text-sm text-zinc-300">
            {playlistDownloadedTrackCount} of {playlist.trackIds.length} tracks are already downloaded.
          </p>
          <div className="flex items-start justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-zinc-200">Auto-download newly added tracks</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {isAutoDownloadOnAdd ? 'Enabled' : 'Disabled'}
              </p>
            </div>
            <Switch
              ariaLabel="Auto-download newly added tracks"
              checked={isAutoDownloadOnAdd}
              onCheckedChange={(enabled) => setPlaylistAutoDownloadOnAdd(playlist.id, enabled)}
            />
          </div>
          <p className="text-xs text-zinc-500">
            Automatically download tracks when they are freshly added to this playlist.
          </p>
        </div>
      </Dialog>
    </section>
  )
}

export const Route = createFileRoute('/playlist/$playlistId')({
  component: PlaylistRouteComponent,
})
