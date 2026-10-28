import { createFileRoute } from '@tanstack/react-router'

import { qrPng, qrSvg } from '~/server/adapters/qr'
import { getSessionUser } from '~/server/auth'
import { getDb } from '~/server/db'

export const Route = createFileRoute('/api/links/$linkId/qr')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = getSessionUser()
        if (!user) {
          return Response.json({ ok: false, message: 'Sign in required.' }, { status: 401 })
        }
        const row = getDb()
          .prepare(
            `SELECT l.slug, d.origin
             FROM short_links l JOIN domains d ON d.id = l.domain_id
             WHERE l.id = ? AND l.workspace_id = ?`,
          )
          .get(params.linkId, user.workspaceId) as { slug: string; origin: string } | undefined
        if (!row) {
          return Response.json({ ok: false, message: 'Link not found.' }, { status: 404 })
        }

        const url = new URL(request.url)
        const format = url.searchParams.get('format') === 'png' ? 'png' : 'svg'
        const download = url.searchParams.get('download') === '1'
        const shortUrl = `${row.origin.replace(/\/$/, '')}/${row.slug}`
        const filename = `${row.slug}.${format}`
        const disposition = `${download ? 'attachment' : 'inline'}; filename="${filename}"`

        if (format === 'png') {
          const png = await qrPng(shortUrl)
          return new Response(new Uint8Array(png), {
            headers: {
              'Content-Type': 'image/png',
              'Content-Disposition': disposition,
              'Cache-Control': 'private, no-store',
              'X-Content-Type-Options': 'nosniff',
              'X-Robots-Tag': 'noindex',
            },
          })
        }

        const svg = await qrSvg(shortUrl)
        return new Response(svg, {
          headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Content-Disposition': disposition,
            'Cache-Control': 'private, no-store',
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
            'X-Content-Type-Options': 'nosniff',
            'X-Robots-Tag': 'noindex',
          },
        })
      },
    },
  },
})
