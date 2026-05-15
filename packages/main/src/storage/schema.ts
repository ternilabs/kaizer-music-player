import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const tracksTable = sqliteTable('tracks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  album: text('album').notNull(),
  albumId: text('album_id'),
  sourceServerId: text('source_server_id'),
  isHiRes: integer('is_hi_res', { mode: 'boolean' }).notNull().default(false),
  duration: text('duration').notNull(),
  sizeMb: integer('size_mb').notNull(),
  coverTone: text('cover_tone').notNull(),
  coverUrl: text('cover_url'),
  updatedAt: integer('updated_at').notNull(),
})

export const playlistsTable = sqliteTable('playlists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  imageUrl: text('image_url'),
  updatedAt: integer('updated_at').notNull(),
})

export const playlistTracksTable = sqliteTable(
  'playlist_tracks',
  {
    playlistId: text('playlist_id').notNull(),
    trackId: text('track_id').notNull(),
    position: integer('position').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.playlistId, table.trackId] }),
  }),
)

export const recentPlaylistsTable = sqliteTable('recent_playlists', {
  playlistId: text('playlist_id').primaryKey(),
  position: integer('position').notNull(),
})

export const downloadsTable = sqliteTable('downloads', {
  trackId: text('track_id').primaryKey(),
  downloadedAt: integer('downloaded_at').notNull(),
})

export const settingsTable = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const logsTable = sqliteTable('logs', {
  id: text('id').primaryKey(),
  message: text('message').notNull(),
  timestamp: text('timestamp').notNull(),
  createdAt: integer('created_at').notNull(),
})
