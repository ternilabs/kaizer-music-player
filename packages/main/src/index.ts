import type {AppInitConfig} from './AppInitConfig.js';
import {createModuleRunner} from './ModuleRunner.js';
import {disallowMultipleAppInstance} from './modules/SingleInstanceApp.js';
import {createWindowManagerModule} from './modules/WindowManager.js';
import {terminateAppOnLastWindowClose} from './modules/ApplicationTerminatorOnLastWindowClose.js';
import {hardwareAccelerationMode} from './modules/HardwareAccelerationModule.js';
import {autoUpdater} from './modules/AutoUpdater.js';
import {allowInternalOrigins} from './modules/BlockNotAllowdOrigins.js';
import {allowExternalUrls} from './modules/ExternalUrls.js';
import {atlasIpcModule} from './modules/AtlasIpc.js';
import {orionIpcModule} from './modules/OrionIpc.js';
import {heliosIpcModule} from './modules/HeliosIpc.js';
import {storageIpcModule} from './modules/StorageIpc.js';
import {downloadsIpcModule} from './modules/DownloadsIpc.js';
import {mediaCacheIpcModule} from './modules/MediaCacheIpc.js';
import {updateIpcModule} from './modules/UpdateIpc.js';
import {lyricsIpcModule} from './modules/LyricsIpc.js';
import {backupIpcModule} from './modules/BackupIpc.js';


export async function initApp(initConfig: AppInitConfig) {
  const moduleRunner = createModuleRunner()
    .init(createWindowManagerModule({initConfig, openDevTools: import.meta.env.DEV}))
    .init(disallowMultipleAppInstance())
    .init(terminateAppOnLastWindowClose())
    .init(hardwareAccelerationMode({enable: false}))
    .init(autoUpdater())

    // Install DevTools extension if needed
    // .init(chromeDevToolsExtension({extension: 'VUEJS3_DEVTOOLS'}))

    // Security
    .init(allowInternalOrigins(
      new Set(initConfig.renderer instanceof URL ? [initConfig.renderer.origin] : []),
    ))
    .init(allowExternalUrls(
      new Set(
        initConfig.renderer instanceof URL
          ? [
            'https://vite.dev',
            'https://developer.mozilla.org',
            'https://solidjs.com',
            'https://qwik.dev',
            'https://lit.dev',
            'https://react.dev',
            'https://preactjs.com',
            'https://www.typescriptlang.org',
            'https://vuejs.org',
          ]
          : [],
      ),
    ))

    // IPC services
    .init(storageIpcModule())
    .init(backupIpcModule())
    .init(downloadsIpcModule())
    .init(mediaCacheIpcModule())
    .init(updateIpcModule())
    .init(lyricsIpcModule())
    .init(atlasIpcModule())
    .init(orionIpcModule())
    .init(heliosIpcModule());

  await moduleRunner;
}
