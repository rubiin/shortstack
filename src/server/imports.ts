import { ConflictError, NotFoundError, ValidationError, type AuthUser } from '~/domain/authz'
import { parseCsv, CsvError } from '~/domain/csv'
import { normalizeDestination } from '~/domain/destination'
import {
  IMPORT_FIELDS,
  autoMap,
  normalizeImportRow,
  validateMapping,
  type ImportMapping,
} from '~/domain/import'
import { normalizeSlug, suggestAvailableSlug } from '~/domain/slug'
import { parseDateTimeLocalUtc } from '~/domain/time'
import type {
  DomainOption,
  ImportBatchStatus,
  ImportBatchView,
  ImportRowError,
  ImportRowView,
} from '~/domain/types'

import { getConfig } from './config'
import { getDb } from './db'
import { newId, nowIso, randomToken } from './ids'
import { getPublicUrl } from './links'
import { logger } from './log'

type BatchRow = {
  id: string
  filename: string | null
  raw_csv: string | null
  headers_json: string
  mapping_json: string | null
  status: ImportBatchStatus
  total_rows: number
  valid_rows: number
  invalid_rows: number
  commit_token: string
  domain_id: string
  domain_hostname: string
  domain_origin: string
  created_at: string
  completed_at: string | null
}

type RowRow = {
  id: string
  row_number: number
  raw_json: string
  slug: string | null
  destination_url: string | null
  campaign_name: string | null
  note: string | null
  expires_at: string | null
  enabled: number
  status: ImportRowView['status']
  errors_json: string
  suggested_slug: string | null
  created_link_id: string | null
}

function loadBatch(workspaceId: string, batchId: string): BatchRow {
  const row = getDb()
    .prepare(
      `SELECT b.*, d.hostname AS domain_hostname, d.origin AS domain_origin
       FROM import_batches b JOIN domains d ON d.id = b.domain_id
       WHERE b.id = ? AND b.workspace_id = ?`,
    )
    .get(batchId, workspaceId) as BatchRow | undefined
  if (!row) throw new NotFoundError('Import not found.')
  return row
}

function domainOptions(workspaceId: string): DomainOption[] {
  return (
    getDb()
      .prepare(
        "SELECT id, hostname, origin, is_default FROM domains WHERE workspace_id = ? AND status = 'active' ORDER BY is_default DESC",
      )
      .all(workspaceId) as Array<{
      id: string
      hostname: string
      origin: string
      is_default: number
    }>
  ).map((row) => ({
    id: row.id,
    hostname: row.hostname,
    origin: row.origin,
    isDefault: row.is_default === 1,
  }))
}

function slugExists(domainId: string, slug: string): boolean {
  return Boolean(
    getDb()
      .prepare('SELECT 1 FROM short_links WHERE domain_id = ? AND slug = ?')
      .get(domainId, slug),
  )
}

function findFreeSuggestion(base: string, domainId: string, seen: Set<string>): string | null {
  for (let attempt = 2; attempt < 100; attempt += 1) {
    const candidate = suggestAvailableSlug(base, attempt)
    if (!seen.has(candidate) && !slugExists(domainId, candidate)) return candidate
  }
  return null
}

function getOrCreateCampaign(workspaceId: string, name: string, userId: string): string {
  const db = getDb()
  const existing = db
    .prepare('SELECT id FROM campaigns WHERE workspace_id = ? AND name = ? COLLATE NOCASE')
    .get(workspaceId, name) as { id: string } | undefined
  if (existing) return existing.id
  const id = newId('cmp')
  const timestamp = nowIso()
  db.prepare(
    "INSERT INTO campaigns (id, workspace_id, name, status, created_by, created_at) VALUES (?, ?, ?, 'active', ?, ?)",
  ).run(id, workspaceId, name, userId, timestamp)
  db.prepare(
    `INSERT INTO audit_log (id, workspace_id, actor_user_id, action, entity_type, entity_id, details_json, created_at)
     VALUES (?, ?, ?, 'campaign.created', 'campaign', ?, ?, ?)`,
  ).run(newId('aud'), workspaceId, userId, id, JSON.stringify({ name }), timestamp)
  return id
}

