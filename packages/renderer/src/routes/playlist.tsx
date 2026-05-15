import { useState } from 'react'
import { Link, Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { LayoutGrid, List } from 'lucide-react'
import { formatPlaylistCreatedAt } from '@/app/playlistCreatedAt'
import { useAppState } from '@/app/appStateContext'
import { PlaylistArtwork } from '@/components/ui/PlaylistArtwork'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { TopSearchBar } from '@/components/ui/TopSearchBar'
import { normalizeFilterTextInput } from '@/lib/inputValidation'
import { cn } from '@/lib/cn'

type PlaylistViewMode = 'boxes' | 'rows'

function PlaylistListRouteComponent() {
  const { playlists } = useAppState()
  const location = useLocation()
  const [query, setQuery] = useState('')
  const [playlistViewMode, setPlaylistViewMode] = useState<PlaylistViewMode>('boxes')
  const isPlaylistListRoute = location.pathname === '/playlist'

  const normalizedQuery = query.trim().toLowerCase()
  const filteredPlaylists = normalizedQuery
    ? playlists.filter((playlist) => {
        const searchable = `${playlist.name} ${formatPlaylistCreatedAt(playlist.createdAt)}`.toLowerCase()
        return searchable.includes(normalizedQuery)
      })
    : playlists

  if (!isPlaylistListRoute) {
    return <Outlet />
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <SectionHeader
        subtitle={`Showing ${filteredPlaylists.length} of ${playlists.length} playlists`}
        subtitleClassName="mt-2.5"
        title="All playlists"
      />
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0 flex-1">
          <TopSearchBar className="!mt-0" onChange={(value) => setQuery(normalizeFilterTextInput(value))} placeholder="Search playlist" value={query} />
        </div>

        <div className="flex h-11 shrink-0 items-center gap-2 rounded-md border border-zinc-700/80 bg-zinc-900/80 p-1">
          <button
            aria-label="View playlists as boxes"
            className={cn(
              'flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
              playlistViewMode === 'boxes'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100',
            )}
            onClick={() => setPlaylistViewMode('boxes')}
            type="button"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Boxes
          </button>

          <button
            aria-label="View playlists as rows"
            className={cn(
              'flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
              playlistViewMode === 'rows'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100',
            )}
            onClick={() => setPlaylistViewMode('rows')}
            type="button"
          >
            <List className="h-3.5 w-3.5" />
            Rows
          </button>
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {filteredPlaylists.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-8 text-center text-sm text-zinc-500">
            No playlist matches this query.
          </div>
        ) : playlistViewMode === 'boxes' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] justify-items-center gap-2.5">
            {filteredPlaylists.map((playlist) => (
              <article className="w-full max-w-[190px]" key={playlist.id}>
                <Link
                  activeProps={{ className: 'border-zinc-500/80 bg-zinc-800/90' }}
                  className="relative block aspect-square w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/75 transition hover:border-zinc-600 hover:bg-zinc-800/75"
                  params={{ playlistId: playlist.id }}
                  preload="intent"
                  to="/playlist/$playlistId"
                >
                  <PlaylistArtwork
                    className="h-full w-full rounded-none border-none"
                    iconClassName="h-10 w-10"
                    imageUrl={playlist.imageUrl}
                    name={playlist.name}
                  />

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/95 via-black/70 to-transparent" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5">
                    <p className="truncate text-base font-semibold text-zinc-100 [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]">
                      {playlist.name}
                    </p>
                    <p className="mt-1 text-xs text-zinc-300 [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]">
                      {playlist.trackIds.length} {playlist.trackIds.length === 1 ? 'track' : 'tracks'}
                    </p>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredPlaylists.map((playlist) => (
              <article className="relative" key={playlist.id}>
                <Link
                  activeProps={{ className: 'border-zinc-500/80 bg-zinc-800/90' }}
                  className="flex min-h-12 items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/75 px-3 py-2 pr-20 transition hover:border-zinc-600 hover:bg-zinc-800/75"
                  params={{ playlistId: playlist.id }}
                  preload="intent"
                  to="/playlist/$playlistId"
                >
                  <PlaylistArtwork imageUrl={playlist.imageUrl} name={playlist.name} />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium leading-tight text-zinc-100">
                      {playlist.name}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">{formatPlaylistCreatedAt(playlist.createdAt)}</span>
                  </span>
                </Link>

                <div className="pointer-events-none absolute inset-y-0 right-2 z-30 flex items-center gap-1">
                  <span className="shrink-0 text-xs text-zinc-400">
                    {playlist.trackIds.length} {playlist.trackIds.length === 1 ? 'track' : 'tracks'}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export const Route = createFileRoute('/playlist')({
  component: PlaylistListRouteComponent,
})
