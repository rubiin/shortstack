import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
  canArchiveLinks,
} from '~/domain/authz'
import type { AuthUser } from '~/domain/authz'
import { normalizeDestination } from '~/domain/destination'
import { generateSlug, normalizeSlug } from '~/domain/slug'
import { effectiveLinkState, enumerateDays, expiryWarning, type LinkState } from '~/domain/time'
import { parseDateTimeLocalUtc } from '~/domain/time'
import type {
  AuditEntry,
  CampaignOption,
  DomainOption,
  JsonValue,
  LinkDetail,
  LinkListItem,
  LinkListResult,
} from '~/domain/types'

import { getConfig } from './config'
import { getDb } from './db'
import { newId, nowIso } from './ids'
import { enqueueJob } from './jobs'
import { logger } from './log'

type LinkRow = {
  id: string
  workspace_id: string
  domain_id: string
  domain_hostname: string
  domain_origin: string
  campaign_id: string | null
  campaign_name: string | null
  slug: string
  destination_url: string
  note: string | null
  expires_at: string | null
  expires_timezone: string
  enabled: number
  archived_at: string | null
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
  clicks_7d: number
  clicks_30d?: number
  clicks_total?: number
}

function shortUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, '')}/${slug}`
}

function mapLink(row: LinkRow, now = new Date()): LinkListItem {
  return {
    id: row.id,
    slug: row.slug,
    shortUrl: shortUrl(row.domain_origin, row.slug),
    destinationUrl: row.destination_url,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    note: row.note,
    expiresAt: row.expires_at,
    expiresTimezone: row.expires_timezone,
    enabled: row.enabled === 1,
    archivedAt: row.archived_at,
    state: effectiveLinkState(
      { enabled: row.enabled === 1, expiresAt: row.expires_at, archivedAt: row.archived_at },
      now,
    ),
    clicks7d: Number(row.clicks_7d ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    domainHostname: row.domain_hostname,
  }
}

const linkSelect = `
  SELECT l.*, d.hostname AS domain_hostname, d.origin AS domain_origin,
         c.name AS campaign_name,
         (SELECT count(*) FROM click_events e WHERE e.link_id = l.id AND e.day >= @weekStart) AS clicks_7d
  FROM short_links l
  JOIN domains d ON d.id = l.domain_id
  LEFT JOIN campaigns c ON c.id = l.campaign_id