export function createImportBatch(input: {
  user: AuthUser
  csv: string
  filename?: string | null
}): { batchId: string } {
  const db = getDb()
  let parsed: ReturnType<typeof parseCsv>
  try {
    parsed = parseCsv(input.csv)
  } catch (error) {
    if (error instanceof CsvError) throw new ValidationError(error.message, { csv: error.message })
    throw error
  }
  const domain = db
    .prepare(
      "SELECT id FROM domains WHERE workspace_id = ? AND status = 'active' AND is_default = 1",
    )
    .get(input.user.workspaceId) as { id: string } | undefined
  if (!domain) throw new ValidationError('No active default domain is configured.')
  const mapping = autoMap(parsed.headers)
  const id = newId('imp')
  const timestamp = nowIso()
  const rawExpiresAt = new Date(
    Date.now() + getConfig().RAW_IMPORT_RETENTION_DAYS * 86_400_000,
  ).toISOString()
  db.prepare(
    `INSERT INTO import_batches
     (id, workspace_id, domain_id, created_by, filename, raw_csv, headers_json, mapping_json, status, total_rows, commit_token, raw_expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.user.workspaceId,
    domain.id,
    input.user.id,
    (input.filename ?? 'Pasted CSV').slice(0, 200),
    input.csv,
    JSON.stringify(parsed.headers),
    JSON.stringify(mapping),
    parsed.rows.length,
    randomToken(18),
    rawExpiresAt,
    timestamp,
    timestamp,
  )
  logger.info('import draft created', {
    batchId: id,
    workspaceId: input.user.workspaceId,
    rows: parsed.rows.length,
  })
  return { batchId: id }
}

function mapFromJson(value: string | null): ImportMapping {
  if (!value) return {}
  try {
    return JSON.parse(value) as ImportMapping
  } catch {
    return {}
  }
}

function errorsFromJson(value: string): ImportRowError[] {
  try {
    return JSON.parse(value) as ImportRowError[]
  } catch {
    return []
  }
}

function mapRow(row: RowRow): ImportRowView {
  return {
    id: row.id,
    rowNumber: row.row_number,
    slug: row.slug,
    destinationUrl: row.destination_url,
    campaignName: row.campaign_name,
    note: row.note,
    expiresAt: row.expires_at,
    enabled: row.enabled === 1,
    status: row.status,
    errors: errorsFromJson(row.errors_json),
    suggestedSlug: row.suggested_slug,
    createdLinkId: row.created_link_id,
  }
}

function viewBatch(workspaceId: string, batchId: string): ImportBatchView {
  const batch = loadBatch(workspaceId, batchId)
  const rows = getDb()
    .prepare('SELECT * FROM import_rows WHERE batch_id = ? ORDER BY row_number')
    .all(batchId) as RowRow[]
  const createdLinks = rows
    .filter((row) => row.created_link_id)
    .map((row) => ({
      id: row.created_link_id as string,
      slug: row.slug ?? '',
      shortUrl: getPublicUrl(batch.domain_origin, row.slug ?? ''),
    }))
  return {
    id: batch.id,
    filename: batch.filename,
    status: batch.status,
    headers: JSON.parse(batch.headers_json) as string[],
    mapping: mapFromJson(batch.mapping_json),
    totalRows: batch.total_rows,
    validRows: batch.valid_rows,
    invalidRows: batch.invalid_rows,
    commitToken: batch.commit_token,
    domainId: batch.domain_id,
    domainHostname: batch.domain_hostname,
    createdAt: batch.created_at,
    completedAt: batch.completed_at,
    rows: rows.map(mapRow),
    domains: domainOptions(workspaceId),
    createdLinks,
    rawExpired: batch.raw_csv === null,
  }
}

export function getImportBatch(workspaceId: string, batchId: string): ImportBatchView {
  return viewBatch(workspaceId, batchId)
}

type StoredRowInput = {
  slug: string | null
  destinationUrl: string | null
  campaignName: string | null
  note: string | null
  expiresAt: string | null
  enabled: boolean
}

function validateStoredRow(
  input: StoredRowInput,
  now: Date,
): {
  normalized: StoredRowInput
  errors: ImportRowError[]
} {
  const errors: ImportRowError[] = []
  const slug = normalizeSlug(input.slug ?? '')
  if (!slug.ok) errors.push({ field: 'slug', message: slug.error })
  const destination = normalizeDestination(input.destinationUrl ?? '')
  if (!destination.ok) errors.push({ field: 'destination_url', message: destination.error })
  const campaignName = (input.campaignName ?? '').trim()
  if (campaignName.length > 80)
    errors.push({ field: 'campaign', message: 'Campaign names can be at most 80 characters.' })
  const note = (input.note ?? '').trim()
  if (note.length > 500)
    errors.push({ field: 'note', message: 'Notes can be at most 500 characters.' })
  let expiresAt: string | null = null
  if (input.expiresAt) {
    expiresAt =
      parseDateTimeLocalUtc(input.expiresAt) ??
      (Number.isNaN(Date.parse(input.expiresAt)) ? null : new Date(input.expiresAt).toISOString())
    if (!expiresAt) errors.push({ field: 'expires_at', message: 'Expiry is not a valid date.' })
    else if (Date.parse(expiresAt) <= now.getTime()) {
      errors.push({ field: 'expires_at', message: 'Expiry must be in the future.' })
    }
  }
  return {
    normalized: {
      slug: slug.ok ? slug.slug : input.slug,
      destinationUrl: destination.ok ? destination.url : input.destinationUrl,
      campaignName: campaignName || null,
      note: note || null,
      expiresAt,
      enabled: input.enabled,
    },
    errors,
  }
}

function revalidateBatch(
  input: { workspaceId: string; batchId: string; domainId: string },
  now = new Date(),
): void {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM import_rows WHERE batch_id = ? ORDER BY row_number')
    .all(input.batchId) as RowRow[]
  const seen = new Set<string>()
  let valid = 0
  let invalid = 0

  for (const row of rows) {
    if (row.status === 'excluded') {
      db.prepare(
        "UPDATE import_rows SET status = 'excluded', errors_json = '[]', suggested_slug = NULL, updated_at = ? WHERE id = ?",
      ).run(nowIso(), row.id)
      continue
    }
    const result = validateStoredRow(
      {
        slug: row.slug,
        destinationUrl: row.destination_url,
        campaignName: row.campaign_name,
        note: row.note,
        expiresAt: row.expires_at,
        enabled: row.enabled === 1,
      },
      now,
    )
    let status: ImportRowView['status'] = 'valid'
    let suggested: string | null = null
    const errors = [...result.errors]
    if (result.errors.length > 0 || !result.normalized.slug || !result.normalized.destinationUrl) {
      status = 'invalid'
    } else if (seen.has(result.normalized.slug)) {
      status = 'duplicate'
      const source = rows.find(
        (candidate) =>
          candidate.slug === result.normalized.slug && candidate.row_number < row.row_number,
      )
      suggested = findFreeSuggestion(result.normalized.slug, input.domainId, seen)
      errors.push({
        field: 'slug',
        message: `Duplicate of row ${source?.row_number ?? 'earlier in this file'}. Suggested slug: ${suggested ?? 'choose another'}.`,
      })
    } else if (slugExists(input.domainId, result.normalized.slug)) {
      status = 'duplicate'
      suggested = findFreeSuggestion(result.normalized.slug, input.domainId, seen)
      errors.push({
        field: 'slug',
        message: `This slug already exists. Suggested slug: ${suggested ?? 'choose another'}.`,
      })
    }

    if (status === 'valid') {
      seen.add(result.normalized.slug as string)
      valid += 1
    } else {
      invalid += 1
    }
    db.prepare(
      `UPDATE import_rows SET slug = ?, destination_url = ?, campaign_name = ?, note = ?, expires_at = ?, enabled = ?,
       status = ?, errors_json = ?, suggested_slug = ?, updated_at = ? WHERE id = ?`,
    ).run(
      result.normalized.slug,
      result.normalized.destinationUrl,
      result.normalized.campaignName,
      result.normalized.note,
      result.normalized.expiresAt,
      result.normalized.enabled ? 1 : 0,
      status,
      JSON.stringify(errors),
      suggested,
      nowIso(),
      row.id,
    )
  }

  db.prepare(
    "UPDATE import_batches SET valid_rows = ?, invalid_rows = ?, status = 'previewed', updated_at = ? WHERE id = ?",
  ).run(valid, invalid, nowIso(), input.batchId)
}

export function previewImport(input: {
  user: AuthUser
  batchId: string
  mapping: ImportMapping
  domainId?: string
}): ImportBatchView {
  const db = getDb()
  const batch = loadBatch(input.user.workspaceId, input.batchId)
  if (batch.status === 'completed' || batch.status === 'creating') {
    throw new ValidationError('This import has already been created.')
  }
  const headers = JSON.parse(batch.headers_json) as string[]
  const mapping = Object.fromEntries(
    IMPORT_FIELDS.map((field) => [
      field,
      typeof input.mapping[field] === 'string' ? input.mapping[field] : null,
    ]),
  ) as ImportMapping
  const mappingErrors = validateMapping(mapping, headers)
  if (mappingErrors.length) {
    throw new ValidationError(mappingErrors[0]!.message, { mapping: mappingErrors[0]!.message })
  }
  const domainId = input.domainId || batch.domain_id
  const domain = db
    .prepare("SELECT id FROM domains WHERE id = ? AND workspace_id = ? AND status = 'active'")
    .get(domainId, input.user.workspaceId) as { id: string } | undefined
  if (!domain) throw new ValidationError('Choose an active domain.')
  if (!batch.raw_csv)
    throw new ValidationError('The raw CSV for this import has expired. Start a new import.')

  const parsed = parseCsv(batch.raw_csv)
  const now = new Date()
  const insert = db.transaction(() => {
    db.prepare('DELETE FROM import_rows WHERE batch_id = ?').run(input.batchId)
    db.prepare(
      'UPDATE import_batches SET mapping_json = ?, domain_id = ?, total_rows = ?, updated_at = ? WHERE id = ?',
    ).run(JSON.stringify(mapping), domainId, parsed.rows.length, nowIso(), input.batchId)
    for (const row of parsed.rows) {
      const raw = Object.fromEntries(
        parsed.headers.map((header, index) => [header, row.values[index] ?? '']),
      ) as Record<string, string>
      const normalized = normalizeImportRow(raw, mapping, now)
      const errors = Object.entries(normalized.errors).map(([field, message]) => ({
        field,
        message,
      }))
      db.prepare(
        `INSERT INTO import_rows
         (id, batch_id, workspace_id, row_number, raw_json, slug, destination_url, campaign_name, note, expires_at, enabled,
          status, errors_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      ).run(
        newId('imr'),
        input.batchId,
        input.user.workspaceId,
        row.rowNumber,
        JSON.stringify(raw),
        normalized.slug,
        normalized.destinationUrl,
        normalized.campaignName,
        normalized.note,
        normalized.expiresAt,
        normalized.enabled ? 1 : 0,
        JSON.stringify(errors),
        nowIso(),
        nowIso(),
      )
    }
    revalidateBatch({ workspaceId: input.user.workspaceId, batchId: input.batchId, domainId }, now)
  })
  insert()
  logger.info('import previewed', {
    batchId: input.batchId,
    workspaceId: input.user.workspaceId,
    rows: parsed.rows.length,
  })
  return viewBatch(input.user.workspaceId, input.batchId)
}

