import { createFileRoute } from '@tanstack/react-router'
import { zipSync } from 'fflate'
import { getDb } from '~/server/db'
import { getSessionUser } from '~/server/auth'
import { qrPng } from '~/server/adapters/qr'

export const Route = createFileRoute('/api/imports/$batchId/qr.zip')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const user = getSessionUser()
        if (!user) {
          return Response.json({ ok: false, message: 'Sign in required.' }, { status: 401 })
        }
        const db = getDb()
        const batch = db
          .prepare(
            'SELECT id, filename, status FROM import_batches WHERE id = ? AND workspace_id = ?',
          )
          .get(params.batchId, user.workspaceId) as
          | { id: string; filename: string | null; status: string }
          | undefined
        if (!batch) {
          return Response.json({ ok: false, message: 'Import not found.' }, { status: 404 })
        }
        const rows = db
          .prepare(
            `SELECT r.slug, d.origin
             FROM import_rows r
             JOIN import_batches b ON b.id = r.batch_id
             JOIN domains d ON d.id = b.domain_id
             WHERE r.batch_id = ? AND r.workspace_id = ? AND r.created_link_id IS NOT NULL
             ORDER BY r.row_number`,
          )
          .all(params.batchId, user.workspaceId) as Array<{ slug: string; origin: string }>
        if (rows.length === 0) {
          return Response.json(
            { ok: false, message: 'Create this import before downloading its QR codes.' },
            { status: 409 },
          )
        }

        const files: Record<string, Uint8Array> = {}
        for (const row of rows) {
          const shortUrl = `${row.origin.replace(/\/$/, '')}/${row.slug}`
          files[`${row.slug}.png`] = await qrPng(shortUrl)
        }
        const zip = zipSync(files, { level: 6 })
        const name = (batch.filename ?? 'shortstack-import')
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9._-]/g, '-')
        return new Response(zip, {
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${name || 'shortstack-import'}-qr-codes.zip"`,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
            'X-Robots-Tag': 'noindex',
          },
        })
      },
    },
  },
})
