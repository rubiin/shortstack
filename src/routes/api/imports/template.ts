import { createFileRoute } from '@tanstack/react-router'
import { importTemplate } from '~/domain/import'

export const Route = createFileRoute('/api/imports/template')({
  server: {
    handlers: {
      GET: async () => {
        return new Response(importTemplate(), {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="shortstack-import-template.csv"',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      },
    },
  },
})
