import { app, ipcMain, shell } from 'electron'
import electronUpdater from 'electron-updater'
import type { AppModule } from '../AppModule.js'

const RELEASE_OWNER = 'TerniLabs'
const RELEASE_REPO = 'kaizer-music-player'
const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${RELEASE_OWNER}/${RELEASE_REPO}/releases/latest`
const RELEASE_LOOKUP_TIMEOUT_MS = 15_000

type LatestReleaseAsset = {
  name?: unknown
  browser_download_url?: unknown
}

type LatestReleaseResponse = {
  tag_name?: unknown
  html_url?: unknown
  assets?: unknown
}

interface ManualUpdateRequirement {
  required: boolean
  currentVersion: string
  latestVersion: string | null
  releaseUrl: string | null
  packageLabel: '.deb' | '.exe' | 'release asset'
  reason?: string
}

interface CheckForUpdatesResult {
  mode: 'manual-gated' | 'auto-updater'
  required: boolean
  updateAvailable: boolean
  currentVersion: string
  latestVersion: string | null
  releaseUrl: string | null
  message: string
}

function getDistributionChannel(): string {
  return typeof import.meta.env.VITE_DISTRIBUTION_CHANNEL === 'string'
    ? import.meta.env.VITE_DISTRIBUTION_CHANNEL.trim().toLowerCase()
    : ''
}

function isPrivateTestBuild(): boolean {
  return getDistributionChannel() === 'private-test'
}

function areReleaseUpdateChecksEnabled(): boolean {
  return app.isPackaged && !import.meta.env.DEV
}

function shouldUseManualUpdateGate(): boolean {
  return areReleaseUpdateChecksEnabled()
    && !isPrivateTestBuild()
    && (process.platform === 'linux' || process.platform === 'win32')
}

function normalizeTagVersion(tagName: string): string {
  return tagName.startsWith('v') ? tagName.slice(1) : tagName
}

function toReleaseAsset(rawAsset: unknown): { name: string; downloadUrl: string } | null {
  const asset = (rawAsset ?? {}) as LatestReleaseAsset
  const name = typeof asset.name === 'string' ? asset.name : ''
  const downloadUrl = typeof asset.browser_download_url === 'string' ? asset.browser_download_url : ''

  if (!name || !downloadUrl) {
    return null
  }

  return {
    name,
    downloadUrl,
  }
}

function getLinuxDebReleaseUrl(release: LatestReleaseResponse): string | null {
  const htmlUrl = typeof release.html_url === 'string' ? release.html_url : ''
  const assets = Array.isArray(release.assets)
    ? release.assets.map(toReleaseAsset).filter((asset): asset is { name: string; downloadUrl: string } => asset !== null)
    : []

  const archHints = process.arch === 'x64'
    ? ['x64', 'amd64']
    : process.arch === 'arm64'
      ? ['arm64', 'aarch64']
      : [process.arch]

  const debAssets = assets.filter((asset) => asset.name.toLowerCase().endsWith('.deb'))
  const matchedArchAsset = debAssets.find((asset) =>
    archHints.some((hint) => asset.name.toLowerCase().includes(hint)))

  if (matchedArchAsset) {
    return matchedArchAsset.downloadUrl
  }

  if (debAssets[0]) {
    return debAssets[0].downloadUrl
  }

  return htmlUrl || null
}

function getWindowsExeReleaseUrl(release: LatestReleaseResponse): string | null {
  const htmlUrl = typeof release.html_url === 'string' ? release.html_url : ''
  const assets = Array.isArray(release.assets)
    ? release.assets.map(toReleaseAsset).filter((asset): asset is { name: string; downloadUrl: string } => asset !== null)
    : []

  const archHints = process.arch === 'x64'
    ? ['x64', 'amd64']
    : process.arch === 'arm64'
      ? ['arm64', 'aarch64']
      : [process.arch]

  const exeAssets = assets.filter((asset) => asset.name.toLowerCase().endsWith('.exe'))
  const matchedArchPortableAsset = exeAssets.find((asset) =>
    archHints.some((hint) => asset.name.toLowerCase().includes(hint)) && asset.name.toLowerCase().includes('portable'))

  if (matchedArchPortableAsset) {
    return matchedArchPortableAsset.downloadUrl
  }

  const matchedArchAsset = exeAssets.find((asset) =>
    archHints.some((hint) => asset.name.toLowerCase().includes(hint)))

  if (matchedArchAsset) {
    return matchedArchAsset.downloadUrl
  }

  if (exeAssets[0]) {
    return exeAssets[0].downloadUrl
  }

  return htmlUrl || null
}

async function fetchLatestRelease(): Promise<LatestReleaseResponse> {
  const response = await fetch(LATEST_RELEASE_API_URL, {
    signal: AbortSignal.timeout(RELEASE_LOOKUP_TIMEOUT_MS),
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Kaizer-Updater/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub release lookup failed (${response.status}).`)
  }

  return response.json() as Promise<LatestReleaseResponse>
}

