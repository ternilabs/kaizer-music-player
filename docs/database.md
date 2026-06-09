# Database

## Stack

- Drizzle ORM + better-sqlite3
- SQLite database stored at `{userData}/kaizer.db`

## Schema

Location: `packages/main/src/storage/schema.ts`

### Tables

| Table | Purpose |
|-------|---------|
| `tracks` | Cached track metadata |
| `playlists` | User playlists |
| `playlist_tracks` | Playlist-track relationships (composite PK) |
| `recent_playlists` | Recently used playlists |
| `downloads` | Downloaded track index |
| `settings` | Key-value settings |
| `logs` | App event logs |

## Migrations

After editing schema:

```bash
npm run db:generate --workspace @app/main   # generate migration SQL
npm run db:migrate --workspace @app/main    # apply migrations
```

Migration files land in `packages/main/drizzle/`.

## Important

- The `downloads` table only tracks the index — actual files are in `{userData}/downloads/`
- Settings are stored as key-value pairs in the `settings` table
- Logs are capped (trimmed on snapshot save)