`

function stateWhere(state: LinkState | 'all'): string {
  switch (state) {
    case 'active':
      return 'l.archived_at IS NULL AND l.enabled = 1 AND (l.expires_at IS NULL OR l.expires_at > @now)'
    case 'disabled':
      return 'l.archived_at IS NULL AND l.enabled = 0'
    case 'expired':
      return 'l.archived_at IS NULL AND l.enabled = 1 AND l.expires_at IS NOT NULL AND l.expires_at <= @now'
    case 'archived':
      return 'l.archived_at IS NOT NULL'
    default:
      return 'l.archived_at IS NULL'
  }
}

export function listDomains(workspaceId: string): DomainOption[] {
  const rows = getDb()
    .prepare(
      'SELECT id, hostname, origin, is_default FROM domains WHERE workspace_id = ? AND status = ? ORDER BY is_default DESC, hostname ASC',
    )
    .all(workspaceId, 'active') as Array<{
    id: string
    hostname: string
    origin: string
    is_default: number
  }>
  return rows.map((row) => ({
    id: row.id,
    hostname: row.hostname,
    origin: row.origin,
    isDefault: row.is_default === 1,
  }))
}

export function listCampaigns(workspaceId: string): CampaignOption[] {
  return getDb()
    .prepare(
      "SELECT id, name FROM campaigns WHERE workspace_id = ? AND status = 'active' ORDER BY name COLLATE NOCASE",
    )
    .all(workspaceId) as CampaignOption[]
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

export function listLinks(input: {
  workspaceId: string
  search?: string
  campaignId?: string
  state?: string
  page?: number
}): LinkListResult {
  const db = getDb()
  const now = new Date()
  const nowIsoValue = now.toISOString()
  const weekStart = new Date(now)
  weekStart.setUTCDate(weekStart.getUTCDate() - 6)
  const weekStartDay = weekStart.toISOString().slice(0, 10)
  const pageSize = 20
  const page = Math.max(1, Number(input.page) || 1)
  const state = (
    ['active', 'disabled', 'expired', 'archived'].includes(input.state ?? '')
      ? input.state
      : 'active'
  ) as LinkState | 'all'
  const search = (input.search ?? '').trim().slice(0, 200)
  const campaignId = input.campaignId || null

  const clauses = ['l.workspace_id = @workspaceId', stateWhere(state)]
  const params: Record<string, unknown> = {
    workspaceId: input.workspaceId,
    now: nowIsoValue,
    weekStart: weekStartDay,
  }
  if (search) {
    clauses.push("(l.slug LIKE @search ESCAPE '\\' OR l.destination_url LIKE @search ESCAPE '\\')")
    params.search = `%${escapeLike(search.toLowerCase())}%`
  }
  if (campaignId) {
    clauses.push('l.campaign_id = @campaignId')
    params.campaignId = campaignId
  }
  const where = clauses.join(' AND ')

  const rows = db
    .prepare(`${linkSelect} WHERE ${where} ORDER BY l.updated_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as LinkRow[]
  const totalRow = db
    .prepare(`SELECT count(*) AS n FROM short_links l WHERE ${where}`)
    .get(params) as { n: number }

  const active = db
    .prepare(
      'SELECT count(*) AS n FROM short_links WHERE workspace_id = ? AND archived_at IS NULL AND enabled = 1 AND (expires_at IS NULL OR expires_at > ?)',
    )
    .get(input.workspaceId, nowIsoValue) as { n: number }
  const archived = db
    .prepare(
      'SELECT count(*) AS n FROM short_links WHERE workspace_id = ? AND archived_at IS NOT NULL',
    )
    .get(input.workspaceId) as { n: number }
  const clicks = db
    .prepare('SELECT count(*) AS n FROM click_events WHERE workspace_id = ? AND day >= ?')
    .get(input.workspaceId, weekStartDay) as { n: number }
  const expiring = db
    .prepare(
      `SELECT count(*) AS n FROM short_links
       WHERE workspace_id = ? AND archived_at IS NULL AND enabled = 1
       AND expires_at IS NOT NULL AND expires_at > ? AND expires_at <= ?`,
    )
    .get(
      input.workspaceId,
      nowIsoValue,
      new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    ) as { n: number }

  return {
    links: rows.map((row) => mapLink(row, now)),
    total: totalRow.n,
    page,
    pageSize,
    stats: {
      activeLinks: active.n,
      clicks7d: clicks.n,
      expiring7d: expiring.n,
      archivedLinks: archived.n,
    },
    domains: listDomains(input.workspaceId),
    campaigns: listCampaigns(input.workspaceId),
  }
}

