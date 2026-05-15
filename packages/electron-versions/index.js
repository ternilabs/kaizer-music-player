import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const electronCliPath = require.resolve('electron/cli.js');

function getElectronEnv() {
  return JSON.parse(execFileSync(
    process.execPath,
    [electronCliPath, '-p', 'JSON.stringify(process.versions)'],
    {
      encoding: 'utf-8',
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: 1,
      }
    }
  ));
}

function createElectronEnvLoader() {
  let inMemoryCache = null;

  return () => {
    if (inMemoryCache) {
      return inMemoryCache;
    }

    return inMemoryCache = getElectronEnv();
  }
}

const envLoader = createElectronEnvLoader();


export function getElectronVersions() {
  return envLoader();
}

export function getChromeVersion() {
  return getElectronVersions().chrome;
}

export function getChromeMajorVersion() {
  return getMajorVersion(getChromeVersion());
}

export function getNodeVersion() {
  return getElectronVersions().node;
}

export function getNodeMajorVersion() {
  return getMajorVersion(getNodeVersion());
}

function getMajorVersion(version) {
  return parseInt(version.split('.')[0]);
}
