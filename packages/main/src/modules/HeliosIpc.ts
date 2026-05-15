import {ipcMain} from 'electron';
import type {AppModule} from '../AppModule.js';
import {heliosService} from '../helios/HeliosService.js';

type RawHeliosSearchInput = {
  query?: unknown;
  offset?: unknown;
  type?: unknown;
};

type RawHeliosAlbumInput = {
  albumId?: unknown;
};

type RawHeliosStreamInput = {
  trackId?: unknown;
  quality?: unknown;
};

function toSearchInput(rawInput: unknown) {
  const input = (rawInput ?? {}) as RawHeliosSearchInput;

  return {
    query: typeof input.query === 'string' ? input.query : '',
    offset: typeof input.offset === 'number' && Number.isFinite(input.offset) ? input.offset : undefined,
    type: typeof input.type === 'string' ? input.type : undefined,
  };
}

function toAlbumInput(rawInput: unknown) {
  const input = (rawInput ?? {}) as RawHeliosAlbumInput;

  return {
    albumId: typeof input.albumId === 'string' ? input.albumId : '',
  };
}

function toStreamInput(rawInput: unknown) {
  const input = (rawInput ?? {}) as RawHeliosStreamInput;

  return {
    trackId: typeof input.trackId === 'string' ? input.trackId : '',
    quality: typeof input.quality === 'string' ? input.quality : undefined,
  };
}

class HeliosIpcModule implements AppModule {
  enable(): void {
    ipcMain.removeHandler('helios-main:search-tracks');
    ipcMain.handle('helios-main:search-tracks', async (_event, rawInput: unknown) => {
      return heliosService.searchTracks(toSearchInput(rawInput));
    });

    ipcMain.removeHandler('helios-main:get-album');
    ipcMain.handle('helios-main:get-album', async (_event, rawInput: unknown) => {
      return heliosService.getAlbum(toAlbumInput(rawInput));
    });

    ipcMain.removeHandler('helios-main:get-stream');
    ipcMain.handle('helios-main:get-stream', async (_event, rawInput: unknown) => {
      return heliosService.getStream(toStreamInput(rawInput));
    });

    ipcMain.removeHandler('helios-main:health');
    ipcMain.handle('helios-main:health', async () => {
      return heliosService.healthCheck();
    });
  }
}

export function heliosIpcModule() {
  return new HeliosIpcModule();
}
