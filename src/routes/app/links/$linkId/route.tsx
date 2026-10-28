import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/links/$linkId')({
  component: LinkLayout,
})

function LinkLayout() {
  return <Outlet />
}