export function updateImportRow(input: {
  user: AuthUser
  batchId: string
  rowId: string
  values: Partial<StoredRowInput>
}): ImportBatchView {
  const db = getDb()
  const batch = loadBatch(input.user.workspaceId, input.batchId)
  if (batch.status !== 'previewed')
    throw new ValidationError('Preview this import before editing rows.')
  const row = db
    .prepare('SELECT * FROM import_rows WHERE id = ? AND batch_id = ?')
    .get(input.rowId, input.batchId) as RowRow | undefined
  if (!row) throw new NotFoundError('Import row not found.')
  if (row.status === 'created') throw new ValidationError('This row has already been created.')
  db.prepare(
    `UPDATE import_rows SET slug = ?, destination_url = ?, campaign_name = ?, note = ?, expires_at = ?, enabled = ?, status = 'pending', updated_at = ? WHERE id = ?`,
  ).run(
    input.values.slug ?? row.slug,
    input.values.destinationUrl ?? row.destination_url,
    input.values.campaignName ?? row.campaign_name,
    input.values.note ?? row.note,
    input.values.expiresAt === undefined ? row.expires_at : input.values.expiresAt,
    (input.values.enabled ?? row.enabled === 1) ? 1 : 0,
    nowIso(),
    row.id,
  )
  const update = db.transaction(() => {
    revalidateBatch({
      workspaceId: input.user.workspaceId,
      batchId: input.batchId,
      domainId: batch.domain_id,
    })
  })
  update()
  return viewBatch(input.user.workspaceId, input.batchId)
}

