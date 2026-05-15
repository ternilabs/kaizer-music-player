import { Outlet, createRootRoute } from '@tanstack/react-router'
import { AppStateProvider } from '@/app/appStateContext'
import { AppShell } from '@/components/layout/AppShell'
import { AppToastBridge } from '@/components/layout/AppToastBridge'
import { ToastProvider } from '@/components/ui/toastContext'

function RootRouteComponent() {
  return (
    <AppStateProvider>
      <ToastProvider>
        <AppToastBridge />
        <AppShell>
          <Outlet />
        </AppShell>
      </ToastProvider>
    </AppStateProvider>
  )
}

export const Route = createRootRoute({
  component: RootRouteComponent,
})