async function getManualUpdateRequirement(): Promise<ManualUpdateRequirement> {
  const currentVersion = app.getVersion()

  try {
    const latestRelease = await fetchLatestRelease()
    const latestTagName = typeof latestRelease.tag_name === 'string' ? latestRelease.tag_name : ''
    const latestVersion = latestTagName ? normalizeTagVersion(latestTagName) : null

    if (!latestVersion) {
      return {
        required: false,
        currentVersion,
        latestVersion: null,
        releaseUrl: null,
        packageLabel: process.platform === 'win32' ? '.exe' : '.deb',
        reason: 'Latest release version is unavailable.',
      }
    }

    const releaseUrl = process.platform === 'win32'
      ? getWindowsExeReleaseUrl(latestRelease)
      : getLinuxDebReleaseUrl(latestRelease)
    const required = latestVersion !== currentVersion

    return {
      required,
      currentVersion,
      latestVersion,
      releaseUrl,
      packageLabel: process.platform === 'win32' ? '.exe' : '.deb',
    }
  } catch (error) {
    return {
      required: false,
      currentVersion,
      latestVersion: null,
      releaseUrl: null,
      packageLabel: process.platform === 'win32' ? '.exe' : '.deb',
      reason: error instanceof Error ? error.message : 'Unable to verify latest release.',
    }
  }
}

async function checkForUpdates(): Promise<CheckForUpdatesResult> {
  if (!areReleaseUpdateChecksEnabled()) {
    return {
      mode: process.platform === 'linux' || process.platform === 'win32' ? 'manual-gated' : 'auto-updater',
      required: false,
      updateAvailable: false,
      currentVersion: app.getVersion(),
      latestVersion: null,
      releaseUrl: null,
      message: 'Update checks are disabled in development builds.',
    }
  }

  if (isPrivateTestBuild()) {
    return {
      mode: process.platform === 'linux' || process.platform === 'win32' ? 'manual-gated' : 'auto-updater',
      required: false,
      updateAvailable: false,
      currentVersion: app.getVersion(),
      latestVersion: null,
      releaseUrl: null,
      message: 'Private test build: public release gating is disabled.',
    }
  }

  if (shouldUseManualUpdateGate()) {
    const requirement = await getManualUpdateRequirement()
    return {
      mode: 'manual-gated',
      required: requirement.required,
      updateAvailable: requirement.required,
      currentVersion: requirement.currentVersion,
      latestVersion: requirement.latestVersion,
      releaseUrl: requirement.releaseUrl,
      message: requirement.required
        ? `Update required: ${requirement.latestVersion ?? 'new version'} is available.`
        : requirement.reason ?? 'You are using the latest version.',
    }
  }

  const { autoUpdater } = electronUpdater
  autoUpdater.fullChangelog = true

  if (import.meta.env.VITE_DISTRIBUTION_CHANNEL) {
    autoUpdater.channel = import.meta.env.VITE_DISTRIBUTION_CHANNEL
  }

  const currentVersion = app.getVersion()

  try {
    const result = await autoUpdater.checkForUpdatesAndNotify()
    const latestVersion = result?.updateInfo?.version ?? null
    const updateAvailable = Boolean(latestVersion) && latestVersion !== currentVersion

    return {
      mode: 'auto-updater',
      required: false,
      updateAvailable,
      currentVersion,
      latestVersion,
      releaseUrl: null,
      message: updateAvailable
        ? `Update available: ${latestVersion}.`
        : 'You are using the latest version.',
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('No published versions')) {
      return {
        mode: 'auto-updater',
        required: false,
        updateAvailable: false,
        currentVersion,
        latestVersion: null,
        releaseUrl: null,
        message: 'No published updates found.',
      }
    }

    throw error
  }
}

function toOpenReleaseInput(rawInput: unknown): { url: string } {
  const input = (rawInput ?? {}) as { url?: unknown }
  return {
    url: typeof input.url === 'string' ? input.url.trim() : '',
  }
}

function normalizeReleaseUrl(url: string): string {
  if (!url) {
    throw new Error('Release URL is required.')
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error('Release URL is invalid.')
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Release URL must use HTTPS.')
  }

  return parsedUrl.toString()
}

class UpdateIpcModule implements AppModule {
  enable(): void {
    ipcMain.removeHandler('updates:check')
    ipcMain.handle('updates:check', async () => {
      return checkForUpdates()
    })

    ipcMain.removeHandler('updates:get-required-action')
    ipcMain.handle('updates:get-required-action', async () => {
      if (!areReleaseUpdateChecksEnabled()) {
        return {
          required: false,
          currentVersion: app.getVersion(),
          latestVersion: null,
          releaseUrl: null,
          packageLabel: process.platform === 'win32' ? '.exe' : process.platform === 'linux' ? '.deb' : 'release asset',
          reason: 'Update checks are disabled in development builds.',
        } satisfies ManualUpdateRequirement
      }

      if (isPrivateTestBuild()) {
        return {
          required: false,
          currentVersion: app.getVersion(),
          latestVersion: null,
          releaseUrl: null,
          packageLabel: process.platform === 'win32' ? '.exe' : process.platform === 'linux' ? '.deb' : 'release asset',
          reason: 'Private test build: public release gating is disabled.',
        } satisfies ManualUpdateRequirement
      }

      if (!shouldUseManualUpdateGate()) {
        return {
          required: false,
          currentVersion: app.getVersion(),
          latestVersion: null,
          releaseUrl: null,
          packageLabel: 'release asset',
        } satisfies ManualUpdateRequirement
      }

      return getManualUpdateRequirement()
    })

    ipcMain.removeHandler('updates:open-release-url')
    ipcMain.handle('updates:open-release-url', async (_event, rawInput: unknown) => {
      const { url } = toOpenReleaseInput(rawInput)
      const safeUrl = normalizeReleaseUrl(url)

      await shell.openExternal(safeUrl)
      return { ok: true }
    })
  }
}

export function updateIpcModule() {
  return new UpdateIpcModule()
}
