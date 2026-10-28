import { useRef, useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { getLinkFn, setArchivedFn } from '~/server/functions/links'
import type { LinkDetail } from '~/domain/types'
import { formatUtc } from '~/domain/time'
import { CopyButton, Field, InlineAlert, StatePill, Toast } from '~/components/ui'

type DetailSearch = { saved?: number; archived?: string }

export const Route = createFileRoute('/app/links/$linkId/')({
  validateSearch: (input: Record<string, unknown>): DetailSearch => ({
    saved: input.saved === 1 || input.saved === '1' ? 1 : undefined,
    archived: typeof input.archived === 'string' ? input.archived : undefined,
  }),
  loader: ({ params }) => getLinkFn({ data: { linkId: params.linkId } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.slug ? `/${loaderData.slug}` : 'Link'} · Shortstack` }],
  }),
  component: LinkDetailPage,
})

function auditLabel(action: string): string {
  switch (action) {
    case 'link.created':
      return 'Link created'
    case 'link.updated':
      return 'Link updated'
    case 'link.archived':
      return 'Link archived'
    case 'link.restored':
      return 'Link restored'
    default:
      return action.replace('.', ' ')
  }
}

function LinkDetailPage() {
  const link = Route.useLoaderData()
  const search = Route.useSearch()
  const router = useRouter()
  const [toast, setToast] = useState<string | null>(null)
  const maxClicks = Math.max(1, ...link.lastDays.map((day) => day.clicks))

  return (
    <>
      <div className="between" style={{ marginBottom: 18 }}>
        <Link className="btn btn--ghost btn--small" to="/app/links">
          ← All links
        </Link>
        <div className="inline">
          {link.state !== 'archived' ? (
            <Link className="btn" to="/app/links/$linkId/edit" params={{ linkId: link.id }}>
              Edit link
            </Link>
          ) : null}
          {link.canArchive ? (
            <ArchiveControl link={link} onDone={(archived) => {
              setToast(archived ? 'Link archived. It no longer redirects.' : 'Link restored.')
              void router.invalidate()
            }} />
          ) : null}
        </div>
      </div>

      {search.saved === 1 ? (
        <div className="banner" role="status">
          <span>Link saved. The redirect is live with the new settings.</span>
          <Link
            className="btn btn--small"
            to="/app/links/$linkId"
            params={{ linkId: link.id }}
            search={{}}
          >
            Dismiss
          </Link>
        </div>
      ) : null}

      <div className="page-head" style={{ marginBottom: 22 }}>
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow">Link detail</p>
          <div className="short-hero">
            <h1 className="short-url">/{link.slug}</h1>
            <StatePill state={link.state} />
          </div>
          <p className="lede">
            {link.campaignName ?? 'No campaign'} · created {formatUtc(link.createdAt)}
          </p>
        </div>
        <div className="page-head-actions">
          <CopyButton text={link.shortUrl} label="Copy short link" />
          <a className="btn" href={`/api/links/${link.id}/qr?format=png&download=1`}>
            Download QR
          </a>
        </div>
      </div>

      <div className="detail-grid">
        <div className="stack">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Destination</h2>
                <p className="small muted">Visitors go straight here. We never fetch it server-side.</p>
              </div>
            </div>
            <div className="card-body stack">
              <p className="destination">
                <a href={link.destinationUrl} rel="noreferrer noopener" target="_blank">
                  {link.destinationUrl}
                </a>
              </p>
              <dl className="details-list">
                <div>
                  <dt>Campaign</dt>
                  <dd>{link.campaignName ?? 'No campaign'}</dd>
                </div>
                <div>
                  <dt>Expiry (UTC)</dt>
                  <dd>{link.expiresAt ? formatUtc(link.expiresAt) : 'No expiry'}</dd>
                </div>
                <div>
                  <dt>Note</dt>
                  <dd>{link.note ?? 'No note'}</dd>
                </div>
                <div>
                  <dt>Domain</dt>
                  <dd>{link.domainHostname}</dd>
                </div>
                <div>
                  <dt>Last updated</dt>
                  <dd>{formatUtc(link.updatedAt)}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>Click activity</h2>
                <p className="small muted">
                  Last 7 days · {link.clicks7d.toLocaleString('en-US')} clicks
                </p>
              </div>
              <div className="clicks-row" style={{ minWidth: 260 }}>
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
            </div>
            <div className="card-body">
              <div className="spark" aria-hidden="true">
                {link.lastDays.map((day) => (
                  <div
                    key={day.day}
                    className={`spark-bar${day.clicks === 0 ? ' spark-bar--quiet' : ''}`}
                    title={`${day.day}: ${day.clicks} clicks`}
                  >
                    <i style={{ height: `${Math.max(3, (day.clicks / maxClicks) * 100)}%` }} />
                    <span>{day.day.slice(5)}</span>
                  </div>
                ))}
              </div>
              <p className="sr-only">
                Daily clicks for the last seven days:{' '}
                {link.lastDays.map((day) => `${day.day}, ${day.clicks} clicks`).join('; ')}.
              </p>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>Audit trail</h2>
                <p className="small muted">Every change to this link, newest first.</p>
              </div>
            </div>
            <div className="card-body">
              {link.audit.length === 0 ? (
                <p className="muted small">No audit entries yet.</p>
              ) : (
                <ul className="audit">
                  {link.audit.map((entry) => (
                    <li key={entry.id}>
                      <span className="audit-dot" aria-hidden="true" />
                      <div>
                        <div className="audit-action">{auditLabel(entry.action)}</div>
                        <div className="audit-meta">
                          {entry.actorName ?? 'System'} · {formatUtc(entry.createdAt)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <aside className="stack">
          <section className="card card-pad">
            <h2 className="section-title" style={{ fontSize: 21, marginBottom: 4 }}>
              QR code
            </h2>
            <p className="small muted" style={{ marginBottom: 16 }}>
              Points at the branded short URL. High-contrast, print-ready.
            </p>
            <div className="qr-frame">
              <img
                src={`/api/links/${link.id}/qr?format=svg`}
                alt={`QR code for ${link.shortUrl}`}
                width={196}
                height={196}
              />
            </div>
            <div className="inline" style={{ marginTop: 16, justifyContent: 'center' }}>
              <a className="btn btn--small" href={`/api/links/${link.id}/qr?format=png&download=1`}>
                PNG
              </a>
              <a className="btn btn--small" href={`/api/links/${link.id}/qr?format=svg&download=1`}>
                SVG
              </a>
            </div>
          </section>

          <section className="card card-pad stack-sm">
            <h2 className="section-title" style={{ fontSize: 21 }}>
              Share
            </h2>
            <p className="small muted">
              Copy the short URL or hand the QR to a designer. Inbound tracking query parameters are
              ignored and never stored.
            </p>
            <CopyButton text={link.shortUrl} label="Copy short link" />
          </section>

          {link.state === 'archived' ? (
            <InlineAlert tone="warn" title="Archived">
              This link no longer redirects. Restore it to make it live again. Analytics are kept.
            </InlineAlert>
          ) : null}
        </aside>
      </div>

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </>
  )
}

function ArchiveControl({
  link,
  onDone,
}: {
  link: LinkDetail
  onDone: (archived: boolean) => void
}) {
  const setArchived = useServerFn(setArchivedFn)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const archived = link.state === 'archived'

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const result = await setArchived({
        data: { linkId: link.id, archived: !archived },
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      dialogRef.current?.close()
      onDone(!archived)
    } catch {
      setError('Could not update this link. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={archived ? 'btn' : 'btn btn--danger'}
        onClick={() => {
          setError(null)
          dialogRef.current?.showModal()
        }}
      >
        {archived ? 'Restore link' : 'Archive'}
      </button>
      <dialog ref={dialogRef} aria-labelledby="archive-title">
        <div className="dialog-body">
          <h3 id="archive-title">{archived ? 'Restore this link?' : 'Archive this link?'}</h3>
          <p className="muted small">
            {archived
              ? 'The short URL will redirect again for anyone who has it. Analytics stay intact.'
              : 'The short URL will stop redirecting immediately and show a branded unavailable page. Analytics stay intact, and owners can restore it later.'}
          </p>
          {error ? (
            <div style={{ marginTop: 12 }}>
              <InlineAlert tone="error">{error}</InlineAlert>
            </div>
          ) : null}
          <div className="dialog-actions">
            <button
              type="button"
              className="btn"
              onClick={() => dialogRef.current?.close()}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={archived ? 'btn btn--primary' : 'btn btn--danger'}
              onClick={() => void confirm()}
              disabled={busy}
            >
              {busy ? 'Working…' : archived ? 'Restore link' : 'Archive link'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}
