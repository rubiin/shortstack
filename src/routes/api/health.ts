import { createFileRoute } from '@tanstack/react-router'
import { assertSchemaHealthy } from '~/server/db'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const healthy = assertSchemaHealthy()
          return Response.json(
            {
              ok: healthy,
              service: 'shortstack',
              time: new Date().toISOString(),
            },
            { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
          )
        } catch {
          return Response.json(
            { ok: false, service: 'shortstack', time: new Date().toISOString() },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
          )
        }
      },
    },
  },
})
