import type { MouseEvent, PropsWithChildren, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

interface DialogProps {
  isOpen: boolean
  title: string
  description?: string
  onClose: () => void
  footer?: ReactNode
  maxWidthClassName?: string
  closeOnBackdropClick?: boolean
  mode?: 'modal' | 'inline'
  panelClassName?: string
  hideHeader?: boolean
}

export function Dialog({
  isOpen,
  title,
  description,
  onClose,
  footer,
  maxWidthClassName = 'max-w-md',
  closeOnBackdropClick = true,
  mode = 'modal',
  panelClassName = '',
  hideHeader = false,
  children,
}: PropsWithChildren<DialogProps>) {
  const [shouldRender, setShouldRender] = useState(isOpen)
  const [isVisible, setIsVisible] = useState(isOpen)
  const closeTimerRef = useRef<number | null>(null)
  const openFrameOneRef = useRef<number | null>(null)
  const openFrameTwoRef = useRef<number | null>(null)

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
    }, 180)
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

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (mode !== 'modal') {
      return
    }

    if (!closeOnBackdropClick) {
      return
    }

    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  const panel = (
    <div
      className={cn(
        'w-full rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl transition-all duration-200 ease-out',
        isVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[0.985] opacity-0',
        maxWidthClassName,
        panelClassName,
      )}
    >
      {!hideHeader ? (
        <>
          <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
          {description ? <p className="mt-2 text-sm text-zinc-400">{description}</p> : null}
        </>
      ) : null}

      <div className={hideHeader ? '' : 'mt-4'}>{children}</div>

      {footer ? <div className="mt-6 flex flex-wrap gap-3">{footer}</div> : null}
    </div>
  )

  if (mode === 'inline') {
    return panel
  }

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ease-out',
        isVisible ? 'bg-black/70 opacity-100 pointer-events-auto' : 'bg-black/70 opacity-0 pointer-events-none',
      )}
      onClick={handleBackdropClick}
      role="presentation"
    >
      {panel}
    </div>,
    document.body,
  )
}
