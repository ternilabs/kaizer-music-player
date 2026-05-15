import { Headphones } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/cn'

interface PlaylistArtworkProps {
  name: string
  imageUrl?: string
  className?: string
  iconClassName?: string
}

export function PlaylistArtwork({
  name,
  imageUrl,
  className = 'h-10 w-10 rounded-md border border-zinc-700',
  iconClassName = 'h-4 w-4',
}: PlaylistArtworkProps) {
  const [failedImageUrl, setFailedImageUrl] = useState('')
  const normalizedImageUrl = imageUrl?.trim()
  const showImage = Boolean(normalizedImageUrl) && normalizedImageUrl !== failedImageUrl

  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden bg-zinc-950 text-zinc-400', className)}>
      {showImage ? (
        <img
          alt={`${name} cover`}
          className="h-full w-full object-cover"
          onError={() => setFailedImageUrl(normalizedImageUrl ?? '')}
          src={normalizedImageUrl}
        />
      ) : (
        <Headphones className={iconClassName} />
      )}
    </div>
  )
}
