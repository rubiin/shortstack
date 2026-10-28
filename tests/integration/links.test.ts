import { describe, expect, it } from 'vitest'

import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../src/domain/authz'
import { getDb } from '../../src/server/db'
import {
  anonymousAuthor,
  checkSlugAvailability,
  createLink,
  getLinkDetail,
  listLinks,
  setArchived,
  updateLink,
} from '../../src/server/links'
import { countClicks, insertLink, seedWorkspace } from '../helpers'

describe('createLink', () => {
  it('normalises the slug and destination before storing', () => {
    const fixture = seedWorkspace()
    const link = createLink({
      user: fixture.user,
      domainId: fixture.domainId,
      slug: '  Spring__Launch  ',
      destinationUrl: '  https://Example.com/Spring?utm_source=email  ',
      campaignId: fixture.campaignId,
    })
    expect(link.slug).toBe('spring-launch')
    expect(link.destinationUrl).toBe('https://example.com/Spring?utm_source=email')
    expect(link.state).toBe('active')
    expect(link.shortUrl).toBe('http://links.test/spring-launch')
    expect(link.campaignName).toBe('Test Campaign')
    expect(link.canArchive).toBe(true)
  })

  it('rejects a duplicate slug case-insensitively', () => {
    const fixture = seedWorkspace()
    insertLink(fixture, { slug: 'launch' })
    expect(() =>
      createLink({
        user: fixture.user,
        domainId: fixture.domainId,
        slug: 'LAUNCH',
        destinationUrl: 'https://example.com/other',
      }),
    ).toThrow(ValidationError)
    expect(
      checkSlugAvailability({
        workspaceId: fixture.workspaceId,
        domainId: fixture.domainId,
        slug: 'Launch',
      }),
    ).toMatchObject({
      normalized: 'launch',
      available: false,
    })
  })

  it('allows the same slug on a different domain', () => {
    const fixture = seedWorkspace()
    insertLink(fixture, { slug: 'launch' })
    const otherDomain = 'dom_other'
    getDb()
      .prepare(
        `INSERT INTO domains (id, workspace_id, hostname, origin, status, is_default, created_at)
         VALUES (?, ?, ?, ?, 'active', 0, ?)`,
      )
      .run(otherDomain, fixture.workspaceId, 'go.test', 'http://go.test', new Date().toISOString())
    const link = createLink({
      user: fixture.user,
      domainId: otherDomain,
      slug: 'launch',
      destinationUrl: 'https://example.com/other',
    })
    expect(link.domainHostname).toBe('go.test')
  })

  it('lets exactly one of two competing creations win a slug', async () => {
    const fixture = seedWorkspace()
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, (_, index) =>
        Promise.resolve().then(() =>
          createLink({
            user: fixture.user,
            domainId: fixture.domainId,
            slug: 'race-winner',
            destinationUrl: `https://example.com/race/${index}`,
          }),
        ),
      ),
    )
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(3)
    const row = getDb()
      .prepare('SELECT count(*) AS n FROM short_links WHERE slug = ?')
      .get('race-winner') as { n: number }
    expect(row.n).toBe(1)
  })

  it('rejects reserved slugs, invalid destinations, past expiry, and foreign domains', () => {
    const fixture = seedWorkspace()
    expect(() =>
      createLink({
        user: fixture.user,
        domainId: fixture.domainId,
        slug: 'api',
        destinationUrl: 'https://example.com',
      }),
    ).toThrow(ValidationError)
    expect(() =>
      createLink({
        user: fixture.user,
        domainId: fixture.domainId,
        slug: 'launch',
        destinationUrl: 'javascript:alert(1)',
      }),
    ).toThrow(ValidationError)
    expect(() =>
      createLink({
        user: fixture.user,
        domainId: fixture.domainId,
        slug: 'launch',
        destinationUrl: 'https://example.com',
        expiresAtLocal: '2020-01-01T00:00',
      }),
    ).toThrow(ValidationError)
    expect(() =>
      createLink({
        user: fixture.user,
        domainId: 'dom_foreign',
        slug: 'launch',
        destinationUrl: 'https://example.com',
      }),
    ).toThrow(ValidationError)
  })

  it('generates a random slug when requested', () => {
    const fixture = seedWorkspace()
    const link = createLink({
      user: fixture.user,
      domainId: fixture.domainId,
      slug: '',
      generateSlug: true,
      destinationUrl: 'https://example.com',
    })
    expect(link.slug).toMatch(/^[a-z0-9]{8}$/)
  })
})

describe('anonymous homepage links', () => {
  it('creates the shared anonymous author on first use', () => {
    const fixture = seedWorkspace({ domainId: 'dom_primary' })
    const author = anonymousAuthor('dom_primary')
    expect(author).toMatchObject({
      id: 'usr_anonymous',
      workspaceId: fixture.workspaceId,
      role: 'member',
    })

    const row = getDb()
      .prepare('SELECT workspace_id, role, disabled_at FROM users WHERE id = ?')
      .get('usr_anonymous') as {
      workspace_id: string
      role: string
      disabled_at: string | null
    }
    expect(row).toMatchObject({ workspace_id: fixture.workspaceId, role: 'member' })
    expect(row.disabled_at).not.toBeNull()
  })

  it('creates a short link without a session', () => {
    seedWorkspace({ domainId: 'dom_primary' })
    const link = createLink({
      user: anonymousAuthor('dom_primary'),
      domainId: 'dom_primary',
      slug: '',
      generateSlug: true,
      destinationUrl: 'https://example.com/from-homepage',
      note: 'Created from public homepage',
    })
    expect(link.slug).toMatch(/^[a-z0-9]{8}$/)
    expect(link.state).toBe('active')
    expect(getDb().prepare('SELECT created_by FROM short_links WHERE id = ?').get(link.id)).toEqual(
      { created_by: 'usr_anonymous' },
    )
  })
})

