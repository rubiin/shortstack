import { describe, expect, it } from 'vitest'
import { getDb } from '../../src/server/db'
import { redirectResponse, resolveRedirect, unavailableResponse } from '../../src/server/redirects'
import { countClicks, insertLink, seedWorkspace } from '../helpers'

const now = new Date('2026-10-26T13:45:00.000Z')

describe('resolveRedirect', () => {
  it('returns the destination and records only minimised analytics', () => {
    const fixture = seedWorkspace()
    const link = insertLink(fixture, {
      slug: 'spring-guide',
      destination: 'https://example.com/landing?utm_source=shortstack&token=destination-secret',
    })
    const resolution = resolveRedirect({
      host: 'LINKS.TEST',
      slug: 'Spring-Guide',
      referrer: 'https://www.linkedin.com/feed/?secret=referrer-secret',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile',
      countryHeader: 'US',
      now,
    })
    expect(resolution).toEqual({
      kind: 'redirect',
      linkId: link,
      destination: 'https://example.com/landing?utm_source=shortstack&token=destination-secret',
    })

    const row = getDb().prepare('SELECT * FROM click_events').get() as Record<string, unknown>
    expect(row).toMatchObject({
      workspace_id: fixture.workspaceId,
      link_id: link,
      day: '2026-10-26',
      country_code: 'US',
      referrer_domain: 'linkedin.com',
      device_class: 'mobile',
    })
    expect(Object.keys(row).sort()).toEqual(
      ['country_code', 'day', 'device_class', 'id', 'link_id', 'referrer_domain', 'workspace_id'].sort(),
    )
    expect(JSON.stringify(row)).not.toContain('secret')
    expect(JSON.stringify(row)).not.toContain('iPhone')
    expect(JSON.stringify(row)).not.toContain('13:45')
  })

  it('does not record clicks for paused or expired links', () => {
    const fixture = seedWorkspace()
    const paused = insertLink(fixture, { slug: 'paused', enabled: false })
    const expired = insertLink(fixture, { slug: 'expired', expiresAt: '2026-10-26T13:44:59.000Z' })
    expect(resolveRedirect({ host: 'links.test', slug: 'paused', now })).toEqual({
      kind: 'unavailable',
      reason: 'disabled',
    })
    expect(resolveRedirect({ host: 'links.test', slug: 'expired', now })).toEqual({
      kind: 'unavailable',
      reason: 'expired',
    })
    expect(countClicks(paused)).toBe(0)
    expect(countClicks(expired)).toBe(0)
  })

  it('treats unknown, archived, wrong-host, and invalid slugs as not found', () => {
    const fixture = seedWorkspace()
    const archived = insertLink(fixture, {
      slug: 'archived-link',
      archivedAt: '2026-01-01T00:00:00.000Z',
    })
    insertLink(fixture, { slug: 'known-slug' })
    expect(resolveRedirect({ host: 'links.test', slug: 'not-known', now })).toEqual({ kind: 'not_found' })
    expect(resolveRedirect({ host: 'links.test', slug: 'archived-link', now })).toEqual({ kind: 'not_found' })
    expect(resolveRedirect({ host: 'other.test', slug: 'known-slug', now })).toEqual({ kind: 'not_found' })
    expect(resolveRedirect({ host: 'links.test', slug: 'api', now })).toEqual({ kind: 'not_found' })
    expect(countClicks(archived)).toBe(0)
  })

  it('keeps redirecting while the promise has not passed', () => {
    const fixture = seedWorkspace()
    insertLink(fixture, { slug: 'soon', expiresAt: '2026-10-26T13:45:01.000Z' })
    expect(resolveRedirect({ host: 'links.test', slug: 'soon', now })).toMatchObject({ kind: 'redirect' })
  })
})

describe('responses', () => {
  it('marks redirects as no-store and hides the referrer', () => {
    const response = redirectResponse('https://example.com/?a=1')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://example.com/?a=1')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('returns branded 410 and 404 pages', async () => {
    const paused = unavailableResponse('disabled')
    expect(paused.status).toBe(410)
    const pausedHtml = await paused.text()
    expect(pausedHtml).toContain('This link is paused')
    expect(pausedHtml).toContain('No visitor profile was created')
    expect(paused.headers.get('referrer-policy')).toBe('no-referrer')

    const expired = unavailableResponse('expired')
    expect(expired.status).toBe(410)
    expect(await expired.text()).toContain('This link has expired')

    const missing = unavailableResponse('not_found')
    expect(missing.status).toBe(404)
    expect(await missing.text()).toContain('This link does not exist')
  })
})
