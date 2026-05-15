import { Bookmark, HardDrive, List, ListPlus, Search, Settings } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import brandImage from '@/assets/brand.png'
import { useAppState } from '@/app/appStateContext'
import type { Playlist } from '@/app/types'
import { PlaylistArtwork } from '@/components/ui/PlaylistArtwork'
import { CreatePlaylistDialog } from '@/components/ui/CreatePlaylistDialog'

const primaryNavItems = [
  { id: 'search', label: 'Search', icon: Search, to: '/search' as const },
  { id: 'downloads', label: 'Downloads', icon: HardDrive, to: '/downloads' as const },
  { id: 'settings', label: 'Settings', icon: Settings, to: '/settings' as const },
]

export function Sidebar() {
  const { playlists, bookmarkedPlaylistIds, createPlaylist, lastSearchQuery, lastSubmittedSearchQuery } = useAppState()
  const location = useLocation()
  const [isCreatePlaylistDialogOpen, setIsCreatePlaylistDialogOpen] = useState(false)

  const playlistMap = useMemo(() => new Map(playlists.map((playlist) => [playlist.id, playlist])), [playlists])
  const bookmarkedIdSet = useMemo(() => new Set(bookmarkedPlaylistIds), [bookmarkedPlaylistIds])
  const orderedPlaylists = useMemo(() => {
    const bookmarkedPlaylists = bookmarkedPlaylistIds
      .map((playlistId) => playlistMap.get(playlistId))
      .filter((playlist): playlist is Playlist => Boolean(playlist))
    const unbookmarkedPlaylists = playlists.filter((playlist) => !bookmarkedIdSet.has(playlist.id))

    return [...bookmarkedPlaylists, ...unbookmarkedPlaylists]
  }, [bookmarkedIdSet, bookmarkedPlaylistIds, playlistMap, playlists])

  const visiblePlaylists = orderedPlaylists.slice(0, 10)
  const hasHiddenPlaylists = orderedPlaylists.length > visiblePlaylists.length
  const playlistBackTarget = location.pathname.startsWith('/playlist/') ? '/playlist' : location.pathname

  return (
    <aside className="app-sidebar app-sidebar-width flex h-full min-h-0 flex-col rounded-xl bg-zinc-900/80 p-3 backdrop-blur">
      <img alt="Kaizer brand" className="app-sidebar__brand mx-auto h-auto w-[190px] xl:w-[208px] 2xl:w-[232px]" src={brandImage} />

      <nav aria-label="Primary navigation" className="mt-3 space-y-1">
        {primaryNavItems.map((item) => {
          const Icon = item.icon

          return (
            <Link
              activeOptions={{ exact: true }}
              activeProps={{
                className: 'bg-zinc-950/95 text-zinc-100',
              }}
              className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              inactiveProps={{
                className: 'text-zinc-300 hover:bg-zinc-800/75 hover:text-zinc-100',
              }}
              key={item.id}
              preload="intent"
              search={item.id === 'search'
                ? {
                  q: lastSearchQuery,
                  submitted: lastSubmittedSearchQuery,
                }
                : undefined}
              to={item.to}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-3 border-t border-zinc-700/70 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-zinc-700/80 px-3 text-center text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            onClick={() => setIsCreatePlaylistDialogOpen(true)}
            type="button"
          >
            <ListPlus className="h-4 w-4" />
            Create
          </button>

          <Link
            activeOptions={{ exact: true }}
            activeProps={{
              className: 'border-zinc-600 bg-zinc-950/95 text-zinc-100',
            }}
            className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-zinc-700/80 px-3 text-center text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            inactiveProps={{
              className: 'text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/75 hover:text-zinc-100',
            }}
            preload="intent"
            to="/playlist"
          >
            <List className="h-4 w-4" />
            View all
          </Link>
        </div>
      </div>

      <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {visiblePlaylists.map((playlist) => (
          <Link
            className="flex min-h-12 items-center gap-2.5 rounded-md px-2 py-1.5 text-zinc-100 transition hover:bg-zinc-800/75"
            key={playlist.id}
            params={{ playlistId: playlist.id }}
            preload="intent"
            search={{ from: playlistBackTarget }}
            to="/playlist/$playlistId"
          >
            <PlaylistArtwork imageUrl={playlist.imageUrl} name={playlist.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-medium leading-tight text-zinc-200">
                {playlist.name}
              </span>
              <span className="block truncate text-xs text-zinc-500">
                {playlist.trackIds.length} {playlist.trackIds.length === 1 ? 'track' : 'tracks'}
              </span>
            </span>
            <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center">
              {bookmarkedIdSet.has(playlist.id) ? <Bookmark className="h-3.5 w-3.5 text-emerald-300" fill="currentColor" /> : null}
            </span>
          </Link>
        ))}

        {hasHiddenPlaylists ? (
          <p className="px-2 pt-1 text-xs text-zinc-500">
            Showing {visiblePlaylists.length} of {orderedPlaylists.length} playlists.
          </p>
        ) : null}
      </div>

      <CreatePlaylistDialog
        isOpen={isCreatePlaylistDialogOpen}
        onCancel={() => setIsCreatePlaylistDialogOpen(false)}
        onCreate={(input) => {
          createPlaylist(input)
          setIsCreatePlaylistDialogOpen(false)
        }}
      />
    </aside>
  )
}
