import type { ReactNode } from 'react'
import { createContext } from 'react'
import type { ToastTone } from './Toast'

export interface PushToastInput {
  message: ReactNode
  tone?: ToastTone
  durationMs?: number
}

export interface ToastContextValue {
  pushToast: (input: PushToastInput) => string
  dismissToast: (toastId: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
