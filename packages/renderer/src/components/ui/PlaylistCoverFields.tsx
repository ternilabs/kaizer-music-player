import type { ChangeEvent } from 'react'
import { cn } from '@/lib/cn'
import { PlaylistArtwork } from './PlaylistArtwork'

export type PlaylistImageSourceMode = 'url' | 'upload'

interface PlaylistCoverFieldsProps {
  imageSourceMode: PlaylistImageSourceMode
  onImageSourceModeChange: (mode: PlaylistImageSourceMode) => void
  urlImageInput: string
  onUrlImageInputChange: (value: string) => void
  uploadedFileName: string
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void
  previewImage?: string
  previewName: string
  previewTrackCount?: string
  urlFieldError?: string
}

export function PlaylistCoverFields({
  imageSourceMode,
  onImageSourceModeChange,
  urlImageInput,
  onUrlImageInputChange,
  uploadedFileName,
  onFileSelect,
  previewImage,
  previewName,
  previewTrackCount = '0 tracks',
  urlFieldError,
}: PlaylistCoverFieldsProps) {
  return (
    <>
      <div>
        <p className="mb-1 text-sm text-zinc-200">Image source</p>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-700/80 bg-zinc-950 p-1">
          <button
            className={cn(
              'min-h-10 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
              imageSourceMode === 'url'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100',
            )}
            onClick={() => onImageSourceModeChange('url')}
            type="button"
          >
            Image URL
          </button>
          <button
            className={cn(
              'min-h-10 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
              imageSourceMode === 'upload'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100',
            )}
            onClick={() => onImageSourceModeChange('upload')}
            type="button"
          >
            Upload image
          </button>
        </div>
      </div>

      {imageSourceMode === 'url' ? (
        <label className="block text-sm text-zinc-200">
          Image URL (optional)
          <input
            aria-invalid={urlFieldError ? true : undefined}
            className={`ui-input-field mt-1 ${urlFieldError ? 'border-rose-500/50 bg-rose-500/5 text-rose-100 placeholder:text-rose-200/60 focus-visible:ring-rose-400' : ''}`}
            onChange={(event) => onUrlImageInputChange(event.target.value)}
            placeholder="https://example.com/cover.jpg"
            value={urlImageInput}
          />
          {urlFieldError ? (
            <p className="mt-1 text-xs text-rose-300">{urlFieldError}</p>
          ) : null}
        </label>
      ) : (
        <label className="block text-sm text-zinc-200">
          Upload image
          <input
            accept="image/*"
            className="mt-1 block min-h-11 w-full cursor-pointer rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-100 hover:file:bg-zinc-700"
            onChange={onFileSelect}
            type="file"
          />
          <p className="mt-1 text-xs text-zinc-500">
            {uploadedFileName ? `Selected: ${uploadedFileName}` : 'No file selected'}
          </p>
        </label>
      )}

      <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-2">
        <p className="mb-2 text-xs text-zinc-500">Preview</p>
        <div className="flex items-center gap-3">
          <PlaylistArtwork
            className="h-16 w-16 rounded-md border border-zinc-700 bg-zinc-900"
            iconClassName="h-5 w-5"
            imageUrl={previewImage}
            name={previewName}
          />
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-zinc-200">{previewName}</p>
            <p className="truncate text-xs text-zinc-500">{previewTrackCount}</p>
          </div>
        </div>
      </div>
    </>
  )
}
