import type { ReactNode } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

export type ToastTone = 'info' | 'warning'

export interface ToastEntry {
  id: string
  message: ReactNode
  tone: ToastTone
  isClosing: boolean
}

interface ToastProps {
  id: string
  message: ReactNode
  tone?: ToastTone
  isClosing?: boolean
  onClose: (id: string) => void
}

const toneClassMap: Record<ToastTone, string> = {
  info: 'border-emerald-500/45 bg-emerald-500/12 text-emerald-200',
  warning: 'border-amber-500/45 bg-amber-500/12 text-amber-200',
}

export function Toast({
  id,
  message,
  tone = 'info',
  isClosing = false,
  onClose,
}: ToastProps) {
  const ToneIcon = tone === 'warning' ? AlertTriangle : Info
  const toastAnimationClass = isClosing ? 'animate-toast-exit' : 'animate-toast-enter'

  return (
    <div className={cn('pointer-events-auto flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-3 shadow-xl', toastAnimationClass, toneClassMap[tone])}>
      <ToneIcon className="h-4 w-4 shrink-0" />
      <p className="flex-1 text-sm leading-5">{message}</p>
      <button
        aria-label="Close notification"
        className="shrink-0 rounded p-0.5 text-current/80 transition hover:bg-black/20 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        onClick={() => onClose(id)}
        type="button"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

interface ToastViewportProps {
  toasts: ToastEntry[]
  onClose: (id: string) => void
}

export function ToastViewport({ toasts, onClose }: ToastViewportProps) {
  if (toasts.length === 0 || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="pointer-events-none fixed right-5 top-5 z-[70] flex w-[calc(100%-2.5rem)] max-w-md flex-col gap-3">
      {toasts.map((toast) => (
        <Toast
          id={toast.id}
          isClosing={toast.isClosing}
          key={toast.id}
          message={toast.message}
          onClose={onClose}
          tone={toast.tone}
        />
      ))}
    </div>,
    document.body,
  )
}