export function setImportRowExcluded(input: {
  user: AuthUser
  batchId: string
  rowId: string
  excluded: boolean
}): ImportBatchView {
  const db = getDb()
  const batch = loadBatch(input.user.workspaceId, input.batchId)
  if (batch.status !== 'previewed')
    throw new ValidationError('Preview this import before editing rows.')
  db.prepare(
    "UPDATE import_rows SET status = ?, updated_at = ? WHERE id = ? AND batch_id = ? AND status != 'created'",
  ).run(input.excluded ? 'excluded' : 'pending', nowIso(), input.rowId, input.batchId)
  revalidateBatch({
    workspaceId: input.user.workspaceId,
    batchId: input.batchId,
    domainId: batch.domain_id,
  })
  return viewBatch(input.user.workspaceId, input.batchId)
}

export function applySuggestedSlugs(input: { user: AuthUser; batchId: string }): ImportBatchView {
  const db = getDb()
  const batch = loadBatch(input.user.workspaceId, input.batchId)
  if (batch.status !== 'previewed')
    throw new ValidationError('Preview this import before editing rows.')
  const rows = db
    .prepare(
      "SELECT id, suggested_slug FROM import_rows WHERE batch_id = ? AND status = 'duplicate' AND suggested_slug IS NOT NULL",
    )
    .all(input.batchId) as Array<{ id: string; suggested_slug: string }>
  const transaction = db.transaction(() => {
    for (const row of rows) {
      db.prepare(
        "UPDATE import_rows SET slug = ?, status = 'pending', updated_at = ? WHERE id = ?",
      ).run(row.suggested_slug, nowIso(), row.id)
    }
    revalidateBatch({
      workspaceId: input.user.workspaceId,
      batchId: input.batchId,
      domainId: batch.domain_id,
    })
  })
  transaction()
  return viewBatch(input.user.workspaceId, input.batchId)
}

