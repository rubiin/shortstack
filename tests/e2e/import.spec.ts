import { expect, test } from '@playwright/test'

import { gotoHydrated, requestShortLink, uniqueSlug } from './support'

test.describe('CSV import', () => {
  test('dry-runs, resolves a duplicate, creates links, and downloads QR codes', async ({
    page,
  }) => {
    const slug = uniqueSlug('e2e-import')
    const csv = [
      'slug,destination_url,campaign,note,expires_at,enabled',
      `${slug},https://example.com/import/one,Import E2E,First row,,`,
      `${slug},https://example.com/import/two,Import E2E,Second row,,`,
    ].join('\n')

    await gotoHydrated(page, '/app/import')
    await page.locator('#csv').fill(csv)
    await expect(page.getByText('2 lines pasted')).toBeVisible()
    await page.getByRole('button', { name: 'Read CSV and map columns' }).click()
    await expect(page).toHaveURL(/\/app\/import\/imp_[^/]+$/)
    await expect(page.getByRole('heading', { name: 'Check before you create.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Column mapping' })).toBeVisible()

    await page.getByRole('button', { name: 'Run dry run' }).click()
    await expect(page.getByText('1 valid · 1 need attention')).toBeVisible()
    await expect(page.getByText('Suggested: /' + slug + '-2')).toBeVisible()
    await expect(page.getByText('This row was skipped instead of created.')).toHaveCount(0)

    await page.getByRole('button', { name: 'Apply 1 suggested slug' }).click()
    await expect(page.getByText('2 valid · 0 need attention')).toBeVisible()
    await page.getByRole('button', { name: 'Create 2 links' }).click()

    await expect(page.getByRole('heading', { name: 'Imported links' })).toBeVisible()
    await expect(
      page.getByText('2 links created. Analytics start on the first click.'),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: `/${slug}`, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: `/${slug}-2`, exact: true })).toBeVisible()

    const qrLink = page.getByRole('link', { name: 'Download QR codes' })
    await expect(qrLink).toBeVisible()
    const qrResponse = await page.request.get((await qrLink.getAttribute('href')) as string)
    expect(qrResponse.status()).toBe(200)
    expect(qrResponse.headers()['content-type']).toContain('application/zip')
    const qrBody = await qrResponse.body()
    expect(qrBody.subarray(0, 2).toString()).toBe('PK')

    const redirect = await requestShortLink(`/${slug}-2`)
    expect(redirect.status).toBe(302)
    expect(redirect.headers.get('location')).toBe('https://example.com/import/two')
  })
})
