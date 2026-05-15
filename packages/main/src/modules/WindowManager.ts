import type {AppModule} from '../AppModule.js';
import {ModuleContext} from '../ModuleContext.js';
import {BrowserWindow, screen} from 'electron';
import type {AppInitConfig} from '../AppInitConfig.js';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

const DESIGN_WINDOW_WIDTH = 1440;
const DESIGN_WINDOW_HEIGHT = 1006;
const MIN_WINDOW_WIDTH = 1180;
const MIN_WINDOW_HEIGHT = 640;
const WINDOW_EDGE_MARGIN = 48;

function fitWindowDimension(preferredSize: number, displayWorkAreaSize: number, minimumSize: number): number {
  const boundedWorkArea = Math.max(0, displayWorkAreaSize);
  const marginAdjustedSize = boundedWorkArea > WINDOW_EDGE_MARGIN
    ? boundedWorkArea - WINDOW_EDGE_MARGIN
    : boundedWorkArea;
  const safeMinimumSize = Math.min(minimumSize, boundedWorkArea);
  const maximumSupportedSize = Math.max(safeMinimumSize, marginAdjustedSize);

  return Math.min(preferredSize, maximumSupportedSize);
}

function resolveWindowBounds(): {width: number; height: number; minWidth: number; minHeight: number} {
  const {workAreaSize} = screen.getPrimaryDisplay();

  return {
    width: fitWindowDimension(DESIGN_WINDOW_WIDTH, workAreaSize.width, MIN_WINDOW_WIDTH),
    height: fitWindowDimension(DESIGN_WINDOW_HEIGHT, workAreaSize.height, MIN_WINDOW_HEIGHT),
    minWidth: fitWindowDimension(MIN_WINDOW_WIDTH, workAreaSize.width, MIN_WINDOW_WIDTH),
    minHeight: fitWindowDimension(MIN_WINDOW_HEIGHT, workAreaSize.height, MIN_WINDOW_HEIGHT),
  };
}

function resolveWindowIconPath(): string | undefined {
  const iconCandidates = [
    join(process.cwd(), 'packages', 'renderer', 'public', 'logo.png'),
    join(process.cwd(), 'buildResources', 'icon.png'),
    join(process.resourcesPath, 'app.asar', 'node_modules', '@app', 'renderer', 'dist', 'logo.png'),
    join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@app', 'renderer', 'dist', 'logo.png'),
  ];

  return iconCandidates.find(path => existsSync(path));
}

class WindowManager implements AppModule {
  readonly #preload: {path: string};
  readonly #renderer: {path: string} | URL;
  readonly #openDevTools;

  constructor({initConfig, openDevTools = false}: {initConfig: AppInitConfig, openDevTools?: boolean}) {
    this.#preload = initConfig.preload;
    this.#renderer = initConfig.renderer;
    this.#openDevTools = openDevTools;
  }

  async enable({app}: ModuleContext): Promise<void> {
    await app.whenReady();
    await this.restoreOrCreateWindow(true);
    app.on('second-instance', () => this.restoreOrCreateWindow(true));
    app.on('activate', () => this.restoreOrCreateWindow(true));
  }

  async createWindow(): Promise<BrowserWindow> {
    const iconPath = resolveWindowIconPath();
    const windowBounds = resolveWindowBounds();
    const browserWindow = new BrowserWindow({
      show: false, // Use the 'ready-to-show' event to show the instantiated BrowserWindow.
      autoHideMenuBar: true,
      center: true,
      width: windowBounds.width,
      height: windowBounds.height,
      minWidth: windowBounds.minWidth,
      minHeight: windowBounds.minHeight,
      maximizable: true,
      fullscreenable: true,
      icon: iconPath,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // Sandbox disabled because the demo of preload script depend on the Node.js api
        webviewTag: false, // The webview tag is not recommended. Consider alternatives like an iframe or Electron's BrowserView. @see https://www.electronjs.org/docs/latest/api/webview-tag#warning
        preload: this.#preload.path,
      },
    });

    if (this.#renderer instanceof URL) {
      await browserWindow.loadURL(this.#renderer.href);
    } else {
      await browserWindow.loadFile(this.#renderer.path);
    }

    browserWindow.removeMenu();

    return browserWindow;
  }

  async restoreOrCreateWindow(show = false) {
    let window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());

    if (window === undefined) {
      window = await this.createWindow();
    }

    if (!show) {
      return window;
    }

    if (window.isMinimized()) {
      window.restore();
    }

    window?.show();

    if (this.#openDevTools) {
      window?.webContents.openDevTools();
    }

    window.focus();

    return window;
  }

}

export function createWindowManagerModule(...args: ConstructorParameters<typeof WindowManager>) {
  return new WindowManager(...args);
}
