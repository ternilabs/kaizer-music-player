import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectProps {
  id?: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  ariaLabel?: string
}

export function Select({
  id,
  value,
  options,
  onChange,
  disabled = false,
  className,
  ariaLabel,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? options[0],
    [options, value],
  )

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (!rootRef.current?.contains(target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [])

  const toggleOpen = () => {
    if (disabled) {
      return
    }
    setIsOpen((prev) => !prev)
  }

  const close = () => {
    setIsOpen(false)
  }

  return (
    <div className={cn('relative', className)} ref={rootRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={cn(
          'min-h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 pr-11 text-left text-sm text-zinc-100 outline-none transition focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-emerald-400',
          disabled && 'cursor-not-allowed opacity-55',
        )}
        disabled={disabled}
        id={id}
        onClick={toggleOpen}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            close()
            return
          }

          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setIsOpen(true)
          }
        }}
        type="button"
      >
        {selectedOption?.label ?? ''}
      </button>

      <ChevronDown className={cn('pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 transition', isOpen && 'rotate-180')} />

      {isOpen ? (
        <div
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 shadow-xl"
          role="listbox"
        >
          <ul className="max-h-56 overflow-y-auto py-1">
            {options.map((option) => {
              const isSelected = option.value === selectedOption?.value

              return (
                <li key={option.value}>
                  <button
                    aria-disabled={option.disabled === true}
                    className={cn(
                      'flex min-h-9 w-full items-center justify-between px-3 text-left text-sm transition',
                      option.disabled
                        ? 'cursor-not-allowed text-zinc-500'
                        : isSelected
                          ? 'bg-zinc-800 text-zinc-100'
                          : 'text-zinc-200 hover:bg-zinc-800/80',
                    )}
                    disabled={option.disabled === true}
                    onClick={() => {
                      if (option.disabled) {
                        return
                      }
                      onChange(option.value)
                      close()
                    }}
                    role="option"
                    type="button"
                  >
                    <span>{option.label}</span>
                    <Check className={cn('h-4 w-4', isSelected ? 'opacity-100 text-emerald-400' : 'opacity-0')} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
