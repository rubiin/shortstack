import { createFileRoute } from '@tanstack/react-router'
import { ImportUpload } from '~/components/import-workflow'

export const Route = createFileRoute('/app/import/')({
  head: () => ({ meta: [{ title: 'Bulk import · Shortstack' }] }),
  component: ImportStartPage,
})

function ImportStartPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Bulk import</p>
          <h1 className="display display--wide">A whole campaign, in one pass.</h1>
          <p className="lede">
            Upload a CSV, map the columns, and review a dry run before anything is created. Only
            valid rows become links.
          </p>
        </div>
      </div>

      <ol className="steps" aria-label="Import progress">
        <li data-current="true">Upload</li>
        <li>Map & dry-run</li>
        <li>Create</li>
      </ol>

      <div className="split">
        <ImportUpload />

        <aside className="stack">
          <section className="card card-pad stack-sm">
            <h2 className="section-title" style={{ fontSize: 21 }}>
              Columns we understand
            </h2>
            <dl className="details-list">
              <div>
                <dt>slug (required)</dt>
                <dd>Lowercase letters, numbers, and hyphens. Normalized on import.</dd>
              </div>
              <div>
                <dt>destination_url (required)</dt>
                <dd>An HTTP or HTTPS URL.</dd>
              </div>
              <div>
                <dt>campaign</dt>
                <dd>Created automatically if it does not exist.</dd>
              </div>
              <div>
                <dt>note</dt>
                <dd>Internal context, up to 500 characters.</dd>
              </div>
              <div>
                <dt>expires_at</dt>
                <dd>YYYY-MM-DD or a UTC date-time. Must be in the future.</dd>
              </div>
              <div>
                <dt>enabled</dt>
                <dd>true/false, yes/no, or 1/0. Defaults to true.</dd>
              </div>
            </dl>
          </section>

          <div className="card card-pad stack-sm">
            <h2 className="section-title" style={{ fontSize: 21 }}>
              What the dry run checks
            </h2>
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
              <li>Slug normalization and case-insensitive collisions.</li>
              <li>Duplicate slugs inside the same file, with suggestions.</li>
              <li>Destination URL safety and expiry validity.</li>
              <li>Campaign names and note limits.</li>
            </ul>
            <p className="small faint">
              Max 1,000 rows per batch. Raw CSV text is retained for 7 days, then removed while the
              created links remain.
            </p>
          </div>
        </aside>
      </div>
    </>
  )
}
