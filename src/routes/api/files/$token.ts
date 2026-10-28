import { createFileRoute } from '@tanstack/react-router'

import { getStorage, StorageError } from '~/server/adapters/storage'

export const Route = createFileRoute('/api/files/$token')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const storage = getStorage()
        const verified = storage.verifySignedUrl(params.token)
        if (!verified) {
          return new Response('This download link is invalid or has expired.', {
            status: 410,
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
          })
        }

        try {
          const contentType = verified.key.endsWith('.csv')
            ? 'text/csv; charset=utf-8'
            : 'application/octet-stream'
          const file = await storage.get(verified.key, contentType)
          const filename = verified.key.split('/').pop() ?? 'shortstack-export'
          return new Response(new Uint8Array(file.bytes), {
            headers: {
              'Content-Type': contentType,
              'Content-Disposition': `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '-')}"`,
              'Cache-Control': 'private, max-age=60, no-transform',
              'X-Content-Type-Options': 'nosniff',
              'X-Robots-Tag': 'noindex, nofollow',
            },
          })
        } catch (error) {
          const status = error instanceof StorageError && error.code === 'not_found' ? 404 : 500
          return new Response(
            status === 404 ? 'That file is no longer available.' : 'The file could not be read.',
            {
              status,
              headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
            },
          )
        }
      },
    },
  },
})
