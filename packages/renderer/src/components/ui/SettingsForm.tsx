import { useState } from 'react'
import { Copy, Download, FileText, HardDrive, LoaderCircle, RotateCcw, Save, Trash2, Upload } from 'lucide-react'
import type { LogItem, PreferredServerId, ServerStatus } from '@/app/types'
import { Dialog } from './Dialog'
import { Label } from './Label'
import { Select } from './Select'
import { StatusBadge } from './StatusBadge'

const donationAddresses = [
  {
    network: 'Solana',
    address: 'DZpP5We6oLqW3XAi9ProBp23LHwdaAUajxXGUzFfHRZY',
  },
  {
    network: 'Ethereum',
    address: '0xd04eA67E6E92f2adc038e10dF173714D8851bed6',
  },
] as const

interface SettingsFormProps {
  backupExportScope: 'data-only' | 'data-with-images' | 'data-with-images-and-tracks'
  backupActionNotice: string
  storageCapacityInput: string
  storageCapacityError?: string
  storageCapacityWarning?: string
  storageCapacityMb: number
  totalDownloadedSizeMb: number
  preferredServerId: PreferredServerId
  runtimePlatform: string
  appVersion: string
  developerName: string
  logs: LogItem[]
  servers: ServerStatus[]
  isBackupActionDisabled: boolean
  isExportingBackup: boolean
  isImportingBackup: boolean
  isRefreshingServers: boolean
  onBackupExportScopeChange: (value: 'data-only' | 'data-with-images' | 'data-with-images-and-tracks') => void
  onStorageInputChange: (value: string) => void
  onSaveStorageCapacity: () => void
  onClearDownloads: () => void
  onExportBackup: () => void
  onImportBackup: () => void
  onPreferredServerChange: (serverId: PreferredServerId) => void
  onRefreshServers: () => void
  onCopyDonationAddress: (network: string, address: string) => void
  isStorageCapacitySaveDisabled?: boolean
}

