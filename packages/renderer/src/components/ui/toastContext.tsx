import type { PropsWithChildren } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ToastViewport, type ToastEntry } from './Toast'
import { ToastContext, type PushToastInput } from './toastShared'

const TOAST_EXIT_DURATION_MS = 220

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const toastsRef = useRef<ToastEntry[]>([])
  const nextToastIdRef = useRef(0)
  const dismissTimeoutsRef = useRef<Map<string, number>>(new Map())
  const removalTimeoutsRef = useRef<Map<string, number>>(new Map())

  const clearDismissTimer = useCallback((toastId: string) => {
    const timeoutId = dismissTimeoutsRef.current.get(toastId)
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
      dismissTimeoutsRef.current.delete(toastId)
    }
  }, [])

  const clearRemovalTimer = useCallback((toastId: string) => {
    const timeoutId = removalTimeoutsRef.current.get(toastId)
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
      removalTimeoutsRef.current.delete(toastId)
    }
  }, [])

  const removeToast = useCallback((toastId: string) => {
    clearDismissTimer(toastId)
    clearRemovalTimer(toastId)
    setToasts((currentToasts) => {
      const nextToasts = currentToasts.filter((toast) => toast.id !== toastId)
      toastsRef.current = nextToasts
      return nextToasts
    })
  }, [clearDismissTimer, clearRemovalTimer])

  const dismissToast = useCallback((toastId: string) => {
    clearDismissTimer(toastId)
    clearRemovalTimer(toastId)

    const currentToast = toastsRef.current.find((toast) => toast.id === toastId)
    if (!currentToast || currentToast.isClosing) {
      return
    }

    setToasts((currentToasts) => {
      const nextToasts = currentToasts.map((toast) => {
        if (toast.id !== toastId) {
          return toast
        }

        return {
          ...toast,
          isClosing: true,
        }
      })
      toastsRef.current = nextToasts
      return nextToasts
    })

    const timeoutId = window.setTimeout(() => {
      removeToast(toastId)
    }, TOAST_EXIT_DURATION_MS)
    removalTimeoutsRef.current.set(toastId, timeoutId)
  }, [clearDismissTimer, clearRemovalTimer, removeToast])

  const pushToast = useCallback((input: PushToastInput) => {
    nextToastIdRef.current += 1
    const toastId = `toast-${Date.now()}-${nextToastIdRef.current}`
    const nextToast: ToastEntry = {
      id: toastId,
      message: input.message,
      tone: input.tone ?? 'info',
      isClosing: false,
    }

    setToasts((currentToasts) => {
      const nextToasts = [...currentToasts, nextToast]
      toastsRef.current = nextToasts
      return nextToasts
    })

    const timeoutId = window.setTimeout(() => {
      dismissToast(toastId)
    }, input.durationMs ?? 3200)
    dismissTimeoutsRef.current.set(toastId, timeoutId)

    return toastId
  }, [dismissToast])

  useEffect(() => {
    const dismissTimeouts = dismissTimeoutsRef.current
    const removalTimeouts = removalTimeoutsRef.current

    return () => {
      for (const timeoutId of dismissTimeouts.values()) {
        window.clearTimeout(timeoutId)
      }

      for (const timeoutId of removalTimeouts.values()) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [])

  return (
    <ToastContext.Provider value={{ pushToast, dismissToast }}>
      {children}
      <ToastViewport onClose={dismissToast} toasts={toasts} />
    </ToastContext.Provider>
  )
}
