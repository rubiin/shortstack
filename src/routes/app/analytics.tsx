import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { EmptyState, InlineAlert, StatCard } from '~/components/ui'
import { formatUtc } from '~/domain/time'
import type { AnalyticsData, BreakdownItem, ExportSummary } from '~/domain/types'
import { createExportFn, getAnalyticsFn, getExportStatusFn } from '~/server/functions/analytics'

type AnalyticsSearch = {
  from?: string
  to?: string
  days?: number
  compare?: boolean
  campaignId?: string
}

function parseDays(value: unknown): number | undefined {
  const days = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(days) && days >= 1 && days <= 366 ? Math.floor(days) : undefined
}

function parseAnalyticsSearch(input: Record<string, unknown>): AnalyticsSearch {
  return {
    from: typeof input.from === 'string' ? input.from.slice(0, 10) : undefined,
    to: typeof input.to === 'string' ? input.to.slice(0, 10) : undefined,
    days: parseDays(input.days),
    compare: !(input.compare === 'false' || input.compare === false),
    campaignId: typeof input.campaignId === 'string' ? input.campaignId.slice(0, 100) : undefined,
  }
}

export const Route = createFileRoute('/app/analytics')({
  validateSearch: parseAnalyticsSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    getAnalyticsFn({
      data: {
        from: deps.from,
        to: deps.to,
        days: deps.days,
        compare: deps.compare !== false,
        campaignId: deps.campaignId ?? null,
      },
    }),
  head: () => ({ meta: [{ title: 'Analytics · Shortstack' }] }),
  component: AnalyticsPage,
})

function AnalyticsPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const router = useRouter()
  const createExport = useServerFn(createExportFn)
  const getExportStatus = useServerFn(getExportStatusFn)

  const [exports, setExports] = useState<ExportSummary[]>(data.exportList)
  const [activeExport, setActiveExport] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setExports(data.exportList)
  }, [data.exportList])

  useEffect(() => {
    if (!activeExport) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0

    const tick = async () => {
      try {
        const status = await getExportStatus({ data: { exportId: activeExport } })
        if (cancelled) return
        if (status) {
          setExports((current) => {
            const rest = current.filter((item) => item.id !== status.id)
            return [status, ...rest]
          })
          if ((status.status === 'queued' || status.status === 'running') && attempts < 80) {
            attempts += 1
            timer = setTimeout(() => void tick(), 1500)
            return
          }
        }
        if (!cancelled) setActiveExport(null)
      } catch {
        if (!cancelled) {
          setError('Could not check the export status. It will still appear when ready.')
          setActiveExport(null)
        }
      }
    }

    timer = setTimeout(() => void tick(), 700)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [activeExport, getExportStatus])

  async function startExport() {
    setCreating(true)
    setError(null)
    try {
      const result = await createExport({
        data: {
          from: data.range.from,
          to: data.range.to,
          campaignId: data.filters.campaignId,
        },
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setActiveExport(result.data.exportId)
    } catch {
      setError('Could not queue that export. Try again.')
    } finally {
      setCreating(false)
    }
  }

  function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    void router.navigate({
      to: '/app/analytics',
      search: {
        from: String(form.get('from') ?? ''),
        to: String(form.get('to') ?? ''),
        campaignId: String(form.get('campaignId') ?? '') || undefined,
        compare: form.get('compare') === 'on',
      },
    })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Analytics</p>
          <h1 className="display">Signal, not surveillance.</h1>
          <p className="lede">
            Clicks grouped by day, coarse country, referrer domain, and device class. No IP
            addresses, raw user agents, or visitor profiles.
          </p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 22 }}>
        <div className="between" style={{ marginBottom: 16 }}>
          <div>
            <h2 className="section-title" style={{ fontSize: 21 }}>
              Reporting window
            </h2>
            <p className="small muted">
              {data.range.from} to {data.range.to} · {data.range.days} days · UTC
            </p>
          </div>
          <div className="tabs" aria-label="Date range presets">
            {[7, 30, 90].map((days) => {
              const preset = !search.from && !search.to && Number(search.days ?? 30) === days
              return (
                <Link
                  key={days}
                  className="tab"
                  to="/app/analytics"
                  search={{
                    days,
                    compare: data.filters.compare,
                    campaignId: data.filters.campaignId ?? undefined,
                  }}
                  aria-current={preset ? 'page' : undefined}
                >
                  {days}d
                </Link>
              )
            })}
          </div>
        </div>

        <form
          className="range-form"
          onSubmit={applyRange}
          key={`${data.range.from}-${data.range.to}`}
        >
          <div className="field">
            <label htmlFor="from">From</label>
            <input
              id="from"
              className="input"
              type="date"
              name="from"
              defaultValue={data.range.from}
            />
          </div>
          <div className="field">
            <label htmlFor="to">To</label>
            <input id="to" className="input" type="date" name="to" defaultValue={data.range.to} />
          </div>
          <div className="field">
            <label htmlFor="analytics-campaign">Campaign</label>
            <select
              id="analytics-campaign"
              className="select"
              name="campaignId"
              defaultValue={data.filters.campaignId ?? ''}
            >
              <option value="">All campaigns</option>
              {data.campaignsAvailable.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions" style={{ paddingTop: 0 }}>
            <button type="submit" className="btn">
              Update
            </button>
            <label className="check">
              <input type="checkbox" name="compare" defaultChecked={data.filters.compare} />
              <span>Compare</span>
            </label>
          </div>
        </form>
      </div>

      {data.totalClicks === 0 ? (
        <div className="card">
          <EmptyState
            title={data.hasAnyClicks ? 'No clicks in this window' : 'No clicks yet'}
            action={
              <Link className="btn btn--primary" to="/app/links">
                Review your links
              </Link>
            }
          >
            {data.hasAnyClicks
              ? 'Try a wider reporting window or a different campaign. No visitor profiles are created either way.'
              : 'Share a short link or QR code and the first click will show up here within a moment. Analytics only keep coarse, non-identifying dimensions.'}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard
              label="Clicks"
              value={data.totalClicks.toLocaleString('en-US')}
              note={`${data.range.days} days · current window`}
            />
            <StatCard
              label="Previous window"
              value={data.previousClicks.toLocaleString('en-US')}
              note={
                data.deltaPercent === null
                  ? 'No previous clicks to compare'
                  : `${data.deltaPercent > 0 ? '+' : ''}${data.deltaPercent}% change`
              }
            />
            <StatCard
              label="Top country"
              value={data.topCountry?.label ?? '—'}
              note={data.topCountry ? `${data.topCountry.clicks} clicks` : 'No geography yet'}
            />
            <StatCard
              label="Mobile share"
              value={`${data.mobileShare}%`}
              note={
                data.topReferrer ? `Top referrer: ${data.topReferrer.label}` : 'No referrer data'
              }
            />
          </div>

          <section className="card" style={{ marginBottom: 22 }}>
            <div className="card-header">
              <div>
                <h2>Clicks over time</h2>
                <p className="small muted">
                  Daily totals{data.filters.compare ? ' against the previous window' : ''}. Hover or
                  read the table for exact values.
                </p>
              </div>
              <div className="chart-legend" aria-hidden="true">
                <span>
                  <i /> Current
                </span>
                {data.filters.compare ? (
                  <span>
                    <i className="prev" /> Previous
                  </span>
                ) : null}
              </div>
            </div>
            <div className="card-body">
              <TrendChart data={data} />
            </div>
          </section>

          <div className="grid-2" style={{ marginBottom: 22 }}>
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Referrers</h2>
                  <p className="small muted">Domain only. Paths and query strings are discarded.</p>
                </div>
              </div>
              <div className="card-body">
                <Breakdown items={data.referrers} empty="No referrer domains in this window." />
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Countries</h2>
                  <p className="small muted">Coarse country code from the edge, never an IP.</p>
                </div>
              </div>
              <div className="card-body">
                <Breakdown
                  items={data.countries}
                  empty="No country data in this window."
                  tone="rust"
                />
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Devices</h2>
                  <p className="small muted">Desktop, mobile, tablet, or automated.</p>
                </div>
              </div>
              <div className="card-body">
                <Breakdown
                  items={data.devices}
                  empty="No device data in this window."
                  tone="gold"
                />
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Campaigns</h2>
                  <p className="small muted">Links without a campaign are grouped as Unassigned.</p>
                </div>
              </div>
              <div className="card-body">
                <Breakdown items={data.campaigns} empty="No campaign clicks in this window." />
              </div>
            </section>
          </div>

          <div className="grid-2">
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Top links</h2>
                  <p className="small muted">Highest click counts in this window.</p>
                </div>
              </div>
              <div className="card-body">
                {data.topLinks.length === 0 ? (
                  <p className="small muted">No link clicks in this window.</p>
                ) : (
                  <ul className="export-list">
                    {data.topLinks.map((link) => (
                      <li key={link.id}>
                        <div style={{ minWidth: 0 }}>
                          <Link
                            className="link-short"
                            to="/app/links/$linkId"
                            params={{ linkId: link.id }}
                          >
                            /{link.slug}
                          </Link>
                          <div className="small faint">{link.campaignName ?? 'No campaign'}</div>
                        </div>
                        <span className="num">{link.clicks.toLocaleString('en-US')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2>CSV export</h2>
                  <p className="small muted">
                    Generated in the background. Downloads expire after 7 days.
                  </p>
                </div>
              </div>
              <div className="card-body stack">
                {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
                <div className="between">
                  <p className="small muted">
                    Includes one row per minimized click: day, country, referrer domain, device, and
                    link.
                  </p>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => void startExport()}
                    disabled={creating || Boolean(activeExport)}
                  >
                    {creating ? 'Queuing…' : activeExport ? 'Generating…' : 'Create export'}
                  </button>
                </div>

                {exports.length === 0 ? (
                  <p className="small faint">No exports yet for this workspace.</p>
                ) : (
                  <ul className="export-list">
                    {exports.slice(0, 6).map((item) => (
                      <li key={item.id}>
                        <div>
                          <div className="inline">
                            <span className={`pill pill--${item.status}`}>
                              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                            </span>
                            <span className="small">
                              {item.rowCount !== null
                                ? `${item.rowCount.toLocaleString('en-US')} rows`
                                : 'Counting rows'}
                            </span>
                          </div>
                          <div className="small faint">
                            {item.requestedByName} · {formatUtc(item.createdAt)}
                            {item.status === 'failed' && item.lastError
                              ? ` · ${item.lastError}`
                              : ''}
                          </div>
                        </div>
                        {item.status === 'ready' && item.downloadUrl ? (
                          <a className="btn btn--small btn--primary" href={item.downloadUrl}>
                            Download
                          </a>
                        ) : (
                          <span className="small faint">
                            {item.status === 'queued' || item.status === 'running'
                              ? 'Working…'
                              : item.status === 'expired'
                                ? 'Expired'
                                : '—'}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </>
  )
}

function TrendChart({ data }: { data: AnalyticsData }) {
  const max = Math.max(
    1,
    ...data.trend.map((point) =>
      Math.max(point.current, data.filters.compare ? point.previous : 0),
    ),
  )
  return (
    <div className="chart">
      <div className="chart-bars" aria-hidden="true">
        {data.trend.map((point) => (
          <div
            key={point.day}
            className="chart-col"
            title={`${point.day}: ${point.current} clicks`}
          >
            {data.filters.compare ? (
              <i
                className="chart-col--prev"
                style={{
                  height: `${Math.max(1, (point.previous / max) * 100)}%`,
                  background: '#cfc9b9',
                  width: '42%',
                }}
              />
            ) : null}
            <i style={{ height: `${Math.max(1, (point.current / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="between small faint">
        <span>{data.trend[0]?.day ?? data.range.from}</span>
        <span>{data.trend[data.trend.length - 1]?.day ?? data.range.to}</span>
      </div>
      <details>
        <summary className="small" style={{ cursor: 'pointer', color: 'var(--green)' }}>
          View daily values as a table
        </summary>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="table">
            <caption>Daily clicks for the current and previous windows</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Current</th>
                {data.filters.compare ? <th scope="col">Previous</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.trend.map((point) => (
                <tr key={point.day}>
                  <td className="num">{point.day}</td>
                  <td className="num">{point.current}</td>
                  {data.filters.compare ? <td className="num">{point.previous}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

function Breakdown({
  items,
  empty,
  tone,
}: {
  items: BreakdownItem[]
  empty: string
  tone?: 'rust' | 'gold'
}) {
  if (items.length === 0) return <p className="small muted">{empty}</p>
  return (
    <div className={`breakdown${tone ? ` breakdown--${tone}` : ''}`}>
      {items.map((item) => (
        <div key={item.key} className="breakdown-row">
          <div className="breakdown-label">
            <span>{item.label}</span>
            <span>
              {item.clicks.toLocaleString('en-US')} · {item.share}%
            </span>
          </div>
          <div
            className="breakdown-track"
            role="img"
            aria-label={`${item.label}: ${item.clicks} clicks, ${item.share} percent`}
          >
            <i style={{ width: `${Math.max(item.clicks > 0 ? 2 : 0, item.share)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
