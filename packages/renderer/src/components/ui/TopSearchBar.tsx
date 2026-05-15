import type { ReactNode } from 'react'
import { LoaderCircle, Search } from 'lucide-react'
import { cn } from '@/lib/cn'

interface SearchSubmitButtonConfig {
  ariaLabel: string
  onClick: () => void
  disabled?: boolean
  icon?: ReactNode
}

interface TopSearchBarProps {
  value: string
  placeholder: string
  onChange: (value: string) => void
  onEnter?: () => void
  submitButton?: SearchSubmitButtonConfig
  isLoading?: boolean
  disabled?: boolean
  className?: string
  inputClassName?: string
  iconClassName?: string
  error?: string
}

export function TopSearchBar({
  value,
  placeholder,
  onChange,
  onEnter,
  submitButton,
  isLoading = false,
  disabled = false,
  className,
  inputClassName,
  iconClassName,
  error,
}: TopSearchBarProps) {
  const isInputDisabled = disabled || isLoading
  const isSubmitDisabled = submitButton?.disabled || isInputDisabled

  return (
    <>
      <label className={cn(
        'ui-control-search mt-3',
        isInputDisabled && 'cursor-not-allowed opacity-80',
        error && 'border-rose-500/50 bg-rose-500/5',
        className,
      )}
      >
        <Search className={cn('h-4 w-4 shrink-0 text-zinc-400', iconClassName, error && 'text-rose-300')} />
        <input
          aria-invalid={error ? true : undefined}
          className={cn('ui-control-input disabled:cursor-not-allowed', error && 'text-rose-100 placeholder:text-rose-200/60', inputClassName)}
          disabled={isInputDisabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !onEnter || isInputDisabled) {
              return
            }

            event.preventDefault()
            onEnter()
          }}
          placeholder={placeholder}
          value={value}
        />
        {isLoading ? (
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-zinc-500" />
        ) : submitButton ? (
          <button
            aria-label={submitButton.ariaLabel}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-zinc-500 transition hover:text-zinc-300 disabled:cursor-not-allowed disabled:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            disabled={isSubmitDisabled}
            onClick={submitButton.onClick}
            type="button"
          >
            {submitButton.icon}
          </button>
        ) : null}
      </label>
      {error ? (
        <p className="mt-1 px-1 text-xs text-rose-300">{error}</p>
      ) : null}
    </>
  )
}
