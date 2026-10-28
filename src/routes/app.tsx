import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionFn } from '~/server/functions/auth'
import { AppShell } from '~/components/app-shell'

export const Route = createFileRoute('/app')({
  beforeLoad: async ({ location }) => {
    const { user } = await getSessionFn()
    if (!user) {
      throw redirect({
        to: '/login',
        search: { next: location.href.startsWith('/app') ? location.href : '/app/links' },
      })
    }
    return { user }
  },
  component: AppLayout,
})

function AppLayout() {
  const { user } = Route.useRouteContext()
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  )
}
