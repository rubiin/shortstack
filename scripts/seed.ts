import { pathToFileURL } from 'node:url'
import { getConfig } from '../src/server/config'
import { getDb, migrate } from '../src/server/db'
import { hashPassword } from '../src/server/password'
import { newId, nowIso } from '../src/server/ids'
import { classifyDevice, coarseCountry, referrerDomain } from '../src/domain/privacy'

type SeedLink = {
  id: string
  slug: string
  destination: string
  campaignId: string | null
  note: string | null
  expiresInDays: number | null
  enabled: boolean
  archived: boolean
  createdDaysAgo: number
  clickDays: number[]
  weight?: number
}

function isoAtDaysAgo(days: number, hour = 12, minute = 0): string {
  const date = new Date()
  date.setUTCHours(hour, minute, 0, 0)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString()
}

function addDaysIso(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

function mulberry32(seed: number): () => number {
  let value = seed
  return () => {
    value |= 0
    value = (value + 0x6d2b79f5) | 0
    let t = Math.imul(value ^ (value >>> 15), 1 | value)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seedDemoData(): { seeded: boolean; reason?: string } {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM workspaces LIMIT 1').get()
  if (existing) return { seeded: false, reason: 'Database already contains a workspace' }
  migrate()

  const config = getConfig()
  const passwordHash = hashPassword(config.SEED_PASSWORD)
  const now = nowIso()
  const workspaceId = 'ws_northstar'
  const otherWorkspaceId = 'ws_river'
  const ownerId = 'usr_maya'
  const memberId = 'usr_theo'
  const riverUserId = 'usr_ravi'
  const primaryHost = new URL(config.SHORT_LINK_ORIGIN).host
  const primaryOrigin = new URL(config.SHORT_LINK_ORIGIN).origin

  const campaigns = [
    { id: 'cmp_spring', name: 'Spring Launch' },
    { id: 'cmp_renewal', name: 'Renewal Campaign' },
    { id: 'cmp_partner', name: 'Partner Webinar' },
    { id: 'cmp_evergreen', name: 'Evergreen' },
  ]

  const domainId = 'dom_primary'
  const links: SeedLink[] = [
    {
      id: 'lnk_fieldguide',
      slug: 'spring-field-guide',
      destination: 'https://northstar.example/campaigns/spring/field-guide?utm_source=shortstack&utm_medium=email',
      campaignId: 'cmp_spring',
      note: 'Email hero CTA. Keep live through the launch window.',
      expiresInDays: 12,
      enabled: true,
      archived: false,
      createdDaysAgo: 34,
      clickDays: [0, 1, 2, 3, 4, 5, 6, 8, 11, 14, 18, 22, 25, 29],
      weight: 3,
    },
    {
      id: 'lnk_webinar',
      slug: 'partner-webinar',
      destination: 'https://northstar.example/events/partner-webinar?utm_campaign=partners',
      campaignId: 'cmp_partner',
      note: 'Used on the partner co-marketing page.',
      expiresInDays: null,
      enabled: true,
      archived: false,
      createdDaysAgo: 21,
      clickDays: [0, 1, 1, 2, 3, 4, 5, 7, 9, 12, 16, 20],
      weight: 2,
    },
    {
      id: 'lnk_renewal',
      slug: 'renewal-checklist',
      destination: 'https://northstar.example/resources/renewal-checklist',
      campaignId: 'cmp_renewal',
      note: 'Expires soon — swap before the customer webinar.',
      expiresInDays: 3,
      enabled: true,
      archived: false,
      createdDaysAgo: 10,
      clickDays: [0, 1, 2, 4, 6, 9],
      weight: 1,
    },
    {
      id: 'lnk_pricing',
      slug: 'legacy-pricing',
      destination: 'https://northstar.example/pricing/2025',
      campaignId: 'cmp_evergreen',
      note: 'Kept for historical reporting. Replaced by the current pricing page.',
      expiresInDays: -4,
      enabled: true,
      archived: false,
      createdDaysAgo: 50,
      clickDays: [8, 12, 18, 23, 28, 33, 39, 44],
      weight: 1,
    },
    {
      id: 'lnk_paused',
      slug: 'paused-newsletter',
      destination: 'https://northstar.example/newsletter',
      campaignId: 'cmp_evergreen',
      note: 'Paused while the newsletter signup changes.',
      expiresInDays: null,
      enabled: false,
      archived: false,
      createdDaysAgo: 15,
      clickDays: [2, 3, 5],
      weight: 1,
    },
    {
      id: 'lnk_archived',
      slug: 'winter-recap',
      destination: 'https://northstar.example/campaigns/winter-recap',
      campaignId: 'cmp_evergreen',
      note: 'Archived after the winter campaign closed.',
      expiresInDays: null,
      enabled: true,
      archived: true,
      createdDaysAgo: 95,
      clickDays: [55, 60, 64, 70, 77, 81, 86],
      weight: 1,
    },
  ]

  const insert = db.transaction(() => {
    db.prepare('INSERT INTO workspaces (id, name, timezone, created_at) VALUES (?, ?, ?, ?)').run(
      workspaceId,
      'Northstar Marketing',
      config.SEED_WORKSPACE_TIMEZONE,
      isoAtDaysAgo(120),
    )
    db.prepare('INSERT INTO workspaces (id, name, timezone, created_at) VALUES (?, ?, ?, ?)').run(
      otherWorkspaceId,
      'River Studio',
      'UTC',
      isoAtDaysAgo(60),
    )

    const insertUser = db.prepare(
      `INSERT INTO users (id, workspace_id, email, name, role, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    insertUser.run(ownerId, workspaceId, 'maya@northstar.example', 'Maya Chen', 'owner', passwordHash, isoAtDaysAgo(120))
    insertUser.run(memberId, workspaceId, 'theo@northstar.example', 'Theo Park', 'member', passwordHash, isoAtDaysAgo(80))
    insertUser.run(riverUserId, otherWorkspaceId, 'ravi@river.example', 'Ravi Shah', 'owner', passwordHash, isoAtDaysAgo(60))

    const insertDomain = db.prepare(
      `INSERT INTO domains (id, workspace_id, hostname, origin, status, is_default, created_at, verified_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
    )
    insertDomain.run(domainId, workspaceId, primaryHost, primaryOrigin, 1, isoAtDaysAgo(118), isoAtDaysAgo(117))
    insertDomain.run(
      'dom_river',
      otherWorkspaceId,
      'go.river-studio.example',
      'https://go.river-studio.example',
      1,
      isoAtDaysAgo(58),
      isoAtDaysAgo(57),
    )

    const insertCampaign = db.prepare(
      `INSERT INTO campaigns (id, workspace_id, name, status, created_by, created_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
    )
    for (const campaign of campaigns) {
      insertCampaign.run(campaign.id, workspaceId, campaign.name, ownerId, isoAtDaysAgo(100))
    }

    const insertLink = db.prepare(
      `INSERT INTO short_links
       (id, workspace_id, domain_id, campaign_id, slug, destination_url, note, expires_at, expires_timezone, enabled,
        archived_at, archived_by, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UTC', ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const link of links) {
      const createdAt = isoAtDaysAgo(link.createdDaysAgo)
      insertLink.run(
        link.id,
        workspaceId,
        domainId,
        link.campaignId,
        link.slug,
        link.destination,
        link.note,
        link.expiresInDays === null ? null : addDaysIso(link.expiresInDays),
        link.enabled ? 1 : 0,
        link.archived ? isoAtDaysAgo(4) : null,
        link.archived ? ownerId : null,
        ownerId,
        ownerId,
        createdAt,
        createdAt,
      )
      db.prepare(
        `INSERT INTO audit_log (id, workspace_id, actor_user_id, action, entity_type, entity_id, details_json, created_at)
         VALUES (?, ?, ?, 'link.created', 'short_link', ?, ?, ?)`,
      ).run(
        newId('aud'),
        workspaceId,
        ownerId,
        link.id,
        JSON.stringify({ slug: link.slug, seeded: true }),
        createdAt,
      )
      if (link.archived) {
        db.prepare(
          `INSERT INTO audit_log (id, workspace_id, actor_user_id, action, entity_type, entity_id, details_json, created_at)
           VALUES (?, ?, ?, 'link.archived', 'short_link', ?, '{}', ?)`,
        ).run(newId('aud'), workspaceId, ownerId, link.id, isoAtDaysAgo(4))
      }
    }

    db.prepare(
      `INSERT INTO short_links
       (id, workspace_id, domain_id, slug, destination_url, note, expires_timezone, enabled, created_by, updated_by, created_at, updated_at)
       VALUES ('lnk_river', ?, 'dom_river', 'river-private', 'https://river.example/private', NULL, 'UTC', 1, ?, ?, ?, ?)`,
    ).run(otherWorkspaceId, riverUserId, riverUserId, isoAtDaysAgo(40), isoAtDaysAgo(40))

    const countries = ['US', 'US', 'US', 'GB', 'CA', 'DE', 'FR', 'AU', 'ZZ']
    const referrers = [
      'linkedin.com',
      'google.com',
      'google.com',
      'direct',
      'northstar.example',
      'newsletter.example',
      'x.com',
    ]
    const devices = ['mobile', 'mobile', 'mobile', 'desktop', 'desktop', 'tablet', 'bot']
    const random = mulberry32(20260421)
    const insertClick = db.prepare(
      `INSERT INTO click_events (id, workspace_id, link_id, day, country_code, referrer_domain, device_class)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const link of links) {
      for (const offset of link.clickDays) {
        const count = (link.weight ?? 1) * (1 + Math.floor(random() * 6))
        for (let index = 0; index < count; index += 1) {
          const day = isoAtDaysAgo(offset).slice(0, 10)
          insertClick.run(
            newId('clk'),
            workspaceId,
            link.id,
            day,
            coarseCountry(countries[Math.floor(random() * countries.length)]),
            referrerDomain(referrers[Math.floor(random() * referrers.length)]),
            classifyDevice(
              devices[Math.floor(random() * devices.length)] === 'mobile'
                ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile'
                : devices[Math.floor(random() * devices.length)] === 'tablet'
                  ? 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'
                  : devices[Math.floor(random() * devices.length)] === 'bot'
                    ? 'Slackbot-LinkExpanding 1.0'
                    : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            ),
          )
        }
      }
    }

    db.prepare(
      `INSERT INTO exports
       (id, workspace_id, requested_by, status, filters_json, attempts, last_error, created_at, updated_at, finished_at)
       VALUES ('exp_failed_demo', ?, ?, 'failed', ?, 5, 'Export worker timed out while generating the file. Safe to retry.', ?, ?, ?)`,
    ).run(
      workspaceId,
      ownerId,
      JSON.stringify({ from: isoAtDaysAgo(30).slice(0, 10), to: now.slice(0, 10), campaignId: null }),
      isoAtDaysAgo(2),
      isoAtDaysAgo(2),
      isoAtDaysAgo(2),
    )
    db.prepare(
      `INSERT INTO jobs
       (id, workspace_id, kind, payload_json, status, attempts, max_attempts, idempotency_key, run_after, last_error,
        correlation_id, created_at, updated_at, finished_at)
       VALUES ('job_failed_demo', ?, 'export.generate', ?, 'failed', 5, 5, 'export:exp_failed_demo', ?, ?, ?, ?, ?, ?)`,
    ).run(
      workspaceId,
      JSON.stringify({ exportId: 'exp_failed_demo' }),
      isoAtDaysAgo(2),
      'Export worker timed out while generating the file. Safe to retry.',
      'demo-correlation-export',
      isoAtDaysAgo(2),
      isoAtDaysAgo(2),
      isoAtDaysAgo(2),
    )
  })
  insert()
  return { seeded: true }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const result = seedDemoData()
  if (!result.seeded) {
    console.log(`Seed skipped: ${result.reason}. Run npm run db:reset for a fresh demo dataset.`)
  } else {
    console.log('Seeded Northstar Marketing demo data.')
    console.log('Owner: maya@northstar.example')
    console.log('Member: theo@northstar.example')
    console.log(`Password: ${getConfig().SEED_PASSWORD}`)
  }
}
