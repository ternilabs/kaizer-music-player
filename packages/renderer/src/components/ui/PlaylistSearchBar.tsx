import { Search } from 'lucide-react'
import { cn } from '@/lib/cn'

interface PlaylistSearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  error?: string
}

export function PlaylistSearchBar({
  value,
  onChange,
  placeholder = 'Search tracks in this playlist',
  className,
  error,
}: PlaylistSearchBarProps) {
  return (
    <>
      <label className={cn('ui-control-search w-full sm:w-[380px]', error && 'border-rose-500/50 bg-rose-500/5', className)}>
        <Search className={cn('h-4 w-4 shrink-0 text-zinc-400', error && 'text-rose-300')} />
        <input
          aria-invalid={error ? true : undefined}
          className={cn('ui-control-input', error && 'text-rose-100 placeholder:text-rose-200/60')}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      </label>
      {error ? (
        <p className="mt-1 px-1 text-xs text-rose-300">{error}</p>
      ) : null}
    </>
  )
}
