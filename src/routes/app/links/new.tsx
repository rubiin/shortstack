import { Link, createFileRoute } from '@tanstack/react-router'
import { getEditorDataFn } from '~/server/functions/links'
import { LinkEditor } from '~/components/link-editor'

export const Route = createFileRoute('/app/links/new')({
  loader: () => getEditorDataFn({ data: {} }),
  head: () => ({ meta: [{ title: 'New link · Shortstack' }] }),
  component: NewLinkPage,
})

function NewLinkPage() {
  const data = Route.useLoaderData()
  return (
    <>
      <div className="between" style={{ marginBottom: 18 }}>
        <Link className="btn btn--ghost btn--small" to="/app/links">
          ← All links
        </Link>
      </div>
      <div style={{ marginBottom: 24 }}>
        <p className="eyebrow">New link</p>
        <h1 className="display">Make it short. Make it yours.</h1>
        <p className="lede">
          Pick a branded domain, choose a memorable slug, and send visitors straight to the
          destination. Nothing is fetched until a visitor clicks.
        </p>
      </div>

      {data.domains.length === 0 ? (
        <div className="alert alert--warn">
          No active domain is configured for this workspace. Ask an owner to add one before creating
          links.
        </div>
      ) : (
        <div className="split">
          <LinkEditor mode="create" domains={data.domains} campaigns={data.campaigns} link={null} />
          <aside className="card card-pad stack-sm">
            <h2 className="section-title" style={{ fontSize: 21 }}>
              A good short link
            </h2>
            <p className="small muted">
              Keep it readable: <span className="mono">spring-guide</span> beats{' '}
              <span className="mono">x7k2p</span>. Slugs are lowercased and normalized
              automatically, and uniqueness is case-insensitive per domain.
            </p>
            <hr />
            <h3 style={{ fontFamily: 'var(--sans)', fontSize: 13 }}>What happens on save</h3>
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>The redirect goes live for the correct hostname and slug.</li>
              <li>A cache purge safety job is queued when Cloudflare is enabled.</li>
              <li>The change is written to the link audit trail.</li>
            </ul>
            <hr />
            <p className="small faint">
              We store only the destination, campaign, note, and the expiry you choose. No visitor
              profiles are created at any point.
            </p>
          </aside>
        </div>
      )}
    </>
  )
}
