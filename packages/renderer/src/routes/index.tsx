import { Navigate, createFileRoute } from '@tanstack/react-router'

function IndexRouteComponent() {
  return <Navigate search={{ q: '', submitted: '' }} to="/search" />
}

export const Route = createFileRoute('/')({
  component: IndexRouteComponent,
})
