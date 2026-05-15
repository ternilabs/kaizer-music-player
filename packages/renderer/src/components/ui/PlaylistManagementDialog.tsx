import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { ImagePlus, PencilLine, Trash2 } from 'lucide-react'
import { formatPlaylistCreatedAt } from '@/app/playlistCreatedAt'
import type { Playlist } from '@/app/types'
import { PlaylistArtwork } from '@/components/ui/PlaylistArtwork'
import { PlaylistCoverFields } from '@/components/ui/PlaylistCoverFields'
import { PlaylistNameField } from '@/components/ui/PlaylistNameField'
import { Dialog } from '@/components/ui/Dialog'
import { usePlaylistCoverInput } from '@/components/ui/usePlaylistCoverInput'
import { cn } from '@/lib/cn'
import {
  getFirstValidationIssue,
  normalizeSingleLineTextInput,
  optionalPlaylistCoverSchema,
  playlistNameSchema,
} from '@/lib/inputValidation'

export type PlaylistManagementStep = 'menu' | 'rename' | 'cover' | 'delete'

interface PlaylistManagementDialogProps {
  isOpen: boolean
  playlist?: Playlist
  step: PlaylistManagementStep
  onClose: () => void
  onStepChange: (step: PlaylistManagementStep) => void
  onSaveName: (nextName: string) => void
  onSaveCover: (nextImageUrl: string) => void
  onDeleteRequest: () => void
  onDelete: () => void
}

