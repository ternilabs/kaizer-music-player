import { Dialog } from './Dialog'
import { cn } from '@/lib/cn'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  confirmDisabled?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  confirmDisabled = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      description={description}
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      footer={(
        <>
          <button
            className="ui-btn-secondary min-h-11 rounded-lg px-4"
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={cn(
              'min-h-11 rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
              tone === 'danger' ? 'ui-btn-danger' : 'ui-btn-primary',
            )}
            disabled={confirmDisabled}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </>
      )}
    />
  )
}
