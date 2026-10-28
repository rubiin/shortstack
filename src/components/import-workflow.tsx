import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import {
  applySuggestedSlugsFn,
  commitImportFn,
  createImportFn,
  previewImportFn,
  setImportRowExcludedFn,
  updateImportRowFn,
} from '~/server/functions/imports'
import {
  IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  importTemplate,
  type ImportMapping,
} from '~/domain/import'
import { toDateTimeLocal } from '~/domain/time'
import type { ImportBatchView, ImportRowView } from '~/domain/types'
import { Field, InlineAlert, StatusPill, SubmitButton } from './ui'

export function ImportUpload() {
  const router = useRouter()
  const createImport = useServerFn(createImportFn)
  const [csv, setCsv] = useState('')
  const [filename, setFilename] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})

  async function chooseFile(file: File | null) {
    if (!file) return
    if (file.size > 1_000_000) {
      setError('CSV must be smaller than 1,000 KB.')
      return
    }
    try {
      const text = await file.text()
      setCsv(text)
      setFilename(file.name)
      setError(null)
    } catch {
      setError('That file could not be read. Try pasting the CSV instead.')
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setFields({})
    try {
      const result = await createImport({ data: { csv, filename } })
      if (!result.ok) {
        setError(result.message)
        setFields(result.fields ?? {})
        return
      }
      await router.navigate({
        to: '/app/import/$batchId',
        params: { batchId: result.data.batchId },
      })
    } catch {
      setError('Could not read that CSV. Check the format and try again.')
    } finally {
      setBusy(false)
    }
  }

  function downloadTemplate() {
    const blob = new Blob([importTemplate()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'shortstack-import-template.csv'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <form className="form" onSubmit={(event) => void submit(event)} noValidate>
      {error ? (
        <InlineAlert tone="error" title="Could not read the CSV">
          {error}
        </InlineAlert>
      ) : null}

      <div className="card card-pad stack">
        <div className="field">
          <label htmlFor="csv-file">Upload a CSV</label>
          <input
            id="csv-file"
            className="input"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)}
            aria-describedby="csv-file-hint"
          />
          <span className="field-hint" id="csv-file-hint">
            Up to 1,000 rows and 1,000 KB. Uploading replaces whatever is in the paste box.
          </span>
        </div>

        <div className="divider-label">or paste</div>

        <Field
          label="CSV text"
          htmlFor="csv"
          error={fields.csv}
          hint="The first row must be headers. Slug and destination URL are required."
          aside={<span>{csv ? `${csv.split(/\r?\n/).length - 1} lines pasted` : 'Nothing pasted yet'}</span>}
        >
          <textarea
            id="csv"
            className="textarea textarea--code"
            value={csv}
            onChange={(event) => {
              setCsv(event.target.value)
              setFilename(undefined)
            }}
            placeholder={'slug,destination_url,campaign,note,expires_at,enabled\nspring-guide,https://example.com/spring,Spring Launch,Email CTA,2026-12-31,true'}
            spellCheck={false}
            aria-invalid={fields.csv ? true : undefined}
          />
        </Field>

        <div className="inline">
          <button type="button" className="btn btn--small" onClick={downloadTemplate}>
            Download template
          </button>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => {
              setCsv(importTemplate())
              setFilename('template.csv')
            }}
          >
            Use sample CSV
          </button>
          {filename ? <span className="small faint">Selected: {filename}</span> : null}
        </div>
      </div>

      <div className="form-actions">
        <SubmitButton busy={busy} disabled={!csv.trim()}>
          Read CSV and map columns
        </SubmitButton>
        <span className="small muted">Nothing is created until you review the dry run.</span>
      </div>
    </form>
  )
}