export function PlaylistManagementDialog({
  isOpen,
  playlist,
  step,
  onClose,
  onStepChange,
  onSaveName,
  onSaveCover,
  onDeleteRequest,
  onDelete,
}: PlaylistManagementDialogProps) {
  const [renderState, setRenderState] = useState<{
    playlist?: Playlist
    step: PlaylistManagementStep
  }>({
    playlist,
    step,
  })

  useEffect(() => {
    if (!isOpen || !playlist) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      setRenderState({
        playlist,
        step,
      })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [isOpen, playlist, step])

  useEffect(() => {
    if (isOpen || !renderState.playlist) {
      return
    }

    const closeTimer = window.setTimeout(() => {
      setRenderState({
        playlist: undefined,
        step: 'menu',
      })
    }, 180)

    return () => {
      window.clearTimeout(closeTimer)
    }
  }, [isOpen, renderState.playlist])

  const activePlaylist = isOpen ? playlist : renderState.playlist
  const activeStep = isOpen ? step : renderState.step
  const isAlbumLocked = activePlaylist?.isAlbumLocked === true

  let title = 'Playlist settings'
  let description = 'Choose what you want to update for this playlist.'
  const footer: ReactNode | undefined = activeStep === 'menu' ? (
    <button
      className="ui-btn-secondary min-h-11 rounded-lg px-4 text-zinc-100"
      onClick={onClose}
      type="button"
    >
      Close
    </button>
  ) : undefined
  let content: ReactNode = null

  if (activePlaylist) {
    if (activeStep === 'rename') {
      title = 'Rename playlist'
      description = 'Update the playlist name used across the app.'
      content = (
        <RenamePlaylistContent
          key={`${activePlaylist.id}-rename`}
          onCancel={() => onStepChange('menu')}
          onSave={onSaveName}
          playlist={activePlaylist}
        />
      )
    } else if (activeStep === 'cover') {
      title = 'Change playlist cover'
      description = 'Replace the current playlist artwork using a remote image URL or a local upload.'
      content = (
        <ChangePlaylistCoverContent
          key={`${activePlaylist.id}-cover`}
          onCancel={() => onStepChange('menu')}
          onSave={onSaveCover}
          playlist={activePlaylist}
        />
      )
    } else if (activeStep === 'delete') {
      title = 'Delete playlist'
      description = `This will permanently delete "${activePlaylist.name}" and remove it from your list.`
      content = (
        <DeletePlaylistContent
          onCancel={() => onStepChange('menu')}
          onConfirm={onDelete}
        />
      )
    } else {
      content = (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
            <PlaylistArtwork
              className="h-16 w-16 rounded-lg border border-zinc-700"
              iconClassName="h-5 w-5"
              imageUrl={activePlaylist.imageUrl}
              name={activePlaylist.name}
            />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-zinc-100">{activePlaylist.name}</p>
              <p className="truncate text-xs text-zinc-500">
                {activePlaylist.trackIds.length} {activePlaylist.trackIds.length === 1 ? 'track' : 'tracks'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{formatPlaylistCreatedAt(activePlaylist.createdAt)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <PlaylistSettingsAction
              description={isAlbumLocked ? 'Album-generated playlists cannot be renamed.' : 'Update the playlist title.'}
              disabled={isAlbumLocked}
              icon={<PencilLine className="h-4 w-4" />}
              label="Rename playlist"
              onClick={() => onStepChange('rename')}
            />
            <PlaylistSettingsAction
              description={isAlbumLocked ? 'Album-generated playlists cannot change cover artwork.' : 'Replace the current playlist artwork.'}
              disabled={isAlbumLocked}
              icon={<ImagePlus className="h-4 w-4" />}
              label="Change cover"
              onClick={() => onStepChange('cover')}
            />
            <PlaylistSettingsAction
              description="Permanently remove this playlist from your library."
              icon={<Trash2 className="h-4 w-4" />}
              label="Delete playlist"
              onClick={onDeleteRequest}
              tone="danger"
            />
          </div>
        </div>
      )
    }
  }

  return (
    <Dialog
      description={description}
      isOpen={isOpen && Boolean(activePlaylist)}
      onClose={onClose}
      title={title}
      footer={footer}
    >
      {content}
    </Dialog>
  )
}

interface PlaylistSettingsActionProps {
  label: string
  description: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'danger'
}

function PlaylistSettingsAction({
  label,
  description,
  icon,
  onClick,
  disabled = false,
  tone = 'default',
}: PlaylistSettingsActionProps) {
  return (
    <button
      className={cn(
        'flex min-h-12 w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
        disabled
          ? 'cursor-not-allowed border-zinc-800 bg-zinc-950/70 text-zinc-500'
          : tone === 'danger'
            ? 'border-rose-500/25 bg-rose-500/10 text-rose-100 hover:border-rose-400/40 hover:bg-rose-500/15'
            : 'border-zinc-800 bg-zinc-950/80 text-zinc-100 hover:border-zinc-700 hover:bg-zinc-900/90',
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className={cn('mt-0.5 shrink-0', disabled ? 'text-zinc-600' : tone === 'danger' ? 'text-rose-200' : 'text-emerald-300')}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className={cn('mt-1 block text-xs leading-5', disabled ? 'text-zinc-500' : tone === 'danger' ? 'text-rose-100/80' : 'text-zinc-400')}>
          {description}
        </span>
      </span>
    </button>
  )
}

interface RenamePlaylistContentProps {
  playlist: Playlist
  onCancel: () => void
  onSave: (nextName: string) => void
}

function RenamePlaylistContent({
  playlist,
  onCancel,
  onSave,
}: RenamePlaylistContentProps) {
  const [nameInput, setNameInput] = useState(playlist.name)
  const nameValidation = playlistNameSchema.safeParse(nameInput)
  const hasNameChanged = nameInput !== playlist.name
  const canSave = nameValidation.success && nameValidation.data !== playlist.name
  const nameError = hasNameChanged && !nameValidation.success
    ? getFirstValidationIssue(nameValidation.error)
    : ''

  return (
    <div className="space-y-4">
      <PlaylistNameField
        error={nameError}
        onChange={(value) => setNameInput(normalizeSingleLineTextInput(value))}
        value={nameInput}
      />
      <div className="flex flex-wrap gap-3">
        <button
          className="ui-btn-secondary min-h-11 rounded-lg px-4 text-zinc-100"
          onClick={onCancel}
          type="button"
        >
          Back
        </button>
        <button
          className="ui-btn-primary min-h-11 rounded-lg px-4"
          disabled={!canSave}
          onClick={() => {
            if (nameValidation.success) {
              onSave(nameValidation.data)
            }
          }}
          type="button"
        >
          Save name
        </button>
      </div>
    </div>
  )
}

interface ChangePlaylistCoverContentProps {
  playlist: Playlist
  onCancel: () => void
  onSave: (nextImageUrl: string) => void
}

function ChangePlaylistCoverContent({
  playlist,
  onCancel,
  onSave,
}: ChangePlaylistCoverContentProps) {
  const {
    imageSourceMode,
    setImageSourceMode,
    urlImageInput,
    setUrlImageInput,
    uploadedFileName,
    handleFileSelect,
    selectedImage,
  } = usePlaylistCoverInput(playlist.imageUrl ?? '')

  const coverValidation = optionalPlaylistCoverSchema.safeParse(selectedImage)
  const normalizedCurrentImageUrl = playlist.imageUrl?.trim() ?? ''
  const hasCoverUrlValue = imageSourceMode === 'url' && urlImageInput.trim().length > 0
  const canSave = coverValidation.success && Boolean(coverValidation.data) && coverValidation.data !== normalizedCurrentImageUrl
  const coverUrlError = hasCoverUrlValue && !coverValidation.success
    ? getFirstValidationIssue(coverValidation.error)
    : ''

  return (
    <div className="space-y-3">
      <PlaylistCoverFields
        imageSourceMode={imageSourceMode}
        onFileSelect={handleFileSelect}
        onImageSourceModeChange={setImageSourceMode}
        onUrlImageInputChange={(value) => setUrlImageInput(normalizeSingleLineTextInput(value))}
        previewImage={selectedImage}
        previewName={playlist.name}
        previewTrackCount={`${playlist.trackIds.length} ${playlist.trackIds.length === 1 ? 'track' : 'tracks'}`}
        uploadedFileName={uploadedFileName}
        urlImageInput={urlImageInput}
        urlFieldError={coverUrlError}
      />
      <div className="flex flex-wrap gap-3">
        <button
          className="ui-btn-secondary min-h-11 rounded-lg px-4 text-zinc-100"
          onClick={onCancel}
          type="button"
        >
          Back
        </button>
        <button
          className="ui-btn-primary min-h-11 rounded-lg px-4"
          disabled={!canSave}
          onClick={() => {
            if (coverValidation.success && coverValidation.data) {
              onSave(coverValidation.data)
            }
          }}
          type="button"
        >
          Save cover
        </button>
      </div>
    </div>
  )
}

interface DeletePlaylistContentProps {
  onCancel: () => void
  onConfirm: () => void
}

function DeletePlaylistContent({
  onCancel,
  onConfirm,
}: DeletePlaylistContentProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <button
          className="ui-btn-secondary min-h-11 rounded-lg px-4 text-zinc-100"
          onClick={onCancel}
          type="button"
        >
          Back
        </button>
        <button
          className="ui-btn-danger min-h-11 rounded-lg px-4"
          onClick={onConfirm}
          type="button"
        >
          Delete playlist
        </button>
      </div>
    </div>
  )
}
