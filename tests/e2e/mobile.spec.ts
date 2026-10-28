import { expect, test } from '@playwright/test'

import { gotoHydrated, requestShortLink, uniqueSlug } from './support'

test.describe('mobile journeys', () => {
  test('uses the card list and creates a link at iPhone width', async ({ page }) => {
    await gotoHydrated(page, '/app/links')
    await expect(page.locator('.table-desktop')).toBeHidden()
    await expect(page.locator('.card-list')).toBeVisible()
    await expect(page.locator('.link-card').filter({ hasText: 'spring-field-guide' })).toBeVisible()

    const slug = uniqueSlug('e2e-mobile')
    await gotoHydrated(page, '/app/links/new')
    await page.locator('#slug').fill(slug)
    await page.locator('#destinationUrl').fill('https://example.com/mobile/landing')
    await expect(page.getByText('Available', { exact: true })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Create link' }).click()
    await expect(page.getByRole('heading', { name: `/${slug}` })).toBeVisible()

    const redirect = await requestShortLink(`/${slug}?utm_source=mobile`)
    expect(redirect.status).toBe(302)
    expect(redirect.headers.get('location')).toBe('https://example.com/mobile/landing')

    await gotoHydrated(page, '/app/links')
    await expect(page.locator('.link-card').filter({ hasText: `/${slug}` })).toBeVisible()
  })

  test('imports a CSV and downloads QR codes on a phone-sized screen', async ({ page }) => {
    const slug = uniqueSlug('e2e-mobile-import')
    await gotoHydrated(page, '/app/import')
    await page
      .locator('#csv')
      .fill(
        [
          'slug,destination_url,campaign,note',
          `${slug},https://example.com/mobile/import,Mobile Import,One row`,
        ].join('\n'),
      )
    await page.getByRole('button', { name: 'Read CSV and map columns' }).click()
    await expect(page).toHaveURL(/\/app\/import\/imp_[^/]+$/)
    await page.getByRole('button', { name: 'Run dry run' }).click()
    await expect(page.getByText('1 valid · 0 need attention')).toBeVisible()
    await page.getByRole('button', { name: 'Create 1 link' }).click({ force: true })
    await expect(page.getByRole('heading', { name: 'Imported links' })).toBeVisible()

    const qrLink = page.getByRole('link', { name: 'Download QR codes' })
    await expect(qrLink).toBeVisible()
    const qrResponse = await page.request.get((await qrLink.getAttribute('href')) as string)
    expect(qrResponse.status()).toBe(200)
    expect(qrResponse.headers()['content-type']).toContain('application/zip')
    expect((await qrResponse.body()).subarray(0, 2).toString()).toBe('PK')

    const redirect = await requestShortLink(`/${slug}`)
    expect(redirect.status).toBe(302)
  })

  test('creates and downloads a CSV export at iPhone width', async ({ page }) => {
    await gotoHydrated(page, '/app/analytics')
    await expect(page.getByRole('heading', { name: 'Signal, not surveillance.' })).toBeVisible()
    await page.getByRole('button', { name: 'Create export' }).click()
    const download = page.getByRole('link', { name: 'Download', exact: true }).first()
    await expect(download).toBeVisible({ timeout: 25_000 })
    const response = await page.request.get((await download.getAttribute('href')) as string)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/csv')
    expect(await response.text()).toContain('link_slug,domain,campaign')
  })
})
