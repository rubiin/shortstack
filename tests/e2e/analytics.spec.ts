import { expect, test } from '@playwright/test'
import { gotoHydrated } from './support'
test.describe('analytics', () => {
  test('reads minimized analytics, filters campaigns, and downloads a background CSV export', async ({ page }) => {
    await gotoHydrated(page, '/app/analytics')
    await expect(page.getByRole('heading', { name: 'Signal, not surveillance.' })).toBeVisible()
    await expect(page.getByText('Clicks', { exact: true })).toBeVisible()
    await expect(page.getByText('Top country', { exact: true })).toBeVisible()
    await expect(page.getByText('Mobile share', { exact: true })).toBeVisible()
    await expect(page.getByText(/No IP addresses, raw user agents, or visitor profiles/)).toBeVisible()

    await page.getByRole('link', { name: '7d', exact: true }).click()
    await expect(page).toHaveURL(/days=7/)
    await expect(page.getByText(/7 days · UTC/)).toBeVisible()

    await page.locator('#analytics-campaign').selectOption('cmp_spring')
    await page.getByRole('button', { name: 'Update', exact: true }).click()
    await expect(page).toHaveURL(/campaignId=cmp_spring/)
    await expect(page.getByText('Spring Launch', { exact: true }).nth(1)).toBeVisible()

    const createExport = page.getByRole('button', { name: 'Create export' })
    await expect(createExport).toBeVisible()
    await createExport.click()
    await expect(page.getByRole('button', { name: 'Generating…' })).toBeDisabled()

    const download = page.getByRole('link', { name: 'Download', exact: true }).first()
    await expect(download).toBeVisible({ timeout: 25_000 })
    const href = await download.getAttribute('href')
    expect(href).toContain('/api/files/')
    const response = await page.request.get(href as string)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/csv')
    const body = await response.text()
    expect(body.split('\r\n')[0]).toBe(
      'link_slug,domain,campaign,day,country_code,referrer_domain,device_class,clicks',
    )
    expect(body).toContain('Spring Launch')
    expect(body).not.toContain('utm_source')
    expect(body).not.toContain('secret')
  })
})