export function getLinkDetail(input: {
  workspaceId: string
  linkId: string
  role: 'owner' | 'member'
}): LinkDetail {
  const db = getDb()
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setUTCDate(weekStart.getUTCDate() - 6)
  const row = db
    .prepare(
      `SELECT l.*, d.hostname AS domain_hostname, d.origin AS domain_origin,
              c.name AS campaign_name,
              (SELECT count(*) FROM click_events e WHERE e.link_id = l.id AND e.day >= @weekStart) AS clicks_7d,
              (SELECT count(*) FROM click_events e2 WHERE e2.link_id = l.id AND e2.day >= @monthStart) AS clicks_30d,
              (SELECT count(*) FROM click_events e3 WHERE e3.link_id = l.id) AS clicks_total
       FROM short_links l
       JOIN domains d ON d.id = l.domain_id
       LEFT JOIN campaigns c ON c.id = l.campaign_id
       WHERE l.id = @linkId AND l.workspace_id = @workspaceId`,
    )
    .get({
      linkId: input.linkId,
      workspaceId: input.workspaceId,
      weekStart: weekStart.toISOString().slice(0, 10),
      monthStart: new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10),
    }) as LinkRow | undefined
  if (!row) throw new NotFoundError('Link not found.')

  const auditRows = db
    .prepare(
      `SELECT a.id, a.action, a.created_at, a.details_json, u.name AS actor_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.workspace_id = ? AND a.entity_type = 'short_link' AND a.entity_id = ?
       ORDER BY a.created_at DESC LIMIT 30`,
    )
    .all(input.workspaceId, input.linkId) as Array<{
    id: string
    action: string
    created_at: string
    details_json: string
    actor_name: string | null
  }>

  const days = db
    .prepare(
      `SELECT day, count(*) AS clicks FROM click_events
       WHERE link_id = ? AND day >= ?
       GROUP BY day ORDER BY day ASC`,
    )
    .all(
      input.linkId,
      new Date(now.getTime() - 6 * 86_400_000).toISOString().slice(0, 10),
    ) as Array<{
    day: string
    clicks: number
  }>
  const clickByDay = new Map(days.map((day) => [day.day, Number(day.clicks)]))
  const lastDays = enumerateDays(
    new Date(now.getTime() - 6 * 86_400_000).toISOString().slice(0, 10),
    now.toISOString().slice(0, 10),
  ).map((day) => ({ day, clicks: clickByDay.get(day) ?? 0 }))

  const audit: AuditEntry[] = auditRows.map((entry) => ({
    id: entry.id,
    action: entry.action,
    actorName: entry.actor_name,
    createdAt: entry.created_at,
    details: JSON.parse(entry.details_json) as Record<string, JsonValue>,
  }))

  return {
    ...mapLink(row, now),
    workspaceId: row.workspace_id,
    domainId: row.domain_id,
    clicks30d: Number(row.clicks_30d ?? 0),
    clicksTotal: Number(row.clicks_total ?? 0),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    lastDays,
    audit,
    canArchive: canArchiveLinks({ role: input.role }),
  }
}

export const ANONYMOUS_USER_ID = 'usr_anonymous'

/**
 * Links created from the public homepage have no session, but short_links
 * requires a real author. Resolve the workspace behind the domain and make
 * sure the shared anonymous author row exists before inserting.
 */
export function anonymousAuthor(domainId: string): AuthUser {
  const db = getDb()
  const domain = db.prepare('SELECT workspace_id FROM domains WHERE id = ?').get(domainId) as
    | { workspace_id: string }
    | undefined
  const workspaceId = domain?.workspace_id ?? 'ws_northstar'
  const existing = db.prepare('SELECT 1 AS hit FROM users WHERE id = ?').get(ANONYMOUS_USER_ID) as
    | { hit: number }
    | undefined
  if (!existing) {
    const timestamp = nowIso()
    // OR IGNORE covers the race where two visitors shorten a link at once.
    db.prepare(
      `INSERT OR IGNORE INTO users (id, workspace_id, email, name, role, password_hash, disabled_at, created_at)
       VALUES (?, ?, ?, ?, 'member', '', ?, ?)`,
    ).run(
      ANONYMOUS_USER_ID,
      workspaceId,
      'anonymous@shortstack.invalid',
      'Anonymous',
      timestamp,
      timestamp,
    )
  }
  return {
    id: ANONYMOUS_USER_ID,
    workspaceId,
    role: 'member',
    name: 'Anonymous',
    email: '',
  }
}

