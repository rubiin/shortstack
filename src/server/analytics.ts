import { getDb } from './db'
import { getConfig } from './config'
import { newId, nowIso } from './ids'
import { enqueueJob } from './jobs'
import { logger } from './log'
import { getStorage } from './adapters/storage'
import { countryName, deviceLabel, percentage } from '~/domain/privacy'
import { enumerateDays, resolveDateRange } from '~/domain/time'
import { toCsv } from '~/domain/csv'
import type { AnalyticsData, BreakdownItem, CampaignOption, ExportSummary, TrendPoint } from '~/domain/types'
import { NotFoundError } from '~/domain/authz'

type AnalyticsQuery = {
  workspaceId: string
  from: string
  to: string
  campaignId?: string | null
}

function filterClause(input: AnalyticsQuery): { where: string; params: Record<string, unknown> } {
  const clauses = ['e.workspace_id = @workspaceId', 'e.day >= @from', 'e.day <= @to']
  const params: Record<string, unknown> = {
    workspaceId: input.workspaceId,
    from: input.from,
    to: input.to,
  }
  if (input.campaignId) {
    clauses.push('l.campaign_id = @campaignId')
    params.campaignId = input.campaignId
  }
  return { where: clauses.join(' AND '), params }
}

function clickTotal(input: AnalyticsQuery): number {
  const { where, params } = filterClause(input)
  const row = getDb()
    .prepare(
      `SELECT count(*) AS n FROM click_events e JOIN short_links l ON l.id = e.link_id WHERE ${where}`,
    )
    .get(params) as { n: number }
  return Number(row.n)
}

function breakdown(
  input: AnalyticsQuery,
  expression: string,
  labeler: (key: string) => string,
  total: number,
): BreakdownItem[] {
  const { where, params } = filterClause(input)
  const rows = getDb()
    .prepare(
      `SELECT ${expression} AS key, count(*) AS clicks
       FROM click_events e JOIN short_links l ON l.id = e.link_id
       WHERE ${where}
       GROUP BY key ORDER BY clicks DESC LIMIT 8`,
    )
    .all(params) as Array<{ key: string; clicks: number }>
  return rows.map((row) => ({
    key: row.key,
    label: labeler(row.key),
    clicks: Number(row.clicks),
    share: percentage(Number(row.clicks), total),
  }))
}