export function ImportBatchWork({ initial }: { initial: ImportBatchView }) {
  const router = useRouter()
  const previewImport = useServerFn(previewImportFn)
  const updateRow = useServerFn(updateImportRowFn)
  const excludeRow = useServerFn(setImportRowExcludedFn)
  const applySuggestions = useServerFn(applySuggestedSlugsFn)
  const commitImport = useServerFn(commitImportFn)

  const [batch, setBatch] = useState(initial)
  const [mapping, setMapping] = useState<ImportMapping>(initial.mapping)
  const [domainId, setDomainId] = useState(initial.domainId)
  const [mappingError, setMappingError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  useEffect(() => {
    setBatch(initial)
    setMapping(initial.mapping)
    setDomainId(initial.domainId)
  }, [initial])

  const mapped = batch.rows.length > 0
  const completed = batch.status === 'completed'
  const duplicates = batch.rows.filter(
    (row) => row.status === 'duplicate' && row.suggestedSlug,
  ).length
  const editable = batch.status === 'previewed'
  const createdCount = batch.createdLinks.length

  async function preview() {
    setPreviewing(true)
    setMappingError(null)
    setActionError(null)
    try {
      const result = await previewImport({
        data: { batchId: batch.id, mapping, domainId },
      })
      if (!result.ok) {
        setMappingError(result.message)
        return
      }
      setBatch(result.data)
      await router.invalidate()
    } catch {
      setMappingError('Could not preview this import. Try again.')
    } finally {
      setPreviewing(false)
    }
  }

  async function applyAll() {
    setActionError(null)
    try {
      const result = await applySuggestions({ data: { batchId: batch.id } })
      if (!result.ok) {
        setActionError(result.message)
        return
      }
      setBatch(result.data)
    } catch {
      setActionError('Could not apply suggested slugs. Try again.')
    }
  }

  async function toggleExcluded(row: ImportRowView) {
    setRowBusy(row.id)
    setActionError(null)
    try {
      const result = await excludeRow({
        data: { batchId: batch.id, rowId: row.id, excluded: row.status !== 'excluded' },
      })
      if (!result.ok) {
        setActionError(result.message)
        return
      }
      setBatch(result.data)
    } catch {
      setActionError('Could not update that row. Try again.')
    } finally {
      setRowBusy(null)
    }
  }

  async function saveRow(
    row: ImportRowView,
    values: {
      slug: string
      destinationUrl: string
      campaignName: string
      note: string
      expiresAt: string
      enabled: boolean
    },
  ) {
    setRowBusy(row.id)
    setActionError(null)
    try {
      const result = await updateRow({
        data: { batchId: batch.id, rowId: row.id, values },
      })
      if (!result.ok) {
        setActionError(result.message)
        return
      }
      setBatch(result.data)
    } catch {
      setActionError('Could not update that row. Try again.')
    } finally {
      setRowBusy(null)
    }
  }

  async function commit() {
    setCommitting(true)
    setActionError(null)
    try {
      const result = await commitImport({
        data: { batchId: batch.id, commitToken: batch.commitToken },
      })
      if (!result.ok) {
        setActionError(result.message)
        return
      }
      await router.invalidate()
    } catch {
      setActionError('Could not create the links. Reload the import and review the rows.')
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="stack">
      <ol className="steps" aria-label="Import progress">
        <li data-done={mapped || completed}>Upload</li>
        <li data-current={!mapped && !completed} data-done={mapped || completed}>
          Map & dry-run
        </li>
        <li data-current={completed} data-done={completed}>
          Create
        </li>
      </ol>

      {actionError ? (
        <InlineAlert tone="error" title="Action failed">
          {actionError}
        </InlineAlert>
      ) : null}

      {batch.rawExpired ? (
        <InlineAlert tone="warn" title="Raw CSV expired">
          The source CSV has been removed by retention. You can still review and download links that
          were created from this import.
        </InlineAlert>
      ) : null}

      <section className="card">
        <div className="card-header">
          <div>
            <h2>Column mapping</h2>
            <p className="small muted">
              {batch.filename ?? 'Pasted CSV'} · {batch.totalRows} data row
              {batch.totalRows === 1 ? '' : 's'}
            </p>
          </div>
          <StatusPill status={batch.status} />
        </div>
        <div className="card-body stack">
          {mappingError ? <InlineAlert tone="error">{mappingError}</InlineAlert> : null}
          <div className="mapping-grid">
            {IMPORT_FIELDS.map((field) => (
              <div className="field" key={field}>
                <label htmlFor={`map-${field}`}>
                  {IMPORT_FIELD_LABELS[field]}
                  {field === 'slug' || field === 'destination_url' ? (
                    <span className="field-hint">Required</span>
                  ) : null}
                </label>
                <select
                  id={`map-${field}`}
                  className="select"
                  value={mapping[field] ?? ''}
                  onChange={(event) =>
                    setMapping((current) => ({
                      ...current,
                      [field]: event.target.value || null,
                    }))
                  }
                  disabled={completed}
                >
                  <option value="">Not mapped</option>
                  {batch.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="grid-2">
            <Field
              label="Create links on domain"
              htmlFor="import-domain"
              hint="The domain is fixed for this batch."
            >
              <select
                id="import-domain"
                className="select"
                value={domainId}
                onChange={(event) => setDomainId(event.target.value)}
                disabled={completed}
              >
                {batch.domains.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.hostname}
                  </option>
                ))}
              </select>
            </Field>
            <div className="field">
              <span className="field-label">Dry run</span>
              <p className="field-hint" style={{ marginTop: 8 }}>
                Preview validates every row, normalizes slugs, and flags duplicates. Re-running it
                resets manual row edits.
              </p>
            </div>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void preview()}
              disabled={previewing || completed}
            >
              {previewing ? 'Running dry run…' : mapped ? 'Re-run dry run' : 'Run dry run'}
            </button>
            <span className="small muted">
              {mapped
                ? `${batch.validRows} valid · ${batch.invalidRows} need attention`
                : 'Map slug and destination before running the dry run.'}
            </span>
          </div>
        </div>
      </section>

      {mapped ? (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>{completed ? 'Imported links' : 'Dry-run rows'}</h2>
              <p className="small muted">
                {completed
                  ? `${createdCount} link${createdCount === 1 ? '' : 's'} created. Analytics start on the first click.`
                  : 'Edit, skip, or accept suggested slugs. Only valid rows are created.'}
              </p>
            </div>
            <div className="inline">
              {!completed && duplicates > 0 ? (
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => void applyAll()}
                >
                  Apply {duplicates} suggested slug{duplicates === 1 ? '' : 's'}
                </button>
              ) : null}
              {completed ? (
                <a
                  className="btn btn--small btn--primary"
                  href={`/api/imports/${batch.id}/qr.zip`}
                >
                  Download QR codes
                </a>
              ) : null}
            </div>
          </div>

          {completed ? (
            <div className="card-body stack">
              {batch.createdLinks.length === 0 ? (
                <p className="muted">No links were created.</p>
              ) : (
                <ul className="export-list">
                  {batch.createdLinks.map((link) => (
                    <li key={link.id}>
                      <div>
                        <Link
                          className="link-short"
                          to="/app/links/$linkId"
                          params={{ linkId: link.id }}
                        >
                          /{link.slug}
                        </Link>
                        <div className="small faint">{link.shortUrl}</div>
                      </div>
                      <Link
                        className="btn btn--small"
                        to="/app/links/$linkId"
                        params={{ linkId: link.id }}
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="inline">
                <Link className="btn btn--small" to="/app/import">
                  Import another CSV
                </Link>
                <Link className="btn btn--small" to="/app/links">
                  Back to links
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <caption>
                    {batch.validRows} ready to create · {batch.invalidRows} skipped unless fixed
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Row</th>
                      <th scope="col">Slug</th>
                      <th scope="col">Destination</th>
                      <th scope="col">Campaign</th>
                      <th scope="col">Expiry</th>
                      <th scope="col">Status</th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.rows.map((row) => (
                      <RowView
                        key={row.id}
                        row={row}
                        batchId={batch.id}
                        busy={rowBusy === row.id}
                        editable={editable}
                        onSave={(values) => void saveRow(row, values)}
                        onToggle={() => void toggleExcluded(row)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pagination">
                <span className="small muted">
                  {batch.invalidRows > 0
                    ? `${batch.invalidRows} row${batch.invalidRows === 1 ? '' : 's'} will be skipped.`
                    : 'Every mapped row is ready.'}
                </span>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void commit()}
                  disabled={committing || batch.validRows === 0 || !editable}
                >
                  {committing
                    ? 'Creating links…'
                    : `Create ${batch.validRows} link${batch.validRows === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  )
}

function RowView({
  row,
  batchId,
  busy,
  editable,
  onSave,
  onToggle,
}: {
  row: ImportRowView
  batchId: string
  busy: boolean
  editable: boolean
  onSave: (values: {
    slug: string
    destinationUrl: string
    campaignName: string
    note: string
    expiresAt: string
    enabled: boolean
  }) => void
  onToggle: () => void
}) {
  return (
    <tr id={`row-${batchId}-${row.id}`}>
      <td className="num">{row.rowNumber}</td>
      <td>
        <div className="cell-main">
          <span className="cell-title mono">{row.slug ? `/${row.slug}` : '—'}</span>
          {row.suggestedSlug ? (
            <span className="cell-sub">Suggested: /{row.suggestedSlug}</span>
          ) : null}
        </div>
      </td>
      <td>
        <span className="cell-sub" style={{ maxWidth: '36ch' }} title={row.destinationUrl ?? ''}>
          {row.destinationUrl ?? '—'}
        </span>
        {row.errors.length > 0 ? (
          <ul className="error-list">
            {row.errors.map((error, index) => (
              <li key={`${error.field}-${index}`}>{error.message}</li>
            ))}
          </ul>
        ) : null}
        {editable ? (
          <details style={{ marginTop: 6 }}>
            <summary className="small" style={{ cursor: 'pointer', color: 'var(--green)' }}>
              Fix row
            </summary>
            <RowEditor row={row} busy={busy} onSave={onSave} />
          </details>
        ) : null}
      </td>
      <td className="small">{row.campaignName ?? '—'}</td>
      <td className="small nowrap">
        {row.expiresAt ? new Date(row.expiresAt).toISOString().slice(0, 10) : '—'}
      </td>
      <td>
        <StatusPill status={row.status} />
      </td>
      <td>
        {editable ? (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={onToggle}
            disabled={busy}
          >
            {row.status === 'excluded' ? 'Include' : 'Skip'}
          </button>
        ) : (
          <span className="small faint">—</span>
        )}
      </td>
    </tr>
  )
}

function RowEditor({
  row,
  busy,
  onSave,
}: {
  row: ImportRowView
  busy: boolean
  onSave: (values: {
    slug: string
    destinationUrl: string
    campaignName: string
    note: string
    expiresAt: string
    enabled: boolean
  }) => void
}) {
  const [slug, setSlug] = useState(row.slug ?? '')
  const [destinationUrl, setDestinationUrl] = useState(row.destinationUrl ?? '')
  const [campaignName, setCampaignName] = useState(row.campaignName ?? '')
  const [note, setNote] = useState(row.note ?? '')
  const [expiresAt, setExpiresAt] = useState(toDateTimeLocal(row.expiresAt))
  const [enabled, setEnabled] = useState(row.enabled)
  const id = `row-edit-${row.id}`

  return (
    <div className="stack-sm" style={{ marginTop: 8, minWidth: 260 }}>
      <div className="field">
        <label htmlFor={`${id}-slug`}>Slug</label>
        <input
          id={`${id}-slug`}
          className="input"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          spellCheck={false}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-dest`}>Destination URL</label>
        <input
          id={`${id}-dest`}
          className="input"
          value={destinationUrl}
          onChange={(event) => setDestinationUrl(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-campaign`}>Campaign</label>
        <input
          id={`${id}-campaign`}
          className="input"
          value={campaignName}
          onChange={(event) => setCampaignName(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-note`}>Note</label>
        <input
          id={`${id}-note`}
          className="input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-expiry`}>Expiry (UTC)</label>
        <input
          id={`${id}-expiry`}
          className="input"
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
        />
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span>Enabled</span>
      </label>
      <button
        type="button"
        className="btn btn--small btn--primary"
        disabled={busy}
        onClick={() =>
          onSave({
            slug,
            destinationUrl,
            campaignName,
            note,
            expiresAt,
            enabled,
          })
        }
      >
        {busy ? 'Saving…' : 'Save and re-check'}
      </button>
    </div>
  )
}