export function createLink(input: {
  user: AuthUser
  domainId: string
  slug: string
  generateSlug?: boolean
  destinationUrl: string
  campaignId?: string | null
  note?: string | null
  expiresAtLocal?: string | null
  enabled?: boolean
  importBatchId?: string | null
}): LinkDetail {
  const db = getDb()
  const now = new Date()
  const destination = normalizeDestination(input.destinationUrl)
  if (!destination.ok)
    throw new ValidationError(destination.error, { destinationUrl: destination.error })

  const note = (input.note ?? '').trim()
  if (note.length > 500)
    throw new ValidationError('Notes can be at most 500 characters.', { note: 'Too long.' })
  const expiry = input.expiresAtLocal ? parseDateTimeLocalUtc(input.expiresAtLocal) : null
  if (input.expiresAtLocal && !expiry) {
    throw new ValidationError('Enter a valid expiry date.', {
      expiresAt: 'Enter a valid UTC date and time.',
    })
  }
  if (expiry && Date.parse(expiry) <= now.getTime()) {
    throw new ValidationError('Expiry must be in the future.', {
      expiresAt: 'Choose a future date.',
    })
  }

  const domain = db
    .prepare("SELECT id FROM domains WHERE id = ? AND workspace_id = ? AND status = 'active'")
    .get(input.domainId, input.user.workspaceId) as { id: string } | undefined
  if (!domain)
    throw new ValidationError('Choose an active domain.', { domainId: 'Domain is unavailable.' })

  if (input.campaignId) {
    const campaign = db
      .prepare('SELECT id FROM campaigns WHERE id = ? AND workspace_id = ?')
      .get(input.campaignId, input.user.workspaceId) as { id: string } | undefined
    if (!campaign)
      throw new ValidationError('Choose a campaign in this workspace.', {
        campaignId: 'Campaign unavailable.',
      })
  }

  let normalizedSlug: string | null = null
  if (!input.generateSlug) {
    const result = normalizeSlug(input.slug)
    if (!result.ok) throw new ValidationError(result.error, { slug: result.error })
    normalizedSlug = result.slug
  }

  const timestamp = nowIso()
  const id = newId('lnk')
  const create = db.transaction(() => {
    let finalSlug = normalizedSlug
    if (!finalSlug) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const candidate = generateSlug()
        const collision = db
          .prepare('SELECT 1 FROM short_links WHERE domain_id = ? AND slug = ?')
          .get(input.domainId, candidate)
        if (!collision) {
          finalSlug = candidate
          break
        }
      }
      if (!finalSlug) throw new ConflictError('Could not generate a free slug. Try again.')
    } else {
      const collision = db
        .prepare('SELECT 1 FROM short_links WHERE domain_id = ? AND slug = ?')
        .get(input.domainId, finalSlug)
      if (collision) {
        throw new ValidationError('That slug is already in use on this domain.', {
          slug: 'That slug is already in use on this domain.',
        })
      }
    }

    db.prepare(
      `INSERT INTO short_links
       (id, workspace_id, domain_id, campaign_id, import_batch_id, slug, destination_url, note, expires_at, expires_timezone,
        enabled, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UTC', ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.user.workspaceId,
      input.domainId,
      input.campaignId || null,
      input.importBatchId ?? null,
      finalSlug,
      destination.url,
      note || null,
      expiry,
      input.enabled === false ? 0 : 1,
      input.user.id,
      input.user.id,
      timestamp,
      timestamp,
    )
    db.prepare(
      `INSERT INTO audit_log (id, workspace_id, actor_user_id, action, entity_type, entity_id, details_json, created_at)
       VALUES (?, ?, ?, 'link.created', 'short_link', ?, ?, ?)`,
    ).run(
      newId('aud'),
      input.user.workspaceId,
      input.user.id,
      id,
      JSON.stringify({
        slug: finalSlug,
        destinationUrl: destination.url,
        campaignId: input.campaignId ?? null,
      }),
      timestamp,
    )
    return finalSlug
  })

  let finalSlug: string
  try {
    finalSlug = create()
  } catch (error) {
    if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new ValidationError('That slug is already in use on this domain.', {
        slug: 'That slug is already in use on this domain.',
      })
    }
    throw error
  }

  const detail = getLinkDetail({
    workspaceId: input.user.workspaceId,
    linkId: id,
    role: input.user.role,
  })
  schedulePurge([detail.shortUrl], `${id}:${timestamp}`)
  logger.info('link created', {
    linkId: id,
    workspaceId: input.user.workspaceId,
    slug: finalSlug,
    importBatchId: input.importBatchId ?? null,
  })
  return detail
}

export function updateLink(input: {
  user: AuthUser
  linkId: string
  domainId: string
  slug: string
  destinationUrl: string
  campaignId?: string | null
  note?: string | null
  expiresAtLocal?: string | null
  enabled?: boolean
  expectedUpdatedAt?: string
}): LinkDetail {
  const db = getDb()
  const current = db
    .prepare('SELECT * FROM short_links WHERE id = ? AND workspace_id = ?')
    .get(input.linkId, input.user.workspaceId) as
    | {
        id: string
        domain_id: string
        campaign_id: string | null
        slug: string
        destination_url: string
        note: string | null
        expires_at: string | null
        enabled: number
        archived_at: string | null
        updated_at: string
      }
    | undefined
  if (!current) throw new NotFoundError('Link not found.')
  if (current.archived_at) throw new ValidationError('Restore this link before editing it.')
  if (input.expectedUpdatedAt && input.expectedUpdatedAt !== current.updated_at) {
    throw new ConflictError(
      'This link changed in another tab. Reload to review the latest version.',
    )
  }
  const destination = normalizeDestination(input.destinationUrl)
  if (!destination.ok)
    throw new ValidationError(destination.error, { destinationUrl: destination.error })
  const slug = normalizeSlug(input.slug)
  if (!slug.ok) throw new ValidationError(slug.error, { slug: slug.error })
  const note = (input.note ?? '').trim()
  if (note.length > 500)
    throw new ValidationError('Notes can be at most 500 characters.', { note: 'Too long.' })
  const expiry = input.expiresAtLocal ? parseDateTimeLocalUtc(input.expiresAtLocal) : null
  if (input.expiresAtLocal && !expiry) {
    throw new ValidationError('Enter a valid expiry date.', {
      expiresAt: 'Enter a valid UTC date and time.',
    })
  }
  if (expiry && Date.parse(expiry) <= Date.now()) {
    throw new ValidationError('Expiry must be in the future.', {
      expiresAt: 'Choose a future date.',
    })
  }
  const domain = db
    .prepare(
      "SELECT id, origin FROM domains WHERE id = ? AND workspace_id = ? AND status = 'active'",
    )
    .get(input.domainId, input.user.workspaceId) as { id: string; origin: string } | undefined
  if (!domain)
    throw new ValidationError('Choose an active domain.', { domainId: 'Domain is unavailable.' })
  if (input.campaignId) {
    const campaign = db
      .prepare('SELECT id FROM campaigns WHERE id = ? AND workspace_id = ?')
      .get(input.campaignId, input.user.workspaceId) as { id: string } | undefined
    if (!campaign)
      throw new ValidationError('Choose a campaign in this workspace.', {
        campaignId: 'Campaign unavailable.',
      })
  }

  const timestamp = nowIso()
  const oldOrigin = db
    .prepare('SELECT origin FROM domains WHERE id = ?')
    .get(current.domain_id) as { origin: string }
  const changed = {
    slug: current.slug !== slug.slug,
    destinationUrl: current.destination_url !== destination.url,
    campaignId: (current.campaign_id ?? null) !== (input.campaignId ?? null),
    note: (current.note ?? null) !== (note || null),
    expiresAt: (current.expires_at ?? null) !== (expiry ?? null),
    enabled: (current.enabled === 1) !== (input.enabled !== false),
    domain: current.domain_id !== domain.id,
  }
  if (!Object.values(changed).some(Boolean)) {
    return getLinkDetail({
      workspaceId: input.user.workspaceId,
      linkId: input.linkId,
      role: input.user.role,
    })
  }

  const update = db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE short_links SET domain_id = ?, slug = ?, destination_url = ?, campaign_id = ?, note = ?, expires_at = ?, enabled = ?, updated_by = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ? AND updated_at = ?`,
      )
      .run(
        domain.id,
        slug.slug,
        destination.url,
        input.campaignId || null,
        note || null,
        expiry,
        input.enabled === false ? 0 : 1,
        input.user.id,
        timestamp,
        input.linkId,
        input.user.workspaceId,
        current.updated_at,
      )
    if (result.changes !== 1) {
      throw new ConflictError(
        'This link changed in another tab. Reload to review the latest version.',
      )
    }
    db.prepare(
      `INSERT INTO audit_log (id, workspace_id, actor_user_id, action, entity_type, entity_id, details_json, created_at)
       VALUES (?, ?, ?, 'link.updated', 'short_link', ?, ?, ?)`,
    ).run(
      newId('aud'),
      input.user.workspaceId,
      input.user.id,
      input.linkId,
      JSON.stringify({ changed }),
      timestamp,
    )
  })
  try {
    update()
  } catch (error) {
    if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new ValidationError('That slug is already in use on this domain.', {
        slug: 'That slug is already in use on this domain.',
      })
    }
    throw error
  }

  const detail = getLinkDetail({
    workspaceId: input.user.workspaceId,
    linkId: input.linkId,
    role: input.user.role,
  })
  const urls = new Set<string>([detail.shortUrl])
  if (current.slug !== slug.slug || current.domain_id !== domain.id)
    urls.add(shortUrl(oldOrigin.origin, current.slug))
  schedulePurge([...urls], `${input.linkId}:${timestamp}`)
  logger.info('link updated', {
    linkId: input.linkId,
    workspaceId: input.user.workspaceId,
    changed,
  })
  return detail
}

