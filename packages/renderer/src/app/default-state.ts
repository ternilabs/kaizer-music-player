import type { PreferredServerId, ServerStatus } from './types'

export const DEFAULT_STORAGE_CAPACITY_MB = 30000
export const DEFAULT_PREFERRED_SERVER_ID: PreferredServerId = 'helios-main'

export const initialServers: ServerStatus[] = [
  { id: 'atlas-main', name: 'atlas-main', status: 'down' },
  { id: 'atlas-alt', name: 'atlas-alt', status: 'down' },
  { id: 'orion-main', name: 'orion-main', status: 'down' },
  { id: 'helios-main', name: 'helios-main', status: 'down' },
  { id: 'helios-alt-01', name: 'helios-alt-01', status: 'down' },
  { id: 'helios-alt-02', name: 'helios-alt-02', status: 'down' },
  { id: 'helios-alt-03', name: 'helios-alt-03', status: 'down' },
  { id: 'helios-alt-04', name: 'helios-alt-04', status: 'down' },
  { id: 'helios-alt-05', name: 'helios-alt-05', status: 'down' },
  { id: 'helios-alt-06', name: 'helios-alt-06', status: 'down' },
  { id: 'nyx-main', name: 'nyx-main', status: 'down' },
  { id: 'kaizer-main', name: 'kaizer-main', status: 'down' },
]
