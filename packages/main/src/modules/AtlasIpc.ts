import {ipcMain} from 'electron';
import type {AppModule} from '../AppModule.js';
import {atlasService} from '../atlas/AtlasService.js';

type RawAtlasSearchInput = {
  query?: unknown;
  offset?: unknown;
  type?: unknown;
};

type RawAtlasAlbumInput = {
  albumId?: unknown;
};

type RawAtlasStreamInput = {
  trackId?: unknown;
};

function toSearchInput(rawInput: unknown) {
  const input = (rawInput ?? {}) as RawAtlasSearchInput;

  return {
    query: typeof input.query === 'string' ? input.query : '',
    offset: typeof input.offset === 'number' && Number.isFinite(input.offset) ? input.offset : undefined,
    type: typeof input.type === 'string' ? input.type : undefined,
  };
}

function toAlbumInput(rawInput: unknown) {
  const input = (rawInput ?? {}) as RawAtlasAlbumInput;

  return {
    albumId: typeof input.albumId === 'string' ? input.albumId : '',
  };
}

function toStreamInput(rawInput: unknown) {
  const input = (rawInput ?? {}) as RawAtlasStreamInput;

  return {
    trackId: typeof input.trackId === 'string' ? input.trackId : '',
  };
}

class AtlasIpcModule implements AppModule {
  enable(): void {
    ipcMain.removeHandler('atlas-main:search-tracks');
    ipcMain.handle('atlas-main:search-tracks', async (_event, rawInput: unknown) => {
      return atlasService.searchTracks(toSearchInput(rawInput));
    });

    ipcMain.removeHandler('atlas-main:get-album');
    ipcMain.handle('atlas-main:get-album', async (_event, rawInput: unknown) => {
      return atlasService.getAlbum(toAlbumInput(rawInput));
    });

    ipcMain.removeHandler('atlas-main:get-stream');
    ipcMain.handle('atlas-main:get-stream', async (_event, rawInput: unknown) => {
      return atlasService.getStream(toStreamInput(rawInput));
    });

    ipcMain.removeHandler('atlas-main:health');
    ipcMain.handle('atlas-main:health', async () => {
      return atlasService.healthCheck();
    });
  }
}

export function atlasIpcModule() {
  return new AtlasIpcModule();
}