export type CommitImportResult = {
  batchId: string
  links: Array<{ id: string; slug: string; shortUrl: string }>
  alreadyCompleted: boolean
}

export function commitImport(input: {
  user: AuthUser
  batchId: string
  commitToken: string
}): CommitImportResult {
  const db = getDb()
  const batch = loadBatch(input.user.workspaceId, input.batchId)
  if (batch.status === 'completed') {
    return {
      batchId: batch.id,
      links: viewBatch(input.user.workspaceId, batch.id).createdLinks,
      alreadyCompleted: true,
    }
  }
  if (batch.status !== 'previewed') {
    throw new ValidationError('Preview this import and resolve its rows before creating links.')
  }
  if (batch.commit_token !== input.commitToken) {
    throw new ConflictError('This import preview is stale. Reload and confirm again.')
  }

  const rows = db
    .prepare(
      "SELECT * FROM import_rows WHERE batch_id = ? AND status = 'valid' ORDER BY row_number",
    )
    .all(input.batchId) as RowRow[]
  if (rows.length === 0) throw new ValidationError('There are no valid rows to create.')
  const now = new Date()
  const timestamp = now.toISOString()
  const created: Array<{ id: string; slug: string; shortUrl: string }> = []

  const transaction = db.transaction(() => {
    const claimed = db
      .prepare(
        "UPDATE import_batches SET status = 'creating', updated_at = ? WHERE id = ? AND workspace_id = ? AND status = 'previewed' AND commit_token = ?",
      )
      .run(timestamp, input.batchId, input.user.workspaceId, input.commitToken)
    if (claimed.changes !== 1) {
      throw new ConflictError('This import was already confirmed elsewhere. Reload to view it.')
    }

    const seen = new Set<string>()
    for (const row of rows) {
      if (!row.slug || !row.destination_url)
        throw new ConflictError(`Row ${row.row_number} is incomplete.`)
      if (seen.has(row.slug) || slugExists(batch.domain_id, row.slug)) {
        throw new ConflictError(
          `Slug "${row.slug}" was claimed after preview. Review the import again before creating links.`,
        )
      }
      seen.add(row.slug)
      const linkId = newId('lnk')
      const campaignId = row.campaign_name
        ? getOrCreateCampaign(input.user.workspaceId, row.campaign_name, input.user.id)
        : null
      db.prepare(
        `INSERT INTO short_links
         (id, workspace_id, domain_id, campaign_id, import_batch_id, slug, destination_url, note, expires_at, expires_timezone,
          enabled, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UTC', ?, ?, ?, ?, ?)`,
      ).run(
        linkId,
        input.user.workspaceId,
        batch.domain_id,
        campaignId,
        input.batchId,
        row.slug,
        row.destination_url,
        row.note,
        row.expires_at,
        row.enabled,
        input.user.id,
        input.user.id,
        timestamp,
        timestamp,
      )
      db.prepare(
        `UPDATE import_rows SET status = 'created', created_link_id = ?, errors_json = '[]', updated_at = ? WHERE id = ?`,
      ).run(linkId, timestamp, row.id)
      db.prepare(
        `INSERT INTO audit_log (id, workspace_id, actor_user_id, action, entity_type, entity_id, details_json, created_at)
         VALUES (?, ?, ?, 'link.created', 'short_link', ?, ?, ?)`,
      ).run(
        newId('aud'),
        input.user.workspaceId,
        input.user.id,
        linkId,
        JSON.stringify({ slug: row.slug, importBatchId: input.batchId, rowNumber: row.row_number }),
        timestamp,
      )
      created.push({
        id: linkId,
        slug: row.slug,
        shortUrl: getPublicUrl(batch.domain_origin, row.slug),
      })
    }

    db.prepare(
      `UPDATE import_batches SET status = 'completed', valid_rows = ?, invalid_rows = 0, completed_at = ?, raw_expires_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      created.length,
      timestamp,
      new Date(Date.now() + getConfig().RAW_IMPORT_RETENTION_DAYS * 86_400_000).toISOString(),
      timestamp,
      input.batchId,
    )
    db.prepare(
      `INSERT INTO audit_log (id, workspace_id, actor_user_id, action, entity_type, entity_id, details_json, created_at)
       VALUES (?, ?, ?, 'import.completed', 'import_batch', ?, ?, ?)`,
    ).run(
      newId('aud'),
      input.user.workspaceId,
      input.user.id,
      input.batchId,
      JSON.stringify({ links: created.length }),
      timestamp,
    )
  })

  try {
    transaction()
  } catch (error) {
    if (error instanceof ConflictError || error instanceof ValidationError) {
      // A rollback returns the batch to previewed; keep it editable.
      throw error
    }
    logger.error('import commit failed', {
      batchId: input.batchId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
  logger.info('import completed', {
    batchId: input.batchId,
    workspaceId: input.user.workspaceId,
    links: created.length,
  })
  return { batchId: input.batchId, links: created, alreadyCompleted: false }
}
