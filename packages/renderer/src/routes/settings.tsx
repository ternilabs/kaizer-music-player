import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useAppState } from '@/app/appStateContext'
import type { BackupExportScope } from '@/app/types'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingsForm } from '@/components/ui/SettingsForm'
import { useToast } from '@/components/ui/useToast'
import {
  createStorageCapacityInputSchema,
  getFirstValidationIssue,
  getStorageCapacityHeadroomWarning,
  normalizeSingleLineTextInput,
} from '@/lib/inputValidation'

function SettingsRouteComponent() {
  const {
    backupOperationStatus,
    clearDownloads,
    downloadBatchProgress,
    downloadingTrackIds,
    exportBackup,
    importBackup,
    logs,
    preferredServerId,
    refreshServers,
    setPreferredServerId,
    servers,
    storageCapacityMb,
    totalDownloadedSizeMb,
    updateStorageCapacity,
  } = useAppState()
  const { pushToast } = useToast()
  const [storageCapacityInput, setStorageCapacityInput] = useState(String(storageCapacityMb))
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false)
  const [isImportBackupDialogOpen, setIsImportBackupDialogOpen] = useState(false)
  const [backupExportScope, setBackupExportScope] = useState<BackupExportScope>('data-only')

  useEffect(() => {
    setStorageCapacityInput(String(storageCapacityMb))
  }, [storageCapacityMb])

  const refreshServersMutation = useMutation({
    mutationFn: async () => {
      const startedAt = Date.now()
      await refreshServers()
      const elapsedMs = Date.now() - startedAt
      const remainingMs = Math.max(0, 450 - elapsedMs)

      if (remainingMs > 0) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, remainingMs)
        })
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Unable to refresh servers right now.'
      pushToast({
        message,
        tone: 'warning',
      })
    },
  })

  const clearDownloadsMutation = useMutation({
    mutationFn: async () => {
      await clearDownloads()
    },
    onSuccess: () => {
      setIsClearDialogOpen(false)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Unable to clear downloads right now.'
      pushToast({
        message,
        tone: 'warning',
      })
    },
  })

  const runtimePlatform = typeof navigator === 'undefined' ? 'Unknown' : navigator.platform
  const hasActiveDownloads = (
    downloadingTrackIds.length > 0
    || downloadBatchProgress.status === 'running'
    || downloadBatchProgress.status === 'paused'
    || downloadBatchProgress.status === 'terminating'
  )
  const isExportingBackup = backupOperationStatus === 'exporting'
  const isImportingBackup = backupOperationStatus === 'importing'
  const isBackupBusy = backupOperationStatus !== 'idle'
  const backupActionNotice = hasActiveDownloads
    ? 'Backup actions are disabled while downloads are active.'
    : isExportingBackup
      ? 'Backup export is currently running.'
      : isImportingBackup
        ? 'Backup import is currently running.'
        : ''
  const minimumAllowedStorageMb = Math.max(1, Math.ceil(totalDownloadedSizeMb))
  const storageCapacityValidation = createStorageCapacityInputSchema(minimumAllowedStorageMb).safeParse(storageCapacityInput)
  const hasEditedStorageCapacity = storageCapacityInput !== String(storageCapacityMb)
  const storageCapacityError = hasEditedStorageCapacity && !storageCapacityValidation.success
    ? getFirstValidationIssue(storageCapacityValidation.error)
    : ''
  const storageCapacityWarning = storageCapacityValidation.success
    ? getStorageCapacityHeadroomWarning(storageCapacityValidation.data, totalDownloadedSizeMb)
    : ''
  const isStorageCapacitySaveDisabled = !hasEditedStorageCapacity || !storageCapacityValidation.success

  return (
    <section className="flex h-full min-h-0 flex-col">
      <SectionHeader
        title="Configuration"
        titleClassName="font-semibold tracking-[-0.052em] !text-zinc-100/95"
      />
      <SettingsForm
        appVersion={__APP_VERSION__}
        backupActionNotice={backupActionNotice}
        backupExportScope={backupExportScope}
        developerName="TerniLabs"
        isBackupActionDisabled={hasActiveDownloads || isBackupBusy}
        isExportingBackup={isExportingBackup}
        isImportingBackup={isImportingBackup}
        isRefreshingServers={refreshServersMutation.isPending}
        logs={logs}
        onBackupExportScopeChange={setBackupExportScope}
        onCopyDonationAddress={(network, address) => {
          void navigator.clipboard.writeText(address)
            .then(() => {
              pushToast({
                message: `${network} donation address copied.`,
              })
            })
            .catch((error) => {
              const message = error instanceof Error ? error.message : `Unable to copy ${network} donation address.`
              pushToast({
                message,
                tone: 'warning',
              })
            })
        }}
        onClearDownloads={() => setIsClearDialogOpen(true)}
        onExportBackup={() => {
          if (!hasActiveDownloads && !isBackupBusy) {
            void exportBackup(backupExportScope).catch((error) => {
              const message = error instanceof Error ? error.message : 'Unable to export backup right now.'
              pushToast({
                message,
                tone: 'warning',
              })
            })
          }
        }}
        onImportBackup={() => {
          if (!hasActiveDownloads && !isBackupBusy) {
            setIsImportBackupDialogOpen(true)
          }
        }}
        onPreferredServerChange={setPreferredServerId}
        onRefreshServers={() => {
          if (!refreshServersMutation.isPending) {
            refreshServersMutation.mutate()
          }
        }}
        onSaveStorageCapacity={() => {
          if (!storageCapacityValidation.success) {
            return
          }

          const parsedValue = storageCapacityValidation.data

          try {
            updateStorageCapacity(parsedValue)
            pushToast({
              message: `Storage capacity saved: ${parsedValue} MB.`,
            })

            if (storageCapacityWarning) {
              pushToast({
                durationMs: 4800,
                message: storageCapacityWarning,
                tone: 'warning',
              })
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to save storage capacity right now.'
            pushToast({
              message,
              tone: 'warning',
            })
          }
        }}
        onStorageInputChange={(value) => setStorageCapacityInput(normalizeSingleLineTextInput(value))}
        preferredServerId={preferredServerId}
        runtimePlatform={runtimePlatform}
        servers={servers}
        isStorageCapacitySaveDisabled={isStorageCapacitySaveDisabled}
        storageCapacityInput={storageCapacityInput}
        storageCapacityError={storageCapacityError}
        storageCapacityWarning={hasEditedStorageCapacity ? storageCapacityWarning : ''}
        storageCapacityMb={storageCapacityMb}
        totalDownloadedSizeMb={totalDownloadedSizeMb}
      />

      <ConfirmDialog
        confirmLabel="Clear all downloads"
        description="This action removes every downloaded track from local storage."
        isOpen={isClearDialogOpen}
        onCancel={() => setIsClearDialogOpen(false)}
        onConfirm={() => {
          if (!clearDownloadsMutation.isPending) {
            clearDownloadsMutation.mutate()
          }
        }}
        title="Delete all downloads?"
        tone="danger"
      />
      <ConfirmDialog
        confirmLabel={isImportingBackup ? 'Importing...' : 'Choose backup file'}
        confirmDisabled={isImportingBackup}
        description="This import merges the selected backup into the current device."
        isOpen={isImportBackupDialogOpen}
        onCancel={() => {
          if (!isImportingBackup) {
            setIsImportBackupDialogOpen(false)
          }
        }}
        onConfirm={() => {
          if (!isImportingBackup) {
            void importBackup()
              .catch((error) => {
                const message = error instanceof Error ? error.message : 'Unable to import backup right now.'
                pushToast({
                  message,
                  tone: 'warning',
                })
              })
              .finally(() => {
                setIsImportBackupDialogOpen(false)
              })
          }
        }}
        title="Import backup?"
      />
    </section>
  )
}

export const Route = createFileRoute('/settings')({
  component: SettingsRouteComponent,
})
