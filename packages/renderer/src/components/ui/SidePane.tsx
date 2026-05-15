import { type PropsWithChildren, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface SidePaneProps {
  isOpen: boolean
  title: string
  description?: string
  onClose: () => void
  footer?: ReactNode
  className?: string
  bodyClassName?: string
  showCloseButton?: boolean
}

export const SIDE_PANE_EXIT_DURATION_MS = 220

export function SidePane({
  isOpen,
  title,
  description,
  onClose,
  footer,
  className,
  bodyClassName,
  showCloseButton = true,
  children,
}: PropsWithChildren<SidePaneProps>) {
  const [shouldRender, setShouldRender] = useState(isOpen)
  const [isVisible, setIsVisible] = useState(isOpen)
  const closeTimerRef = useRef<number | null>(null)
  const openFrameOneRef = useRef<number | null>(null)
  const openFrameTwoRef = useRef<number | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  const clearAnimationHandles = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }

    if (openFrameOneRef.current !== null) {
      window.cancelAnimationFrame(openFrameOneRef.current)
      openFrameOneRef.current = null
    }

    if (openFrameTwoRef.current !== null) {
      window.cancelAnimationFrame(openFrameTwoRef.current)
      openFrameTwoRef.current = null
    }
  }

  useEffect(() => {
    clearAnimationHandles()

    if (isOpen) {
      openFrameOneRef.current = window.requestAnimationFrame(() => {
        setShouldRender(true)
        setIsVisible(false)
        openFrameOneRef.current = null

        openFrameTwoRef.current = window.requestAnimationFrame(() => {
          setIsVisible(true)
          openFrameTwoRef.current = null
        })
      })
      return
    }

    openFrameOneRef.current = window.requestAnimationFrame(() => {
      setIsVisible(false)
      openFrameOneRef.current = null
    })

    closeTimerRef.current = window.setTimeout(() => {
      setShouldRender(false)
      closeTimerRef.current = null
    }, SIDE_PANE_EXIT_DURATION_MS)
  }, [isOpen])

  useEffect(() => {
    return () => {
      clearAnimationHandles()
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', onEscape)

    return () => {
      document.removeEventListener('keydown', onEscape)
    }
  }, [isOpen, onClose])

  if (!shouldRender) {
    return null
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-40 overflow-hidden"
      role="presentation"
    >
      <aside
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="false"
        className={cn(
          'app-side-pane-width pointer-events-auto absolute right-0 top-0 flex h-full max-w-full flex-col border-l border-white/10 bg-zinc-950/12 backdrop-blur-[30px] transition-all duration-200 ease-out motion-reduce:translate-x-0 motion-reduce:transition-none',
          isVisible ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0',
          className,
        )}
        role="dialog"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.035)_16%,rgba(255,255,255,0.012)_36%,rgba(255,255,255,0.02)_100%)]"
        />

        <div className="relative z-10 flex items-start justify-between gap-4 border-b border-white/8 bg-white/[0.02] px-5 py-4 lg:px-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-zinc-100" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-zinc-400" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>

          {showCloseButton ? (
            <button
              aria-label={`Close ${title}`}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-300 transition hover:border-white/18 hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className={cn('relative z-10 min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-6', bodyClassName)}>
          {children}
        </div>

        {footer ? (
          <div className="relative z-10 flex flex-wrap gap-3 border-t border-white/8 bg-white/[0.015] px-5 py-4 lg:px-6">
            {footer}
          </div>
        ) : null}
      </aside>
    </div>
  )
}
