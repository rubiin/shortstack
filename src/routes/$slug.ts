import { createFileRoute } from '@tanstack/react-router'

import { redirectResponse, resolveRedirect, unavailableResponse } from '~/server/redirects'

export const Route = createFileRoute('/$slug')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url)
        const host = request.headers.get('host') ?? url.host
        const resolution = resolveRedirect({
          host,
          slug: params.slug,
          referrer: request.headers.get('referer'),
          userAgent: request.headers.get('user-agent'),
          countryHeader:
            request.headers.get('cf-ipcountry') ??
            request.headers.get('x-vercel-ip-country') ??
            null,
        })

        if (resolution.kind === 'redirect') {
          return redirectResponse(resolution.destination)
        }
        if (resolution.kind === 'unavailable') {
          return unavailableResponse(resolution.reason)
        }
        return unavailableResponse('not_found')
      },
    },
  },
})
