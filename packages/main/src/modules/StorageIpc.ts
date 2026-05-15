import { ipcMain } from 'electron'
import type { AppModule } from '../AppModule.js'
import type { ModuleContext } from '../ModuleContext.js'
import { normalizeStorageSnapshot } from '../storage/normalizeSnapshot.js'
import { storageService } from '../storage/StorageService.js'

class StorageIpcModule implements AppModule {
  async enable({ app }: ModuleContext): Promise<void> {
    await app.whenReady()
    const userDataPath = app.getPath('userData')
    try {
      storageService.init(userDataPath)
    } catch (error) {
      console.error('Storage init failed during module startup. Handlers will still be registered for recovery.', error)
    }

    ipcMain.removeHandler('storage:get-bootstrap')
    ipcMain.handle('storage:get-bootstrap', async () => {
      try {
        return {
          ...storageService.getBootstrapSnapshot(),
          storageDebugMessage: storageService.getInitDebugMessage(),
          storageDebugTone: 'info' as const,
        }
      } catch (error) {
        console.error('storage:get-bootstrap failed. Attempting storage recovery.', error)

        try {
          storageService.reset(userDataPath)
          return {
            ...storageService.getBootstrapSnapshot(),
            storageDebugMessage: storageService.getInitDebugMessage(),
            storageDebugTone: 'warning' as const,
          }
        } catch (recoveryError) {
          console.error('storage:get-bootstrap recovery failed. Returning empty snapshot.', recoveryError)
          return {
            ...storageService.createEmptySnapshot(),
            storageDebugMessage: storageService.getInitDebugMessage(),
            storageDebugTone: 'warning' as const,
          }
        }
      }
    })

    ipcMain.removeHandler('storage:save-snapshot')
    ipcMain.handle('storage:save-snapshot', async (_event, rawInput: unknown) => {
      const snapshot = normalizeStorageSnapshot(rawInput)

      try {
        storageService.saveSnapshot(snapshot)
        return { ok: true }
      } catch (error) {
        console.error('storage:save-snapshot failed. Attempting storage recovery.', error)

        try {
          storageService.reset(userDataPath)
          storageService.saveSnapshot(snapshot)
          return { ok: true }
        } catch (recoveryError) {
          console.error('storage:save-snapshot recovery failed.', recoveryError)
          throw recoveryError
        }
      }
    })
  }
}

export function storageIpcModule() {
  return new StorageIpcModule()
}
