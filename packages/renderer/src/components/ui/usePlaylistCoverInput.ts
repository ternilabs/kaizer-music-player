import type { ChangeEvent } from 'react'
import { useCallback, useState } from 'react'
import type { PlaylistImageSourceMode } from './PlaylistCoverFields'

interface ResetPlaylistCoverInputOptions {
  imageUrl?: string
  mode?: PlaylistImageSourceMode
}

export function usePlaylistCoverInput(initialImageUrl = '') {
  const [imageSourceMode, setImageSourceMode] = useState<PlaylistImageSourceMode>('url')
  const [urlImageInput, setUrlImageInput] = useState(initialImageUrl)
  const [uploadedImageInput, setUploadedImageInput] = useState('')
  const [uploadedFileName, setUploadedFileName] = useState('')

  const handleFileSelect = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedImageInput(reader.result)
        setImageSourceMode('upload')
      }
    }

    setUploadedFileName(file.name)
    reader.readAsDataURL(file)
  }, [])

  const reset = useCallback(({ imageUrl = '', mode = 'url' }: ResetPlaylistCoverInputOptions = {}) => {
    setImageSourceMode(mode)
    setUrlImageInput(imageUrl)
    setUploadedImageInput('')
    setUploadedFileName('')
  }, [])

  const selectedImage = (
    imageSourceMode === 'url'
      ? urlImageInput.trim()
      : uploadedImageInput.trim()
  ) || undefined

  return {
    imageSourceMode,
    setImageSourceMode,
    urlImageInput,
    setUrlImageInput,
    uploadedFileName,
    handleFileSelect,
    selectedImage,
    reset,
  }
}
