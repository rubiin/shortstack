import { expect, test } from '@playwright/test'
import { gotoHydrated, reloadHydrated, requestShortLink, totalClicks } from './support'

test.describe('public redirects', () => {
  test('redirects quickly while preserving destination tracking and not counting unavailable links', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/app\/links/)

    const started = Date.now()
    const active = await requestShortLink(
      '/spring-field-guide?utm_source=inbound&token=never-store-this',
      {
        referrer: 'https://www.linkedin.com/feed/?secret=referrer-secret',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile',
        country: 'US',
      },
    )
    expect(Date.now() - started).toBeLessThan(1_500)
    expect(active.status).toBe(302)
    expect(active.headers.get('location')).toBe(
      'https://northstar.example/campaigns/spring/field-guide?utm_source=shortstack&utm_medium=email',
    )
    expect(active.headers.get('location')).not.toContain('inbound')
    expect(active.headers.get('cache-control')).toContain('no-store')
    expect(active.headers.get('referrer-policy')).toBe('no-referrer')

    await gotoHydrated(page, '/app/links/lnk_paused')
    const pausedClicks = await totalClicks(page)
    const paused = await requestShortLink('/paused-newsletter?utm_source=should-not-count')
    expect(paused.status).toBe(410)
    expect(paused.headers.get('cache-control')).toContain('no-store')
    expect(paused.headers.get('referrer-policy')).toBe('no-referrer')
    const pausedBody = await paused.text()
    expect(pausedBody).toContain('This link is paused')
    expect(pausedBody).toContain('No visitor profile was created')
    await reloadHydrated(page)
    expect(await totalClicks(page)).toBe(pausedClicks)

    await gotoHydrated(page, '/app/links/lnk_pricing')
    const expiredClicks = await totalClicks(page)
    const expired = await requestShortLink('/legacy-pricing')
    expect(expired.status).toBe(410)
    expect(await expired.text()).toContain('This link has expired')
    await reloadHydrated(page)
    expect(await totalClicks(page)).toBe(expiredClicks)

    const archived = await requestShortLink('/winter-recap')
    expect(archived.status).toBe(404)
    expect(await archived.text()).toContain('This link does not exist')

    const missing = await requestShortLink('/not-a-real-shortstack-slug')
    expect(missing.status).toBe(404)
    expect(await missing.text()).toContain('This link does not exist')
  })

  test('shows the branded not-found page for reserved routes', async () => {
    const reserved = await requestShortLink('/api')
    expect(reserved.status).toBe(404)
    expect(await reserved.text()).toContain('This link does not exist')
  })
})
