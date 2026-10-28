import { describe, expect, it } from 'vitest'
import { analyticsFor, createAnalyticsExport, getExportStatus, listExports } from '../../src/server/analytics'
import { getDb } from '../../src/server/db'
import { runWorker } from '../../src/server/worker'
import { getStorage } from '../../src/server/adapters/storage'
import { NotFoundError } from '../../src/domain/authz'
import { seedWorkspace } from '../helpers'

function insertClick(input: {
  id: string
  workspaceId: string
  linkId: string
  day: string
  country?: string
  referrer?: string
  device?: string
}): void {
  getDb()
    .prepare(
      `INSERT INTO click_events (id, workspace_id, link_id, day, country_code, referrer_domain, device_class)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.workspaceId,
      input.linkId,
      input.day,
      input.country ?? 'US',
      input.referrer ?? 'direct',
      input.device ?? 'desktop',
    )
}

function fixtureWithClicks() {
  const fixture = seedWorkspace()
  const db = getDb()
  const timestamp = new Date().toISOString()
  db.prepare(
    'INSERT INTO campaigns (id, workspace_id, name, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('cmp_second', fixture.workspaceId, 'Second Campaign', 'active', fixture.userId, timestamp)
  for (const [id, slug, campaignId] of [
    ['lnk_one', 'one', fixture.campaignId],
    ['lnk_two', 'two', 'cmp_second'],
  ] as const) {
    db.prepare(
      `INSERT INTO short_links
       (id, workspace_id, domain_id, campaign_id, slug, destination_url, expires_timezone, enabled,
        created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'UTC', 1, ?, ?, ?, ?)`,
    ).run(
      id,
      fixture.workspaceId,
      fixture.domainId,
      campaignId,
      slug,
      `https://example.com/${slug}`,
      fixture.userId,
      fixture.userId,
      timestamp,
      timestamp,
    )
  }
  insertClick({ id: 'c1', workspaceId: fixture.workspaceId, linkId: 'lnk_one', day: '2026-10-26', referrer: 'linkedin.com', device: 'mobile' })
  insertClick({ id: 'c2', workspaceId: fixture.workspaceId, linkId: 'lnk_one', day: '2026-10-26', referrer: 'linkedin.com', device: 'mobile' })
  insertClick({ id: 'c3', workspaceId: fixture.workspaceId, linkId: 'lnk_one', day: '2026-10-25', country: 'DE' })
  insertClick({ id: 'c4', workspaceId: fixture.workspaceId, linkId: 'lnk_two', day: '2026-10-24', referrer: 'google.com' })
  insertClick({ id: 'old', workspaceId: fixture.workspaceId, linkId: 'lnk_two', day: '2026-10-10' })
  return fixture
}

describe('analytics', () => {
  it('aggregates only the requested workspace and window', () => {
    const fixture = fixtureWithClicks()
    const other = seedWorkspace({
      workspaceId: 'ws_other',
      userId: 'usr_other',
      domainId: 'dom_other',
      campaignId: 'cmp_other',
      hostname: 'other.test',
    })
    const otherLink = 'lnk_other'
    getDb()
      .prepare(
        `INSERT INTO short_links
         (id, workspace_id, domain_id, slug, destination_url, expires_timezone, enabled, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, 'other', 'https://example.com/other', 'UTC', 1, ?, ?, ?, ?)`,
      )
      .run(otherLink, other.workspaceId, other.domainId, other.userId, other.userId, new Date().toISOString(), new Date().toISOString())
    insertClick({ id: 'foreign', workspaceId: other.workspaceId, linkId: otherLink, day: '2026-10-26' })

    const data = analyticsFor({
      workspaceId: fixture.workspaceId,
      from: '2026-10-20',
      to: '2026-10-26',
    })
    expect(data.totalClicks).toBe(4)
    expect(data.previousClicks).toBe(0)
    expect(data.deltaPercent).toBeNull()
    expect(data.topReferrer).toMatchObject({ key: 'linkedin.com', clicks: 2, share: 50 })
    expect(data.topCountry).toMatchObject({ key: 'US', label: 'United States', clicks: 3, share: 75 })
    expect(data.mobileShare).toBe(50)
    expect(data.trend).toHaveLength(7)
    expect(data.trend.find((point) => point.day === '2026-10-26')).toMatchObject({ current: 2, previous: 0 })
    expect(data.topLinks[0]).toMatchObject({ id: 'lnk_one', clicks: 3 })
    expect(data.hasAnyClicks).toBe(true)

    const filtered = analyticsFor({
      workspaceId: fixture.workspaceId,
      from: '2026-10-20',
      to: '2026-10-26',
      campaignId: fixture.campaignId,
    })
    expect(filtered.totalClicks).toBe(3)
    expect(filtered.filters.campaignId).toBe(fixture.campaignId)
    expect(filtered.topLinks).toHaveLength(1)

    expect(() =>
      analyticsFor({ workspaceId: fixture.workspaceId, from: '2026-10-20', to: '2026-10-26', campaignId: 'cmp_missing' }),
    ).toThrow(NotFoundError)
  })

  it('returns an empty analytics shape without click data', () => {
    const fixture = seedWorkspace()
    const data = analyticsFor({ workspaceId: fixture.workspaceId, from: '2026-10-20', to: '2026-10-26' })
    expect(data.totalClicks).toBe(0)
    expect(data.trend.every((point) => point.current === 0)).toBe(true)
    expect(data.topReferrer).toBeNull()
    expect(data.topCountry).toBeNull()
    expect(data.hasAnyClicks).toBe(false)
  })
})

describe('analytics exports', () => {
  it('queues an export, generates it in the worker, and offers a signed download', async () => {
    const fixture = fixtureWithClicks()
    const { id } = createAnalyticsExport({
      workspaceId: fixture.workspaceId,
      userId: fixture.userId,
      from: '2026-10-20',
      to: '2026-10-26',
      campaignId: null,
    })
    expect(getExportStatus({ workspaceId: fixture.workspaceId, exportId: id })).toMatchObject({
      status: 'queued',
      downloadUrl: null,
      requestedByName: 'Test User',
    })

    await runWorker({ once: true })

    const ready = getExportStatus({ workspaceId: fixture.workspaceId, exportId: id })
    expect(ready).toMatchObject({ status: 'ready', rowCount: 3, requestedByName: 'Test User' })
    expect(ready!.downloadUrl).toContain('http://127.0.0.1:3100/api/files/')
    const token = decodeURIComponent(ready!.downloadUrl!.split('/api/files/')[1]!)
    const verified = getStorage().verifySignedUrl(token)
    expect(verified).toMatchObject({ key: `exports/${fixture.workspaceId}/${id}.csv` })
    const file = await getStorage().get(verified!.key)
    expect(file.bytes.toString()).toContain('link_slug,domain,campaign,day,country_code,referrer_domain,device_class,clicks')
    expect(file.bytes.toString()).toContain('one,links.test,Test Campaign,2026-10-26,US,linkedin.com,mobile,2')
    expect(listExports(fixture.workspaceId)[0]).toMatchObject({ id, status: 'ready' })
    expect(getDb().prepare("SELECT status FROM jobs WHERE kind = 'export.generate'").get()).toMatchObject({
      status: 'succeeded',
    })
    expect(() => getExportStatus({ workspaceId: 'ws_other', exportId: id })).not.toThrow()
    expect(getExportStatus({ workspaceId: 'ws_other', exportId: id })).toBeNull()
  })
})