export function analyticsFor(input: {
  workspaceId: string
  from?: string
  to?: string
  days?: string | number
  compare?: boolean
  campaignId?: string | null
}): AnalyticsData {
  const db = getDb()
  const range = resolveDateRange({ from: input.from, to: input.to, days: input.days })
  const campaignId = input.campaignId || null
  let campaignName: string | null = null
  if (campaignId) {
    const campaign = db
      .prepare('SELECT name FROM campaigns WHERE id = ? AND workspace_id = ?')
      .get(campaignId, input.workspaceId) as { name: string } | undefined
    if (!campaign) {
      // Guessed campaign IDs do not reveal whether they exist.
      throw new NotFoundError('Campaign not found.')
    }
    campaignName = campaign.name
  }

  const current: AnalyticsQuery = { workspaceId: input.workspaceId, from: range.from, to: range.to, campaignId }
  const previous: AnalyticsQuery = {
    workspaceId: input.workspaceId,
    from: range.previousFrom,
    to: range.previousTo,
    campaignId,
  }
  const totalClicks = clickTotal(current)
  const previousClicks = clickTotal(previous)

  const currentWhere = filterClause(current)
  const dailyRows = db
    .prepare(
      `SELECT e.day AS day, count(*) AS clicks FROM click_events e JOIN short_links l ON l.id = e.link_id
       WHERE ${currentWhere.where} GROUP BY e.day ORDER BY e.day`,
    )
    .all(currentWhere.params) as Array<{ day: string; clicks: number }>
  const previousWhere = filterClause(previous)
  const previousRows = db
    .prepare(
      `SELECT e.day AS day, count(*) AS clicks FROM click_events e JOIN short_links l ON l.id = e.link_id
       WHERE ${previousWhere.where} GROUP BY e.day ORDER BY e.day`,
    )
    .all(previousWhere.params) as Array<{ day: string; clicks: number }>
  const currentByDay = new Map(dailyRows.map((row) => [row.day, Number(row.clicks)]))
  const previousByDay = new Map(previousRows.map((row) => [row.day, Number(row.clicks)]))
  const previousDays = enumerateDays(range.previousFrom, range.previousTo)
  const previousIndex = new Map(previousDays.map((day, index) => [day, index]))
  const trend: TrendPoint[] = enumerateDays(range.from, range.to).map((day) => {
    const previousDay = previousDays[previousIndex.get(day) ?? -1]
    return {
      day,
      current: currentByDay.get(day) ?? 0,
      previous: previousDay ? previousByDay.get(previousDay) ?? 0 : 0,
    }
  })

  const referrers = breakdown(current, 'e.referrer_domain', (key) => key, totalClicks)
  const countries = breakdown(current, 'e.country_code', countryName, totalClicks)
  const devices = breakdown(current, 'e.device_class', deviceLabel, totalClicks)

  const campaignRows = db
    .prepare(
      `SELECT COALESCE(c.name, 'No campaign') AS key, count(*) AS clicks
       FROM click_events e JOIN short_links l ON l.id = e.link_id
       LEFT JOIN campaigns c ON c.id = l.campaign_id
       WHERE ${currentWhere.where}
       GROUP BY COALESCE(c.name, 'No campaign') ORDER BY clicks DESC LIMIT 8`,
    )
    .all(currentWhere.params) as Array<{ key: string; clicks: number }>
  const campaigns: BreakdownItem[] = campaignRows.map((row) => ({
    key: row.key,
    label: row.key,
    clicks: Number(row.clicks),
    share: percentage(Number(row.clicks), totalClicks),
  }))

  const topLinks = (
    db
      .prepare(
        `SELECT l.id, l.slug, c.name AS campaign_name, count(*) AS clicks
         FROM click_events e JOIN short_links l ON l.id = e.link_id
         LEFT JOIN campaigns c ON c.id = l.campaign_id
         WHERE ${currentWhere.where}
         GROUP BY l.id ORDER BY clicks DESC LIMIT 5`,
      )
      .all(currentWhere.params) as Array<{ id: string; slug: string; campaign_name: string | null; clicks: number }>
  ).map((row) => ({
    id: row.id,
    slug: row.slug,
    campaignName: row.campaign_name,
    clicks: Number(row.clicks),
  }))

  const mobile = devices.find((item) => item.key === 'mobile')?.clicks ?? 0
  const exportList = listExports(input.workspaceId)
  const campaignsAvailable = db
    .prepare("SELECT id, name FROM campaigns WHERE workspace_id = ? AND status = 'active' ORDER BY name COLLATE NOCASE")
    .all(input.workspaceId) as CampaignOption[]

  const hasAnyClicks =
    (
      db
        .prepare('SELECT 1 FROM click_events WHERE workspace_id = ? LIMIT 1')
        .get(input.workspaceId) as { 1: number } | undefined
    ) !== undefined

  return {
    filters: {
      from: range.from,
      to: range.to,
      days: range.days,
      compare: input.compare ?? true,
      campaignId: campaignName ? campaignId : null,
    },
    range,
    totalClicks,
    previousClicks,
    deltaPercent:
      previousClicks === 0 ? (totalClicks === 0 ? 0 : null) : Math.round(((totalClicks - previousClicks) / previousClicks) * 100),
    topReferrer: referrers[0] ?? null,
    topCountry: countries[0] ?? null,
    mobileShare: percentage(mobile, totalClicks),
    trend,
    referrers,
    countries,
    devices,
    campaigns,
    topLinks,
    exportList,
    campaignsAvailable,
    hasAnyClicks,
  }
}

export type CreateExportInput = {
  workspaceId: string
  userId: string
  from: string
  to: string
  campaignId: string | null
}

