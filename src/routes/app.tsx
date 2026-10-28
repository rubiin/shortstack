import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

import { AppShell } from '~/components/app-shell'
import { getSessionFn } from '~/server/functions/auth'

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