export function SettingsForm({
  backupExportScope,
  backupActionNotice,
  storageCapacityInput,
  storageCapacityError,
  storageCapacityWarning,
  storageCapacityMb,
  totalDownloadedSizeMb,
  preferredServerId,
  runtimePlatform,
  appVersion,
  developerName,
  logs,
  servers,
  isBackupActionDisabled,
  isExportingBackup,
  isImportingBackup,
  isRefreshingServers,
  onBackupExportScopeChange,
  onStorageInputChange,
  onSaveStorageCapacity,
  onClearDownloads,
  onExportBackup,
  onImportBackup,
  onPreferredServerChange,
  onRefreshServers,
  onCopyDonationAddress,
  isStorageCapacitySaveDisabled = false,
}: SettingsFormProps) {
  const [isLogsDialogOpen, setIsLogsDialogOpen] = useState(false)
  const usagePercentage =
    storageCapacityMb === 0 ? 0 : Math.min(100, Math.round((totalDownloadedSizeMb / storageCapacityMb) * 100))
  const visibleLogs = logs.slice(0, 10)

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 min-[1440px]:grid min-[1440px]:grid-cols-[1fr_1.25fr] min-[1440px]:overflow-hidden min-[1440px]:pr-0">
      <div className="space-y-3 min-[1440px]:flex min-[1440px]:min-h-0 min-[1440px]:flex-col min-[1440px]:gap-3 min-[1440px]:space-y-0 min-[1440px]:overflow-y-auto min-[1440px]:pr-1">
        <section className="ui-surface-panel p-2.5">
          <h2 className="text-sm font-semibold text-zinc-200">Options</h2>

          <div className="mt-2.5 space-y-3">
            <div>
              <Label htmlFor="preferred-server-select">Server</Label>
              <Select
                className="mt-1"
                id="preferred-server-select"
                onChange={(value) => onPreferredServerChange(value as PreferredServerId)}
                options={[
                  { value: 'atlas-main', label: 'Atlas' },
                  { value: 'orion-main', label: 'Orion' },
                  { value: 'helios-main', label: 'Helios' },
                  { value: 'nyx-main', label: 'Nyx', disabled: true },
                  { value: 'kaizer-main', label: 'Kaizer', disabled: true },
                ]}
                value={preferredServerId}
              />
            </div>

            <div>
              <Label htmlFor="storage-capacity-input">Storage capacity</Label>
              <div className="mt-1 flex gap-2">
                <label className={`flex min-h-10 flex-1 items-center gap-2 rounded-md border bg-zinc-900 px-3 text-sm text-zinc-300 ${storageCapacityError ? 'border-rose-500/50 focus-within:border-rose-400' : 'border-zinc-700 focus-within:border-zinc-500'}`}>
                  <HardDrive className="h-4 w-4" />
                  <input
                    aria-invalid={storageCapacityError ? true : undefined}
                    className={`w-full bg-transparent text-sm outline-none ${storageCapacityError ? 'text-rose-100 placeholder:text-rose-200/60' : 'text-zinc-100'}`}
                    id="storage-capacity-input"
                    inputMode="numeric"
                    onChange={(event) => onStorageInputChange(event.target.value)}
                    value={storageCapacityInput}
                  />
                  <span className="text-xs text-zinc-500">MB</span>
                </label>

                <button
                  aria-label="Save storage capacity"
                  className="ui-btn-secondary px-3 font-semibold text-zinc-100"
                  disabled={isStorageCapacitySaveDisabled}
                  onClick={onSaveStorageCapacity}
                  type="button"
                >
                  <Save className="h-4 w-4" />
                </button>
              </div>
            </div>
            {storageCapacityError ? (
              <p className="text-xs text-rose-300">{storageCapacityError}</p>
            ) : null}
            {!storageCapacityError && storageCapacityWarning ? (
              <p className="text-xs text-amber-300">{storageCapacityWarning}</p>
            ) : null}

            <div className="h-2 rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${usagePercentage}%` }} />
            </div>
            <p className="text-xs text-zinc-500">
              {totalDownloadedSizeMb} MB used of {storageCapacityMb} MB
            </p>

            <button
              className="ui-btn-danger flex w-full items-center justify-center gap-2"
              onClick={onClearDownloads}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              Clear downloads
            </button>
          </div>
        </section>

        <section className="ui-surface-panel p-2.5">
          <h2 className="text-sm font-semibold text-zinc-200">Information</h2>
          <dl className="mt-2 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-zinc-500">Renderer</dt>
            <dd className="text-zinc-200">React (Vite)</dd>
            <dt className="text-zinc-500">Platform</dt>
            <dd className="text-zinc-200">{runtimePlatform}</dd>
            <dt className="text-zinc-500">Version</dt>
            <dd className="text-zinc-200">{appVersion}</dd>
            <dt className="text-zinc-500">Developer</dt>
            <dd className="text-zinc-200">{developerName}</dd>
          </dl>

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-zinc-200">Donation</h3>

            <div className="mt-2.5 space-y-2">
              {donationAddresses.map((entry) => (
                <div
                  className="flex items-start gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2.5"
                  key={entry.network}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-200">{entry.network}</p>
                    <p className="mt-0.5 break-all font-mono text-xs leading-5 text-zinc-400">
                      {entry.address}
                    </p>
                  </div>
                  <button
                    aria-label={`Copy ${entry.network} donation address`}
                    className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    onClick={() => onCopyDonationAddress(entry.network, entry.address)}
                    type="button"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <p className="mt-3 text-xs leading-5 text-zinc-500">
              Donations help the project grow, especially toward building its own backend for longer-term usage instead of relying on external APIs.
            </p>
          </div>

          <button
            className="ui-btn-secondary mt-4 inline-flex items-center gap-2 text-zinc-100"
            onClick={() => setIsLogsDialogOpen(true)}
            type="button"
          >
            <FileText className="h-4 w-4" />
            View logs
          </button>
        </section>

        <section className="ui-surface-panel p-2.5">
          <h2 className="text-sm font-semibold text-zinc-200">Backup</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Export one archive for your saved configuration, playlists, artwork, and optional downloaded tracks.
          </p>

          <div className="mt-2.5">
            <Label htmlFor="backup-export-scope">Select your data to export</Label>
            <Select
              className="mt-1"
              id="backup-export-scope"
              onChange={(value) => onBackupExportScopeChange(value as SettingsFormProps['backupExportScope'])}
              options={[
                { value: 'data-only', label: 'Data only' },
                { value: 'data-with-images', label: 'Data with images' },
                { value: 'data-with-images-and-tracks', label: 'Your whole data (including downloaded tracks)' },
              ]}
              value={backupExportScope}
            />
          </div>

          <p className={`mt-2 text-xs ${backupActionNotice ? 'text-amber-300/80' : 'text-zinc-500'}`}>
            {backupActionNotice}
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              className="ui-btn-secondary inline-flex min-h-10 items-center justify-center gap-2 text-zinc-100 disabled:opacity-45"
              disabled={isBackupActionDisabled || isExportingBackup || isImportingBackup}
              onClick={onExportBackup}
              type="button"
            >
              {isExportingBackup ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Export
                </>
              )}
            </button>
            <button
              className="ui-btn-primary inline-flex min-h-10 items-center justify-center gap-2 disabled:opacity-45"
              disabled={isBackupActionDisabled || isImportingBackup || isExportingBackup}
              onClick={onImportBackup}
              type="button"
            >
              {isImportingBackup ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Import
                </>
              )}
            </button>
          </div>
        </section>
      </div>

      <section className="ui-surface-panel flex flex-col min-[1440px]:min-h-0">
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
          <h2 className="text-sm font-semibold text-zinc-200">Servers</h2>
          <button
            aria-label="Refresh servers"
            className="ui-btn-secondary flex min-h-8 items-center justify-center gap-2 border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-200 disabled:opacity-45 disabled:hover:bg-zinc-900"
            disabled={isRefreshingServers}
            onClick={onRefreshServers}
            type="button"
          >
            {isRefreshingServers ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <div className="min-[1440px]:min-h-0 min-[1440px]:flex-1 min-[1440px]:overflow-y-auto">
          {servers.map((server) => (
            <div
              className="grid grid-cols-[1fr_auto] items-center border-b border-zinc-800/70 px-3 py-2 text-sm last:border-b-0"
              key={server.id}
            >
              <span className="text-zinc-200">{server.name}</span>
              <StatusBadge status={server.status} />
            </div>
          ))}
        </div>
      </section>

      <Dialog
        description="Showing the latest 10 events."
        isOpen={isLogsDialogOpen}
        maxWidthClassName="max-w-2xl"
        onClose={() => setIsLogsDialogOpen(false)}
        title="Logs"
        footer={(
          <button
            className="ui-btn-secondary px-4 text-zinc-100"
            onClick={() => setIsLogsDialogOpen(false)}
            type="button"
          >
            Close
          </button>
        )}
      >
        <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
          {visibleLogs.map((log) => (
            <article className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2" key={log.id}>
              <p className="text-sm text-zinc-200">{log.message}</p>
              <p className="mt-1 text-xs text-zinc-500">{log.timestamp}</p>
            </article>
          ))}
          {visibleLogs.length === 0 ? (
            <p className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-6 text-center text-sm text-zinc-500">
              No logs recorded yet.
            </p>
          ) : null}
        </div>
      </Dialog>
    </div>
  )
}
