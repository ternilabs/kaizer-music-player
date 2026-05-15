import {ipcMain} from 'electron';
import type {AppModule} from '../AppModule.js';
import {orionService} from '../orion/OrionService.js';

type RawOrionSearchInput = {
  query?: unknown;
  offset?: unknown;
  type?: unknown;
};

type RawOrionAlbumInput = {
  albumId?: unknown;
};

type RawOrionStreamInput = {
  trackId?: unknown;
};

function toSearchInput(rawInput: unknown) {
  const input = (rawInput ?? {}) as RawOrionSearchInput;

  return {
    query: typeof input.query === 'string' ? input.query : '',
    offset: typeof input.offset === 'number' && Number.isFinite(input.offset) ? input.offset : undefined,
    type: typeof input.type === 'string' ? input.type : undefined,
  };
}

function toAlbumInput(rawInput: unknown) {
  const input = (rawInput ?? {}) as RawOrionAlbumInput;

  return {
    albumId: typeof input.albumId === 'string' ? input.albumId : '',
  };
}

function toStreamInput(rawInput: unknown) {
  const input = (rawInput ?? {}) as RawOrionStreamInput;

  return {
    trackId: typeof input.trackId === 'string' ? input.trackId : '',
  };
}

class OrionIpcModule implements AppModule {
  enable(): void {
    ipcMain.removeHandler('orion-main:search-tracks');
    ipcMain.handle('orion-main:search-tracks', async (_event, rawInput: unknown) => {
      return orionService.searchTracks(toSearchInput(rawInput));
    });

    ipcMain.removeHandler('orion-main:get-album');
    ipcMain.handle('orion-main:get-album', async (_event, rawInput: unknown) => {
      return orionService.getAlbum(toAlbumInput(rawInput));
    });

    ipcMain.removeHandler('orion-main:get-stream');
    ipcMain.handle('orion-main:get-stream', async (_event, rawInput: unknown) => {
      return orionService.getStream(toStreamInput(rawInput));
    });

    ipcMain.removeHandler('orion-main:health');
    ipcMain.handle('orion-main:health', async () => {
      return orionService.healthCheck();
    });
  }
}

export function orionIpcModule() {
  return new OrionIpcModule();
}
