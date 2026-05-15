import { createHashHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:'

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
  history: isFileProtocol ? createHashHistory() : undefined,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
