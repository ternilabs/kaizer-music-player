import { useState } from 'react'
import { Dialog } from './Dialog'
import { PlaylistCoverFields } from './PlaylistCoverFields'
import { PlaylistNameField } from './PlaylistNameField'
import { usePlaylistCoverInput } from './usePlaylistCoverInput'
import {
  getFirstValidationIssue,
  normalizeSingleLineTextInput,
  optionalPlaylistCoverSchema,
  playlistNameSchema,
} from '@/lib/inputValidation'

interface CreatePlaylistDialogProps {
  isOpen: boolean
  onCancel: () => void
  onCreate: (input: { name?: string; imageUrl?: string }) => void
  mode?: 'modal' | 'inline'
}

export function CreatePlaylistDialog({
  isOpen,
  onCancel,
  onCreate,
  mode = 'modal',
}: CreatePlaylistDialogProps) {
  const [nameInput, setNameInput] = useState('')
  const {
    imageSourceMode,
    setImageSourceMode,
    urlImageInput,
    setUrlImageInput,
    uploadedFileName,
    handleFileSelect,
    selectedImage,
    reset,
  } = usePlaylistCoverInput()
  const nameValidation = playlistNameSchema.safeParse(nameInput)
  const coverValidation = optionalPlaylistCoverSchema.safeParse(selectedImage)
  const hasNameValue = nameInput !== ''
  const hasCoverUrlValue = imageSourceMode === 'url' && urlImageInput.trim().length > 0
  const canCreate = nameValidation.success && coverValidation.success
  const nameError = hasNameValue
    ? (!nameValidation.success ? getFirstValidationIssue(nameValidation.error) : '')
    : ''
  const coverUrlError = hasCoverUrlValue && !coverValidation.success
    ? getFirstValidationIssue(coverValidation.error)
    : ''

  const resetForm = () => {
    setNameInput('')
    reset()
  }

  const handleCreate = () => {
    if (!nameValidation.success || !coverValidation.success) {
      return
    }

    onCreate({
      name: nameValidation.data,
      imageUrl: coverValidation.data,
    })

    resetForm()
  }

  const handleCancel = () => {
    resetForm()
    onCancel()
  }

  const previewName = nameInput.trim() || 'My playlist'
  const previewTrackCount = '0 tracks'

  return (
    <Dialog
      isOpen={isOpen}
      maxWidthClassName={mode === 'inline' ? 'max-w-none' : 'max-w-md'}
      mode={mode}
      onClose={handleCancel}
      panelClassName={mode === 'inline' ? 'h-full overflow-y-auto' : ''}
      title="Create a new playlist"
      footer={(
        <>
          <button
            className="ui-btn-secondary min-h-11 rounded-lg px-4"
            onClick={handleCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="ui-btn-primary min-h-11 rounded-lg px-4"
            disabled={!canCreate}
            onClick={handleCreate}
            type="button"
          >
            Create
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <PlaylistNameField
          error={nameError}
          onChange={(value) => setNameInput(normalizeSingleLineTextInput(value))}
          value={nameInput}
        />
        <PlaylistCoverFields
          imageSourceMode={imageSourceMode}
          onFileSelect={handleFileSelect}
          onImageSourceModeChange={setImageSourceMode}
          onUrlImageInputChange={(value) => setUrlImageInput(normalizeSingleLineTextInput(value))}
          previewImage={selectedImage}
          previewName={previewName}
          previewTrackCount={previewTrackCount}
          uploadedFileName={uploadedFileName}
          urlImageInput={urlImageInput}
          urlFieldError={coverUrlError}
        />
      </div>
    </Dialog>
  )
}
