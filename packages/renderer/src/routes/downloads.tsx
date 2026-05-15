import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useAppState } from '@/app/appStateContext'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DownloadTable } from '@/components/ui/DownloadTable'
import { PlaylistPickerDialog } from '@/components/ui/PlaylistPickerDialog'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { useToast } from '@/components/ui/useToast'
import { normalizeFilterTextInput } from '@/lib/inputValidation'

function DownloadsRouteComponent() {
  const {
    downloadedTracks,
    playlists,
    addTracksToPlaylist,
    bulkDeleteDownloads,
    deleteDownload,
  } = useAppState()
  const { pushToast } = useToast()
  const [query, setQuery] = useState('')
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([])
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false)
  const [trackIdToDelete, setTrackIdToDelete] = useState('')
  const [playlistTrackIds, setPlaylistTrackIds] = useState<string[]>([])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredTracks = normalizedQuery
    ? downloadedTracks.filter((track) => {
        const searchable = `${track.title} ${track.artist} ${track.album}`.toLowerCase()
        return searchable.includes(normalizedQuery)
      })
    : downloadedTracks

  const filteredTrackIds = filteredTracks.map((track) => track.id)
  const trackToDelete = downloadedTracks.find((track) => track.id === trackIdToDelete)
  const areAllFilteredTracksSelected =
    filteredTrackIds.length > 0 && filteredTrackIds.every((trackId) => selectedTrackIds.includes(trackId))

  const deleteTrackMutation = useMutation({
    mutationFn: async (trackId: string) => {
      await deleteDownload(trackId)
    },
    onSuccess: (_value, trackId) => {
      setSelectedTrackIds((prevIds) => prevIds.filter((id) => id !== trackId))
      setTrackIdToDelete('')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to delete the selected track.'
      pushToast({
        message,
        tone: 'warning',
      })
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (trackIds: string[]) => {
      await bulkDeleteDownloads(trackIds)
    },
    onSuccess: () => {
      setSelectedTrackIds([])
      setIsBulkDeleteDialogOpen(false)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to delete selected tracks.'
      pushToast({
        message,
        tone: 'warning',
      })
    },
  })
  const isActionPending = deleteTrackMutation.isPending || bulkDeleteMutation.isPending

  const toggleSelectAll = () => {
    if (areAllFilteredTracksSelected) {
      setSelectedTrackIds((prevIds) => prevIds.filter((trackId) => !filteredTrackIds.includes(trackId)))
      return
    }

    setSelectedTrackIds((prevIds) => {
      const nextIds = [...prevIds]

      for (const trackId of filteredTrackIds) {
        if (!nextIds.includes(trackId)) {
          nextIds.push(trackId)
        }
      }

      return nextIds
    })
  }

  const toggleSelectTrack = (trackId: string) => {
    setSelectedTrackIds((prevIds) => {
      if (prevIds.includes(trackId)) {
        return prevIds.filter((id) => id !== trackId)
      }

      return [...prevIds, trackId]
    })
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <SectionHeader
        subtitle={`You have ${downloadedTracks.length} ${downloadedTracks.length === 1 ? 'track' : 'tracks'} stored to your device.`}
        title="Search your songs locally"
        titleClassName="font-semibold tracking-[-0.052em] !text-zinc-100/95"
      />

      <DownloadTable
        areAllSelected={areAllFilteredTracksSelected}
        isActionPending={isActionPending}
        onSearchChange={(value) => setQuery(normalizeFilterTextInput(value))}
        searchPlaceholder="Search your downloads"
        searchValue={query}
        onAddTrackToPlaylist={(trackId) => setPlaylistTrackIds([trackId])}
        onBulkAddToPlaylist={() => setPlaylistTrackIds(selectedTrackIds)}
        onBulkDelete={() => setIsBulkDeleteDialogOpen(true)}
        onDeleteTrack={(trackId) => setTrackIdToDelete(trackId)}
        onToggleSelectAll={toggleSelectAll}
        onToggleSelectTrack={toggleSelectTrack}
        selectedTrackIds={selectedTrackIds}
        tracks={filteredTracks}
      />

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

      <ConfirmDialog
        confirmLabel="Delete selected"
        description={`This will permanently remove ${selectedTrackIds.length} downloaded track(s).`}
        isOpen={isBulkDeleteDialogOpen}
        onCancel={() => setIsBulkDeleteDialogOpen(false)}
        onConfirm={() => {
          if (!bulkDeleteMutation.isPending) {
            bulkDeleteMutation.mutate(selectedTrackIds)
          }
        }}
        title="Delete downloads"
        tone="danger"
      />

      <ConfirmDialog
        confirmLabel="Delete track"
        description={trackToDelete
          ? `This will permanently remove "${trackToDelete.title}" from downloads.`
          : 'This will permanently remove this track from downloads.'}
        isOpen={Boolean(trackIdToDelete)}
        onCancel={() => setTrackIdToDelete('')}
        onConfirm={() => {
          if (trackIdToDelete && !deleteTrackMutation.isPending) {
            deleteTrackMutation.mutate(trackIdToDelete)
          }
        }}
        title="Delete track"
        tone="danger"
      />
    </section>
  )
}

export const Route = createFileRoute('/downloads')({
  component: DownloadsRouteComponent,
})
