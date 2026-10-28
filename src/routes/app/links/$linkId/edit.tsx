import { Link, createFileRoute, notFound } from '@tanstack/react-router'

import { LinkEditor } from '~/components/link-editor'
import { CopyButton } from '~/components/ui'
import { formatUtc } from '~/domain/time'
import { getEditorDataFn } from '~/server/functions/links'

export const Route = createFileRoute('/app/links/$linkId/edit')({
  loader: async ({ params }) => {
    const data = await getEditorDataFn({ data: { linkId: params.linkId } })
    if (!data.link) throw notFound()
    return { ...data, link: data.link }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `Edit /${loaderData?.link.slug ?? 'link'} · Shortstack` }],
  }),
  component: EditLinkPage,
})

function EditLinkPage() {
  const data = Route.useLoaderData()
  const link = data.link

  return (
    <>
      <div className="between" style={{ marginBottom: 18 }}>
        <Link
          className="btn btn--ghost btn--small"
          to="/app/links/$linkId"
          params={{ linkId: link.id }}
        >
          ← Back to /{link.slug}
        </Link>
        <CopyButton text={link.shortUrl} label="Copy short link" compact />
      </div>
      <div style={{ marginBottom: 24 }}>
        <p className="eyebrow">Edit link</p>
        <h1 className="display">Adjust the redirect.</h1>
        <p className="lede">
          Last updated {formatUtc(link.updatedAt)}. Saving invalidates the redirect cache
          immediately; analytics are preserved even if you change the slug.
        </p>
      </div>

      <div className="split">
        <LinkEditor mode="edit" domains={data.domains} campaigns={data.campaigns} link={link} />
        <aside className="stack">
          <div className="card card-pad stack-sm">
            <h2 className="section-title" style={{ fontSize: 21 }}>
              This link so far
            </h2>
            <div className="clicks-row">
              <div className="clicks-cell">
                <strong>{link.clicks7d.toLocaleString('en-US')}</strong>
                <span>7 days</span>
              </div>
              <div className="clicks-cell">
                <strong>{link.clicks30d.toLocaleString('en-US')}</strong>
                <span>30 days</span>
              </div>
              <div className="clicks-cell">
                <strong>{link.clicksTotal.toLocaleString('en-US')}</strong>
                <span>Total</span>
              </div>
            </div>
            <p className="small muted">
              Changing the slug does not reset analytics: clicks stay attached to this link record.
            </p>
          </div>
          <div className="card card-pad">
            <h2 className="section-title" style={{ fontSize: 21, marginBottom: 8 }}>
              QR code
            </h2>
            <div className="qr-frame">
              <img
                src={`/api/links/${link.id}/qr?format=svg`}
                alt={`QR code for ${link.shortUrl}`}
                width={180}
                height={180}
              />
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>
              Regenerated automatically from the short URL. Download it from the detail page.
            </p>
          </div>
        </aside>
      </div>
    </>
  )
}
