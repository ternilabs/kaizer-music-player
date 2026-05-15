import { useEffect, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface MenuDropdownItem {
  id: string
  label: string
  onSelect: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
}

interface MenuDropdownProps {
  label: string
  items: MenuDropdownItem[]
  onOpenChange?: (isOpen: boolean) => void
}

export function MenuDropdown({ label, items, onOpenChange }: MenuDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    onOpenChange?.(isOpen)
  }, [isOpen, onOpenChange])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const onDocumentClick = (event: globalThis.MouseEvent) => {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      if (!containerRef.current?.contains(target)) {
        setIsOpen(false)
      }
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('click', onDocumentClick)
    document.addEventListener('keydown', onEscape)

    return () => {
      document.removeEventListener('click', onDocumentClick)
      document.removeEventListener('keydown', onEscape)
    }
  }, [isOpen])

  const onActionClick = (item: MenuDropdownItem) => {
    if (item.disabled) {
      return
    }

    item.onSelect()
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={label}
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
          isOpen && 'text-zinc-100',
        )}
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
      >
        <MoreVertical className="h-[17px] w-[17px]" />
      </button>

      {isOpen ? (
        <div
          className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-900/95 py-1 shadow-2xl"
          role="menu"
        >
          {items.map((item) => (
            <button
              className={cn(
                'flex min-h-11 w-full items-center px-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
                item.tone === 'danger' ? 'text-rose-300 hover:bg-rose-500/15' : 'text-zinc-100 hover:bg-zinc-800',
                item.disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent',
              )}
              disabled={item.disabled}
              key={item.id}
              onClick={() => onActionClick(item)}
              role="menuitem"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
