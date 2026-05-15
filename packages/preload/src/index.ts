import {sha256sum} from './nodeCrypto.js';
import {versions} from './versions.js';
import {ipcRenderer} from 'electron';

function send(channel: string, payload?: unknown) {
  return ipcRenderer.invoke(channel, payload);
}

export {sha256sum, versions, send};
