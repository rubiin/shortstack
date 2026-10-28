import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '~/server/db'
import { getSessionUser } from '~/server/auth'
import { normalizeSlug } from '~/domain/slug'
import { qrSvg } from '~/server/adapters/qr'

export const Route = createFileRoute('/api/qr/preview')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = getSessionUser()
        if (!user) {
          return Response.json({ ok: false, message: 'Sign in required.' }, { status: 401 })
        }
        const url = new URL(request.url)
        const domainId = url.searchParams.get('domainId') ?? ''
        const slug = normalizeSlug(url.searchParams.get('slug') ?? '')
        if (!slug.ok) {
          return new Response('A valid slug is required.', { status: 400 })
        }
        const domain = getDb()
          .prepare("SELECT origin FROM domains WHERE id = ? AND workspace_id = ? AND status = 'active'")
          .get(domainId, user.workspaceId) as { origin: string } | undefined
        if (!domain) {
          return new Response('Domain not found.', { status: 404 })
        }
        const shortUrl = `${domain.origin.replace(/\/$/, '')}/${slug.slug}`
        const svg = await qrSvg(shortUrl)
        return new Response(svg, {
          headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
            'X-Robots-Tag': 'noindex',
          },
        })
      },
    },
  },
})
