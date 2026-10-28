import { expect, test } from '@playwright/test'

import { gotoHydrated, reloadHydrated, requestShortLink, totalClicks, uniqueSlug } from './support'

test.describe('links', () => {
  test('creates a link, redirects a visitor, then pauses, archives, and restores it', async ({
    page,
  }) => {
    const slug = uniqueSlug('e2e-link')
    const destination = 'https://example.com/e2e/landing?utm_source=shortstack&utm_medium=email'

    await gotoHydrated(page, '/app/links/new')
    await page.locator('#slug').fill(slug)
    await page.locator('#destinationUrl').fill(destination)
    await expect(page.getByText('Available', { exact: true })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Create link' }).click()

    await page.waitForURL(/\/app\/links\/lnk_[^?]+\?saved=1/)
    await expect(page.getByRole('heading', { name: `/${slug}` })).toBeVisible()
    await expect(
      page.getByText('Link saved. The redirect is live with the new settings.'),
    ).toBeVisible()
    await expect(page.getByText('Active', { exact: true })).toBeVisible()
    expect(await totalClicks(page)).toBe('0')

    const redirect = await requestShortLink(`/${slug}?utm_source=private&token=do-not-store`, {
      referrer: 'https://www.linkedin.com/feed/?secret=referrer-secret',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile',
      country: 'US',
    })
    expect(redirect.status).toBe(302)
    expect(redirect.headers.get('location')).toBe(destination)
    expect(redirect.headers.get('cache-control')).toContain('no-store')
    expect(redirect.headers.get('referrer-policy')).toBe('no-referrer')

    await reloadHydrated(page)
    await expect.poll(async () => totalClicks(page)).toBe('1')

    await page.getByRole('link', { name: 'Edit link' }).click()
    await expect(page).toHaveURL(/\/app\/links\/lnk_[^/]+\/edit/)
    await expect(page.locator('#slug')).toHaveValue(slug)
    await page.getByRole('checkbox').uncheck()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.waitForURL(/\/app\/links\/lnk_[^?]+\?saved=1/)
    await expect(page.locator('.short-hero').getByText('Paused', { exact: true })).toBeVisible()

    const paused = await requestShortLink(`/${slug}`)
    expect(paused.status).toBe(410)
    expect(await paused.text()).toContain('This link is paused')
    await reloadHydrated(page)
    expect(await totalClicks(page)).toBe('1')

    await page.getByRole('button', { name: 'Archive', exact: true }).click()
    const archiveDialog = page.locator('dialog')
    await expect(archiveDialog.getByRole('heading', { name: 'Archive this link?' })).toBeVisible()
    await archiveDialog.getByRole('button', { name: 'Archive link', exact: true }).click()
    await expect(page.getByText('Link archived. It no longer redirects.')).toBeVisible()
    await expect(page.locator('.short-hero').getByText('Archived', { exact: true })).toBeVisible()

    const archived = await requestShortLink(`/${slug}`)
    expect(archived.status).toBe(404)
    expect(await archived.text()).toContain('This link does not exist')
    await reloadHydrated(page)
    expect(await totalClicks(page)).toBe('1')

    await page.getByRole('button', { name: 'Restore link', exact: true }).click()
    await expect(
      page.locator('dialog').getByRole('heading', { name: 'Restore this link?' }),
    ).toBeVisible()
    await page.locator('dialog').getByRole('button', { name: 'Restore link', exact: true }).click()
    await expect(page.getByText('Link restored.')).toBeVisible()

    await page.getByRole('link', { name: 'Edit link' }).click()
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.waitForURL(/\/app\/links\/lnk_[^?]+\?saved=1/)
    const restored = await requestShortLink(`/${slug}`)
    expect(restored.status).toBe(302)
    expect(restored.headers.get('location')).toBe(destination)
    await reloadHydrated(page)
    expect(await totalClicks(page)).toBe('2')
  })

  test('shows validation errors for an existing slug', async ({ page }) => {
    await gotoHydrated(page, '/app/links/new')
    await page.locator('#slug').fill('spring-field-guide')
    await page.locator('#destinationUrl').fill('https://example.com/duplicate')
    await page.getByRole('button', { name: 'Create link' }).click()
    await expect(page.getByText('Could not save', { exact: true })).toBeVisible()
    await expect(
      page.getByText('That slug is already in use on this domain.', { exact: true }),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/app\/links\/new/)
  })

  test('filters links by state and slug', async ({ page }) => {
    await gotoHydrated(page, '/app/links')
    await expect(page.getByRole('link', { name: '/spring-field-guide' })).toBeVisible()

    const tabs = page.getByRole('navigation', { name: 'Filter by link state' })
    await tabs.getByRole('link', { name: 'Paused', exact: true }).click()
    await expect(page).toHaveURL(/state=disabled/)
    await expect(page.getByRole('link', { name: '/paused-newsletter' })).toBeVisible()
    await expect(page.getByRole('link', { name: '/spring-field-guide' })).toHaveCount(0)

    await tabs.getByRole('link', { name: 'Expired', exact: true }).click()
    await expect(page).toHaveURL(/state=expired/)
    await expect(page.getByRole('link', { name: '/legacy-pricing' })).toBeVisible()

    await tabs.getByRole('link', { name: 'Archived', exact: true }).click()
    await expect(page).toHaveURL(/state=archived/)
    await expect(page.getByRole('link', { name: '/winter-recap' })).toBeVisible()

    await tabs.getByRole('link', { name: 'Active', exact: true }).click()
    await expect(page).toHaveURL(/state=active/)
    await expect(page.getByRole('link', { name: '/spring-field-guide' })).toBeVisible()
    await page.locator('#link-search').fill('spring')
    await page.getByRole('button', { name: 'Apply' }).click()
    await expect(page).toHaveURL(/[?&]search=spring/)
    await expect(page.getByRole('link', { name: '/spring-field-guide' })).toBeVisible()
    await expect(page.getByRole('link', { name: '/renewal-checklist' })).toHaveCount(0)
  })
})
