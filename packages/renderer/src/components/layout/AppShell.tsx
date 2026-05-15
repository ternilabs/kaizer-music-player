import { type PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react'
import { send } from '@app/preload'
import { useLocation } from '@tanstack/react-router'
import { useAppState } from '@/app/appStateContext'
import { Dialog } from '@/components/ui/Dialog'
import { DownloadManagerPanel } from '@/components/ui/DownloadManagerPanel'
import { LYRICS_PANEL_PORTAL_TARGET_ID } from '@/components/ui/LyricsPanel'
import { QUEUE_PANEL_PORTAL_TARGET_ID } from '@/components/ui/QueuePanel'
import { SIDE_PANE_EXIT_DURATION_MS } from '@/components/ui/SidePane'
import { PlayerBar } from './PlayerBar'
import { Sidebar } from './Sidebar'

export type ActivePlayerPane = 'lyrics' | 'queue' | 'downloads' | null

export function AppShell({ children }: PropsWithChildren) {
  const {
    automaticUpdateCheckEnabled,
    appendLog,
    allTracks,
    downloadBatchProgress,
    pauseDownloadBatch,
    resumeDownloadBatch,
    retryFailedDownloads,
    terminateDownloadBatch,
  } = useAppState()
  const location = useLocation()
  const routeTransitionKey = location.pathname
  const shouldCheckForUpdates = !import.meta.env.DEV
  const [manualUpdateRequirement, setManualUpdateRequirement] = useState<{
    required: boolean
    currentVersion: string
    latestVersion: string | null
    releaseUrl: string | null
    packageLabel: '.deb' | '.exe' | 'release asset'
    reason?: string
  } | null>(null)
  const [isManualUpdateCheckLoading, setIsManualUpdateCheckLoading] = useState(shouldCheckForUpdates)
  const [activePlayerPane, setActivePlayerPane] = useState<ActivePlayerPane>(null)
  const paneTransitionTimerRef = useRef<number | null>(null)
  const isManualUpdatePlatform = typeof navigator !== 'undefined' && /linux|win/i.test(navigator.platform)

  const clearPendingPaneTransition = () => {
    if (paneTransitionTimerRef.current !== null) {
      window.clearTimeout(paneTransitionTimerRef.current)
      paneTransitionTimerRef.current = null
    }
  }

  const handleActivePlayerPaneChange = (nextPane: ActivePlayerPane) => {
    clearPendingPaneTransition()

    if (nextPane === null || activePlayerPane === null || activePlayerPane === nextPane) {
      setActivePlayerPane(nextPane === activePlayerPane ? null : nextPane)
      return
    }

    setActivePlayerPane(null)
    paneTransitionTimerRef.current = window.setTimeout(() => {
      setActivePlayerPane(nextPane)
      paneTransitionTimerRef.current = null
    }, SIDE_PANE_EXIT_DURATION_MS)
  }

  const fetchManualUpdateRequirement = useCallback(() => {
    return send('updates:get-required-action') as Promise<{
      required: boolean
      currentVersion: string
      latestVersion: string | null
      releaseUrl: string | null
      packageLabel: '.deb' | '.exe' | 'release asset'
      reason?: string
    }>
  }, [])

  const checkManualUpdateRequirement = useCallback(() => {
    setIsManualUpdateCheckLoading(true)
    void fetchManualUpdateRequirement()
      .then((result) => {
        setManualUpdateRequirement(result)
        if (result.required) {
          appendLog(`Update required. Current: ${result.currentVersion}; Latest: ${result.latestVersion ?? 'unknown'}.`)
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Unable to verify latest release.'
        appendLog(message)
      })
      .finally(() => {
        setIsManualUpdateCheckLoading(false)
      })
  }, [appendLog, fetchManualUpdateRequirement])

  useEffect(() => {
    if (!shouldCheckForUpdates) {
      return
    }

    let isCancelled = false

    void fetchManualUpdateRequirement()
      .then((result) => {
        if (isCancelled) {
          return
        }

        setManualUpdateRequirement(result)
        if (result.required) {
          appendLog(`Update required. Current: ${result.currentVersion}; Latest: ${result.latestVersion ?? 'unknown'}.`)
        }
      })
      .catch((error) => {
        if (isCancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'Unable to verify latest release.'
        appendLog(message)
      })
      .finally(() => {
        if (!isCancelled) {
          setIsManualUpdateCheckLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [appendLog, fetchManualUpdateRequirement, shouldCheckForUpdates])

  useEffect(() => {
    if (!automaticUpdateCheckEnabled || !shouldCheckForUpdates) {
      return
    }

    void (send('updates:check') as Promise<{ message: string; updateAvailable: boolean; required: boolean }>)
      .then((result) => {
        appendLog(result.message)
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Automatic update check failed.'
        appendLog(message)
      })
  }, [automaticUpdateCheckEnabled, appendLog, shouldCheckForUpdates])

  useEffect(() => {
    return () => {
      clearPendingPaneTransition()
    }
  }, [])

  useEffect(() => {
    const preventDefaultDragBehavior = (event: DragEvent) => {
      event.preventDefault()
    }

    window.addEventListener('dragstart', preventDefaultDragBehavior)
    window.addEventListener('dragover', preventDefaultDragBehavior)
    window.addEventListener('drop', preventDefaultDragBehavior)

    return () => {
      window.removeEventListener('dragstart', preventDefaultDragBehavior)
      window.removeEventListener('dragover', preventDefaultDragBehavior)
      window.removeEventListener('drop', preventDefaultDragBehavior)
    }
  }, [])

  return (
    <div className="app-shell-frame flex h-screen flex-col gap-2 overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)] lg:gap-3">
      <div className="min-h-0 flex-1">
        <div className="app-shell-content flex h-full w-full flex-col gap-3 px-3 pt-3 lg:flex-row lg:gap-3 lg:px-4 lg:pt-4 xl:px-5 xl:pt-5 2xl:px-8 2xl:pt-6">
          <Sidebar />
          <div className="relative min-h-0 min-w-0 flex-1 lg:pr-1">
            <main className="h-full min-h-0 overflow-hidden p-0">
              <div className="animate-route-enter h-full min-h-0" key={routeTransitionKey}>
                {children}
              </div>
            </main>

            <DownloadManagerPanel
              isOpen={activePlayerPane === 'downloads'}
              onClose={() => setActivePlayerPane(null)}
              onPause={pauseDownloadBatch}
              onResume={resumeDownloadBatch}
              onRetry={() => {
                void retryFailedDownloads()
              }}
              onTerminate={terminateDownloadBatch}
              progress={downloadBatchProgress}
              tracks={allTracks}
            />
            <div className="pointer-events-none absolute inset-0" id={QUEUE_PANEL_PORTAL_TARGET_ID} />
            <div className="pointer-events-none absolute inset-0" id={LYRICS_PANEL_PORTAL_TARGET_ID} />
          </div>
        </div>
      </div>
      <PlayerBar
        activePlayerPane={activePlayerPane}
        onActivePlayerPaneChange={handleActivePlayerPaneChange}
      />
      <Dialog
        closeOnBackdropClick={false}
        description={isManualUpdateCheckLoading
          ? 'Checking if your installed version is up to date...'
          : manualUpdateRequirement?.required
          ? `Version ${manualUpdateRequirement.latestVersion ?? 'latest'} is required. Your current version is ${manualUpdateRequirement.currentVersion}.`
          : 'Checking update requirement...'}
        footer={(
          <>
            <button
              className="ui-btn-secondary min-h-11 rounded-lg px-4"
              onClick={checkManualUpdateRequirement}
              type="button"
            >
              {isManualUpdateCheckLoading ? 'Checking...' : 'Retry check'}
            </button>
            <button
              className="ui-btn-primary min-h-11 rounded-lg px-4"
              disabled={!manualUpdateRequirement?.releaseUrl}
              onClick={() => {
                if (!manualUpdateRequirement?.releaseUrl) {
                  return
                }

                void send('updates:open-release-url', { url: manualUpdateRequirement.releaseUrl })
              }}
              type="button"
            >
              Download latest {manualUpdateRequirement?.packageLabel ?? 'release asset'}
            </button>
          </>
        )}
        isOpen={isManualUpdatePlatform && Boolean(manualUpdateRequirement?.required)}
        onClose={() => {}}
        title="Update required"
      >
        <p className="text-sm text-zinc-400">
          Kaizer requires the latest published version before continuing.
        </p>
        {manualUpdateRequirement?.reason ? (
          <p className="mt-2 text-xs text-zinc-500">{manualUpdateRequirement.reason}</p>
        ) : null}
      </Dialog>
    </div>
  )
}