describe('updateLink', () => {
  it('requires a matching optimistic version', () => {
    const fixture = seedWorkspace()
    const link = insertLink(fixture, { slug: 'launch' })
    const detail = getLinkDetail({ workspaceId: fixture.workspaceId, linkId: link, role: 'owner' })
    expect(() =>
      updateLink({
        user: fixture.user,
        linkId: link,
        domainId: fixture.domainId,
        slug: 'launch',
        destinationUrl: 'https://example.com/new',
        expectedUpdatedAt: '2000-01-01T00:00:00.000Z',
      }),
    ).toThrow(ConflictError)
    const updated = updateLink({
      user: fixture.user,
      linkId: link,
      domainId: fixture.domainId,
      slug: 'launch',
      destinationUrl: 'https://example.com/new',
      expectedUpdatedAt: detail.updatedAt,
    })
    expect(updated.destinationUrl).toBe('https://example.com/new')
  })

  it('pauses a link without deleting its analytics', () => {
    const fixture = seedWorkspace()
    const link = insertLink(fixture, { slug: 'launch' })
    getDb()
      .prepare(
        `INSERT INTO click_events (id, workspace_id, link_id, day, country_code, referrer_domain, device_class)
         VALUES ('clk_one', ?, ?, '2026-10-26', 'US', 'direct', 'desktop')`,
      )
      .run(fixture.workspaceId, link)
    const updated = updateLink({
      user: fixture.user,
      linkId: link,
      domainId: fixture.domainId,
      slug: 'launch',
      destinationUrl: 'https://example.com/landing',
      enabled: false,
    })
    expect(updated.state).toBe('disabled')
    expect(countClicks(link)).toBe(1)
  })

  it('hides links from another workspace', () => {
    const fixture = seedWorkspace()
    const other = seedWorkspace({
      workspaceId: 'ws_other',
      userId: 'usr_other',
      domainId: 'dom_other',
      campaignId: 'cmp_other',
      hostname: 'other.test',
    })
    const link = insertLink(fixture, { slug: 'launch' })
    expect(() =>
      getLinkDetail({ workspaceId: other.workspaceId, linkId: link, role: 'owner' }),
    ).toThrow(NotFoundError)
  })
})

describe('archive authorization', () => {
  it('allows owners and rejects members', () => {
    const fixture = seedWorkspace({ role: 'owner' })
    const link = insertLink(fixture, { slug: 'launch' })
    const archived = setArchived({ user: fixture.user, linkId: link, archived: true })
    expect(archived.state).toBe('archived')
    const restored = setArchived({ user: fixture.user, linkId: link, archived: false })
    expect(restored.state).toBe('active')

    const member = seedWorkspace({
      workspaceId: 'ws_member',
      userId: 'usr_member',
      role: 'member',
      domainId: 'dom_member',
      campaignId: 'cmp_member',
      hostname: 'member.test',
    })
    const memberLink = insertLink(member, { slug: 'member-link' })
    expect(() => setArchived({ user: member.user, linkId: memberLink, archived: true })).toThrow(
      AuthorizationError,
    )
  })
})

describe('listLinks', () => {
  it('filters by computed state and paginates', () => {
    const fixture = seedWorkspace()
    insertLink(fixture, { slug: 'active-link' })
    insertLink(fixture, { slug: 'paused-link', enabled: false })
    insertLink(fixture, { slug: 'expired-link', expiresAt: '2020-01-01T00:00:00.000Z' })
    insertLink(fixture, { slug: 'archived-link', archivedAt: '2026-01-01T00:00:00.000Z' })

    expect(
      listLinks({ workspaceId: fixture.workspaceId, state: 'active' }).links.map(
        (link) => link.slug,
      ),
    ).toEqual(['active-link'])
    expect(
      listLinks({ workspaceId: fixture.workspaceId, state: 'disabled' }).links.map(
        (link) => link.slug,
      ),
    ).toEqual(['paused-link'])
    expect(
      listLinks({ workspaceId: fixture.workspaceId, state: 'expired' }).links.map(
        (link) => link.slug,
      ),
    ).toEqual(['expired-link'])
    expect(
      listLinks({ workspaceId: fixture.workspaceId, state: 'archived' }).links.map(
        (link) => link.slug,
      ),
    ).toEqual(['archived-link'])
    expect(listLinks({ workspaceId: fixture.workspaceId, state: 'all' }).total).toBe(1)
    expect(listLinks({ workspaceId: fixture.workspaceId, search: 'active-link' }).total).toBe(1)
    expect(listLinks({ workspaceId: fixture.workspaceId, page: 2 }).total).toBe(1)
  })
})