export function setArchived(input: {
  user: AuthUser
  linkId: string
  archived: boolean
}): LinkDetail {
  if (!canArchiveLinks(input.user)) {
    throw new AuthorizationError('Only workspace owners can archive or restore links.')
  }
  const db = getDb()
  const current = db
    .prepare(
      'SELECT id, archived_at, domain_id, slug FROM short_links WHERE id = ? AND workspace_id = ?',
    )
    .get(input.linkId, input.user.workspaceId) as
    | { id: string; archived_at: string | null; domain_id: string; slug: string }
    | undefined
  if (!current) throw new NotFoundError('Link not found.')
  if (input.archived && current.archived_at) {
    return getLinkDetail({
      workspaceId: input.user.workspaceId,
      linkId: input.linkId,
      role: input.user.role,
    })
  }
  if (!input.archived && !current.archived_at) {
    return getLinkDetail({
      workspaceId: input.user.workspaceId,
      linkId: input.linkId,
      role: input.user.role,
    })
  }

  const timestamp = nowIso()
  const archive = db.transaction(() => {
    db.prepare(
      'UPDATE short_links SET archived_at = ?, archived_by = ?, updated_by = ?, updated_at = ? WHERE id = ? AND workspace_id = ?',
    ).run(
      input.archived ? timestamp : null,
      input.archived ? input.user.id : null,
      input.user.id,
      timestamp,
      input.linkId,
      input.user.workspaceId,
    )
    db.prepare(
      `INSERT INTO audit_log (id, workspace_id, actor_user_id, action, entity_type, entity_id, details_json, created_at)
       VALUES (?, ?, ?, ?, 'short_link', ?, ?, ?)`,
    ).run(
      newId('aud'),
      input.user.workspaceId,
      input.user.id,
      input.archived ? 'link.archived' : 'link.restored',
      input.linkId,
      JSON.stringify({}),
      timestamp,
    )
  })
  archive()
  const detail = getLinkDetail({
    workspaceId: input.user.workspaceId,
    linkId: input.linkId,
    role: input.user.role,
  })
  schedulePurge([detail.shortUrl], `${input.linkId}:${timestamp}`)
  logger.info(input.archived ? 'link archived' : 'link restored', {
    linkId: input.linkId,
    workspaceId: input.user.workspaceId,
  })
  return detail
}

