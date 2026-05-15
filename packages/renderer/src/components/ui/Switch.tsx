import { cn } from '@/lib/cn'

interface SwitchProps {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  id?: string
  ariaLabel?: string
}

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  id,
  ariaLabel,
}: SwitchProps) {
  return (
    <button
      aria-checked={checked}
      aria-label={ariaLabel}
      className={cn(
        'relative inline-flex h-6 w-11 items-center justify-start overflow-hidden rounded-full p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
        checked ? 'bg-emerald-500/70' : 'bg-zinc-700/80',
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
      )}
      disabled={disabled}
      id={id}
      onClick={() => {
        if (disabled || !onCheckedChange) {
          return
        }

        onCheckedChange(!checked)
      }}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          'h-5 w-5 rounded-full bg-zinc-100 shadow transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}
