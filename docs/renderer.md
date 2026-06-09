# Renderer Conventions

## Framework Stack

- React 19 + Vite 7
- TanStack Router (file-based routes)
- TanStack Query v5 (server state)
- Tailwind CSS v4

## Routing

- File-based routes in `packages/renderer/src/src/routes/`
- Route tree is auto-generated to `routeTree.gen.ts` — do not edit manually
- To add a route, create a file in `src/routes/` using `createFileRoute()`

## State Management

- `AppStateContext` provides app-wide state (in `src/app/appStateContext.tsx`)
- Server state via TanStack Query
- Avoid prop drilling — use context or query hooks

## Styling

- Tailwind CSS v4 + `tailwind-merge` + `clsx`
- Use `cn()` from `@/lib/cn` for conditional classes
- Example: `cn('base-class', condition && 'conditional-class')`

## Path Alias

- `@/` maps to `packages/renderer/src/`
- Use `@/components/...`, `@/lib/...`, `@/app/...` in imports

## React Compiler

- Babel plugin is enabled in vite config
- Write standard React — compiler auto-memoizes
- No need for manual `useMemo`/`useCallback`

## Environment Variables

- Only `VITE_*` prefixed variables are exposed to renderer code
- Defined in `.env`, `.env.local`, `.env.[mode]`, `.env.[mode].local`