export function checkSlugAvailability(input: {
  workspaceId: string
  domainId: string
  slug: string
}): {
  normalized: string | null
  available: boolean
  error?: string
} {
  const db = getDb()
  const result = normalizeSlug(input.slug)
  if (!result.ok) return { normalized: null, available: false, error: result.error }
  const domain = db
    .prepare('SELECT id FROM domains WHERE id = ? AND workspace_id = ?')
    .get(input.domainId, input.workspaceId) as { id: string } | undefined
  if (!domain) return { normalized: result.slug, available: false, error: 'Choose a valid domain.' }
  const collision = db
    .prepare('SELECT 1 FROM short_links WHERE domain_id = ? AND slug = ?')
    .get(input.domainId, result.slug)
  return {
    normalized: result.slug,
    available: !collision,
    ...(collision ? { error: 'That slug is already in use on this domain.' } : {}),
  }
}

export function schedulePurge(urls: string[], version: string): void {
  try {
    const config = getConfig()
    if (!config.CLOUDFLARE_PURGE_ENABLED) return
    enqueueJob({
      kind: 'cache.purge',
      payload: { urls: urls.slice(0, 30) },
      idempotencyKey: `cache-purge:${version}`,
      maxAttempts: 5,
    })
  } catch (error) {
    logger.error('could not enqueue cache purge', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function getPublicUrl(origin: string, slug: string): string {
  return shortUrl(origin, slug)
}

export function expiringState(link: LinkListItem, now = new Date()): boolean {
  return expiryWarning(
    { enabled: link.enabled, expiresAt: link.expiresAt, archivedAt: link.archivedAt },
    now,
  )
}
