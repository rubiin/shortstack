import { getDb } from '../src/server/db'
import { nowIso } from '../src/server/ids'
import type { AuthUser, UserRole } from '../src/domain/authz'

export type Fixture = {
  workspaceId: string
  userId: string
  domainId: string
  campaignId: string
  user: AuthUser
}

export function seedWorkspace(options: {
  workspaceId?: string
  userId?: string
  role?: UserRole
  email?: string
  domainId?: string
  hostname?: string
  origin?: string
  campaignId?: string
  defaultDomain?: boolean
} = {}): Fixture {
  const db = getDb()
  const workspaceId = options.workspaceId ?? 'ws_test'
  const userId = options.userId ?? 'usr_test'
  const domainId = options.domainId ?? 'dom_test'
  const campaignId = options.campaignId ?? 'cmp_test'
  const role = options.role ?? 'owner'
  const hostname = options.hostname ?? 'links.test'
  const origin = options.origin ?? 'http://links.test'
  const timestamp = nowIso()

  db.prepare('INSERT INTO workspaces (id, name, timezone, created_at) VALUES (?, ?, ?, ?)').run(
    workspaceId,
    'Test Workspace',
    'UTC',
    timestamp,
  )
  db.prepare(
    'INSERT INTO users (id, workspace_id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    userId,
    workspaceId,
    options.email ?? `${userId}@test.example`,
    'Test User',
    role,
    'scrypt$dGVzdC1zYWx0$dGVzdC1oYXNo',
    timestamp,
  )
  db.prepare(
    `INSERT INTO domains (id, workspace_id, hostname, origin, status, is_default, created_at, verified_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
  ).run(domainId, workspaceId, hostname, origin, options.defaultDomain === false ? 0 : 1, timestamp, timestamp)
  db.prepare(
    'INSERT INTO campaigns (id, workspace_id, name, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(campaignId, workspaceId, 'Test Campaign', 'active', userId, timestamp)

  return {
    workspaceId,
    userId,
    domainId,
    campaignId,
    user: {
      id: userId,
      workspaceId,
      email: options.email ?? `${userId}@test.example`,
      name: 'Test User',
      role,
    },
  }
}

export function insertLink(
  fixture: Fixture,
  options: {
    id?: string
    slug?: string
    destination?: string
    enabled?: boolean
    expiresAt?: string | null
    archivedAt?: string | null
    campaignId?: string | null
    domainId?: string
    createdAt?: string
  } = {},
): string {
  const db = getDb()
  const id = options.id ?? `lnk_${Math.random().toString(36).slice(2, 12)}`
  const timestamp = options.createdAt ?? nowIso()
  db.prepare(
    `INSERT INTO short_links
     (id, workspace_id, domain_id, campaign_id, slug, destination_url, note, expires_at, expires_timezone,
      enabled, archived_at, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'UTC', ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    fixture.workspaceId,
    options.domainId ?? fixture.domainId,
    options.campaignId === undefined ? fixture.campaignId : options.campaignId,
    options.slug ?? 'test-link',
    options.destination ?? 'https://example.com/landing',
    options.expiresAt ?? null,
    options.enabled === false ? 0 : 1,
    options.archivedAt ?? null,
    fixture.userId,
    fixture.userId,
    timestamp,
    timestamp,
  )
  return id
}

export function countClicks(linkId?: string): number {
  const row = linkId
    ? (getDb().prepare('SELECT count(*) AS n FROM click_events WHERE link_id = ?').get(linkId) as { n: number })
    : (getDb().prepare('SELECT count(*) AS n FROM click_events').get() as { n: number })
  return Number(row.n)
}