export function createAnalyticsExport(input: CreateExportInput): { id: string } {
  const db = getDb()
  const id = newId('exp')
  const timestamp = nowIso()
  const filters = { from: input.from, to: input.to, campaignId: input.campaignId }
  const create = db.transaction(() => {
    db.prepare(
      `INSERT INTO exports (id, workspace_id, requested_by, status, filters_json, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
    ).run(id, input.workspaceId, input.userId, JSON.stringify(filters), timestamp, timestamp)
    enqueueJob({
      kind: 'export.generate',
      workspaceId: input.workspaceId,
      payload: { exportId: id },
      idempotencyKey: `export:${id}`,
      maxAttempts: 5,
    })
  })
  create()
  logger.info('analytics export queued', { exportId: id, workspaceId: input.workspaceId })
  return { id }
}

export function listExports(workspaceId: string): ExportSummary[] {
  const storage = getStorage()
  const rows = getDb()
    .prepare(
      `SELECT e.*, u.name AS requested_by_name FROM exports e JOIN users u ON u.id = e.requested_by
       WHERE e.workspace_id = ? ORDER BY e.created_at DESC LIMIT 5`,
    )
    .all(workspaceId) as Array<{
    id: string
    status: ExportSummary['status']
    row_count: number | null
    attempts: number
    last_error: string | null
    created_at: string
    expires_at: string | null
    file_key: string | null
    requested_by_name: string
  }>
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    rowCount: row.row_count,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    downloadUrl:
      row.status === 'ready' && row.file_key && row.expires_at && Date.parse(row.expires_at) > Date.now()
        ? storage.signedUrl(row.file_key, 300)
        : null,
    requestedByName: row.requested_by_name,
  }))
}

export function getExportStatus(input: { workspaceId: string; exportId: string }): ExportSummary | null {
  const storage = getStorage()
  const row = getDb()
    .prepare(
      `SELECT e.id, e.status, e.row_count, e.attempts, e.last_error, e.created_at, e.expires_at, e.file_key,
              u.name AS requested_by_name
       FROM exports e JOIN users u ON u.id = e.requested_by
       WHERE e.id = ? AND e.workspace_id = ?`,
    )
    .get(input.exportId, input.workspaceId) as
    | {
        id: string
        status: ExportSummary['status']
        row_count: number | null
        attempts: number
        last_error: string | null
        created_at: string
        expires_at: string | null
        file_key: string | null
        requested_by_name: string
      }
    | undefined
  if (!row) return null
  return {
    id: row.id,
    status: row.status,
    rowCount: row.row_count,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    downloadUrl:
      row.status === 'ready' && row.file_key && row.expires_at && Date.parse(row.expires_at) > Date.now()
        ? storage.signedUrl(row.file_key, 300)
        : null,
    requestedByName: row.requested_by_name,
  }
}

export function exportFiltersFor(exportId: string): {
  export: {
    id: string
    workspaceId: string
    status: string
    filtersJson: string
    fileKey: string | null
    expiresAt: string | null
  }
} {
  const row = getDb()
    .prepare('SELECT id, workspace_id, status, filters_json, file_key, expires_at FROM exports WHERE id = ?')
    .get(exportId) as
    | {
        id: string
        workspace_id: string
        status: string
        filters_json: string
        file_key: string | null
        expires_at: string | null
      }
    | undefined
  if (!row) throw new NotFoundError('Export not found.')
  return {
    export: {
      id: row.id,
      workspaceId: row.workspace_id,
      status: row.status,
      filtersJson: row.filters_json,
      fileKey: row.file_key,
      expiresAt: row.expires_at,
    },
  }
}

export async function produceExportFile(exportId: string): Promise<{ rows: number; key: string; fileName: string }> {
  const db = getDb()
  const info = exportFiltersFor(exportId).export
  const filters = JSON.parse(info.filtersJson) as { from: string; to: string; campaignId: string | null }
  const where = filterClause({
    workspaceId: info.workspaceId,
    from: filters.from,
    to: filters.to,
    campaignId: filters.campaignId,
  })
  const rows = db
    .prepare(
      `SELECT l.slug, d.hostname AS domain_hostname, COALESCE(c.name, '') AS campaign_name,
              e.day, e.country_code, e.referrer_domain, e.device_class, count(*) AS clicks
       FROM click_events e
       JOIN short_links l ON l.id = e.link_id
       JOIN domains d ON d.id = l.domain_id
       LEFT JOIN campaigns c ON c.id = l.campaign_id
       WHERE ${where.where}
       GROUP BY l.id, e.day, e.country_code, e.referrer_domain, e.device_class
       ORDER BY e.day ASC, l.slug ASC
       LIMIT 100000`,
    )
    .all(where.params) as Array<{
    slug: string
    domain_hostname: string
    campaign_name: string
    day: string
    country_code: string
    referrer_domain: string
    device_class: string
    clicks: number
  }>
  const csv = toCsv(
    ['link_slug', 'domain', 'campaign', 'day', 'country_code', 'referrer_domain', 'device_class', 'clicks'],
    rows.map((row) => [
      row.slug,
      row.domain_hostname,
      row.campaign_name,
      row.day,
      row.country_code,
      row.referrer_domain,
      row.device_class,
      row.clicks,
    ]),
  )
  const config = getConfig()
  const key = `exports/${info.workspaceId}/${info.id}.csv`
  const fileName = `shortstack-analytics_${filters.from}_to_${filters.to}.csv`
  await getStorage().put(key, new TextEncoder().encode(csv), 'text/csv; charset=utf-8')
  return { rows: rows.length, key, fileName }
}
