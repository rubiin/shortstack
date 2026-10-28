import { Link, createFileRoute } from '@tanstack/react-router'

import { CopyButton, EmptyState, StatePill, StatCard } from '~/components/ui'
import type { LinkState } from '~/domain/time'
import { formatUtc } from '~/domain/time'
import type { LinkListItem } from '~/domain/types'
import { listLinksFn } from '~/server/functions/links'

type LinkSearch = {
  search?: string
  campaignId?: string
  state?: LinkState | 'all'
  page?: number
}

const states: Array<{ value: LinkState | 'all'; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Paused' },
  { value: 'expired', label: 'Expired' },
  { value: 'archived', label: 'Archived' },
]

function parseSearch(input: Record<string, unknown>): LinkSearch {
  const state = states.some((item) => item.value === input.state)
    ? (input.state as LinkState | 'all')
    : 'active'
  const page = Number(input.page)
  return {
    search: typeof input.search === 'string' ? input.search.slice(0, 200) : undefined,
    campaignId: typeof input.campaignId === 'string' ? input.campaignId.slice(0, 100) : undefined,
    state,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : undefined,
  }
}

export const Route = createFileRoute('/app/links/')({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    listLinksFn({
      data: {
        search: deps.search ?? '',
        campaignId: deps.campaignId ?? '',
        state: deps.state ?? 'active',
        page: deps.page ?? 1,
      },
    }),
  head: () => ({ meta: [{ title: 'Links · Shortstack' }] }),
  component: LinksPage,
})

function LinksPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const filtered = Boolean(
    search.search || search.campaignId || (search.state && search.state !== 'active'),
  )
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Link library</p>
          <h1 className="display">Your links, on the record.</h1>
          <p className="lede">
            Create branded redirects, keep campaigns tidy, and read the signal without collecting
            visitor profiles.
          </p>
        </div>
        <div className="page-head-actions">
          <Link className="btn btn--primary" to="/app/links/new">
            New link
          </Link>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard
          label="Active links"
          value={data.stats.activeLinks}
          note="Live and ready to share"
        />
        <StatCard
          label="Clicks · 7 days"
          value={data.stats.clicks7d}
          note="All active and historical links"
        />
        <StatCard
          label="Expiring soon"
          value={data.stats.expiring7d}
          note="Within the next 7 days"
        />
        <StatCard label="Archived" value={data.stats.archivedLinks} note="Kept for the record" />
      </div>

      <form className="filter-bar" method="get" action="/app/links" role="search">
        <div className="filter-search">
          <label className="sr-only" htmlFor="link-search">
            Search links
          </label>
          <input
            id="link-search"
            className="input"
            type="search"
            name="search"
            placeholder="Search slug or destination"
            defaultValue={search.search ?? ''}
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="state-filter">
            Link state
          </label>
          <select
            id="state-filter"
            className="select"
            name="state"
            defaultValue={search.state ?? 'active'}
          >
            {states.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="campaign-filter">
            Campaign
          </label>
          <select
            id="campaign-filter"
            className="select"
            name="campaignId"
            defaultValue={search.campaignId ?? ''}
          >
            <option value="">All campaigns</option>
            {data.campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn">
          Apply
        </button>
      </form>

      <div className="tabs" role="navigation" aria-label="Filter by link state">
        {states.map((item) => (
          <Link
            key={item.value}
            className="tab"
            to="/app/links"
            search={{ ...search, state: item.value, page: 1 }}
            activeProps={{ 'aria-current': 'page' }}
            activeOptions={{ exact: true, includeSearch: true }}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        {data.links.length === 0 ? (
          <EmptyState
            title={filtered ? 'No links match those filters' : 'No active links yet'}
            action={
              filtered ? (
                <Link className="btn" to="/app/links" search={{ state: 'active' }}>
                  Clear filters
                </Link>
              ) : (
                <Link className="btn btn--primary" to="/app/links/new">
                  Create your first link
                </Link>
              )
            }
          >
            {filtered
              ? 'Try another slug, destination, campaign, or state. Archived and expired links stay searchable.'
              : 'Short links make campaigns easier to share and measure. Start with one destination and a branded slug.'}
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap table-desktop">
              <table className="table">
                <caption className="table-caption">
                  {data.total} link{data.total === 1 ? '' : 's'} · page {data.page} of {totalPages}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Short link</th>
                    <th scope="col">Destination</th>
                    <th scope="col">State</th>
                    <th scope="col">Clicks · 7d</th>
                    <th scope="col">Updated</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.links.map((link) => (
                    <tr key={link.id}>
                      <td>
                        <div className="cell-main">
                          <Link
                            className="link-short"
                            to="/app/links/$linkId"
                            params={{ linkId: link.id }}
                            title={`View ${link.slug}`}
                          >
                            /{link.slug}
                          </Link>
                          <span className="cell-sub">{link.domainHostname}</span>
                        </div>
                      </td>
                      <td>
                        <div className="cell-main">
                          <span className="cell-title">{link.campaignName ?? 'No campaign'}</span>
                          <span className="cell-sub" title={link.destinationUrl}>
                            {link.destinationUrl}
                          </span>
                        </div>
                      </td>
                      <td>
                        <StatePill state={link.state} />
                      </td>
                      <td className="num">{link.clicks7d.toLocaleString('en-US')}</td>
                      <td className="small muted nowrap">{formatUtc(link.updatedAt)}</td>
                      <td>
                        <div className="row-actions">
                          <CopyButton text={link.shortUrl} label="Copy" compact />
                          <Link
                            className="btn btn--ghost btn--small"
                            to="/app/links/$linkId/edit"
                            params={{ linkId: link.id }}
                          >
                            Edit
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card-list">
              {data.links.map((link) => (
                <LinkCard key={link.id} link={link} />
              ))}
            </div>

            {totalPages > 1 ? (
              <nav className="pagination" aria-label="Links pagination">
                <span className="small muted">
                  Page {data.page} of {totalPages}
                </span>
                <div className="inline">
                  {data.page > 1 ? (
                    <Link
                      className="btn btn--small"
                      to="/app/links"
                      search={{ ...search, page: data.page - 1 }}
                    >
                      Previous
                    </Link>
                  ) : (
                    <span className="btn btn--small" aria-disabled="true">
                      Previous
                    </span>
                  )}
                  {data.page < totalPages ? (
                    <Link
                      className="btn btn--small"
                      to="/app/links"
                      search={{ ...search, page: data.page + 1 }}
                    >
                      Next
                    </Link>
                  ) : (
                    <span className="btn btn--small" aria-disabled="true">
                      Next
                    </span>
                  )}
                </div>
              </nav>
            ) : null}
          </>
        )}
      </div>
    </>
  )
}

function LinkCard({ link }: { link: LinkListItem }) {
  return (
    <article className="link-card">
      <div className="link-card-head">
        <div style={{ minWidth: 0 }}>
          <Link className="link-short" to="/app/links/$linkId" params={{ linkId: link.id }}>
            /{link.slug}
          </Link>
          <div className="small muted" style={{ marginTop: 2 }}>
            {link.campaignName ?? 'No campaign'} · {link.clicks7d.toLocaleString('en-US')} clicks in
            7d
          </div>
        </div>
        <StatePill state={link.state} />
      </div>
      <p className="link-card-dest">{link.destinationUrl}</p>
      <div className="between" style={{ marginTop: 12 }}>
        <span className="small faint">Updated {formatUtc(link.updatedAt)}</span>
        <div className="row-actions">
          <CopyButton text={link.shortUrl} label="Copy" compact />
          <Link
            className="btn btn--ghost btn--small"
            to="/app/links/$linkId/edit"
            params={{ linkId: link.id }}
          >
            Edit
          </Link>
        </div>
      </div>
    </article>
  )
}
