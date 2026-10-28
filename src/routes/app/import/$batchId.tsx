import { Link, createFileRoute } from '@tanstack/react-router'

import { ImportBatchWork } from '~/components/import-workflow'
import { formatUtc } from '~/domain/time'
import { getImportFn } from '~/server/functions/imports'

export const Route = createFileRoute('/app/import/$batchId')({
  loader: ({ params }) => getImportFn({ data: { batchId: params.batchId } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `Import ${loaderData?.filename ?? 'batch'} · Shortstack` }],
  }),
  component: ImportBatchPage,
})

function ImportBatchPage() {
  const batch = Route.useLoaderData()

  return (
    <>
      <div className="between" style={{ marginBottom: 18 }}>
        <Link className="btn btn--ghost btn--small" to="/app/import">
          ← New import
        </Link>
        <span className="small faint">Started {formatUtc(batch.createdAt)}</span>
      </div>
      <div style={{ marginBottom: 24 }}>
        <p className="eyebrow">Import review</p>
        <h1 className="display display--wide">Check before you create.</h1>
        <p className="lede">
          {batch.filename ?? 'Pasted CSV'} · {batch.domainHostname}. Fix or skip rows below; only
          valid rows become links.
        </p>
      </div>

      <ImportBatchWork initial={batch} />
    </>
  )
}
