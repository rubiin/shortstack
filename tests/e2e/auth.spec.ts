import { expect, test } from '@playwright/test'
import { submitSignIn } from './support'

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('sends visitors to sign in and returns them to the links desk', async ({ page }) => {
    await page.goto('/app/links')
    await expect(page).toHaveURL(/\/login\?next=/)
    await expect(page.getByRole('heading', { name: 'Sign in to Shortstack' })).toBeVisible()
    await expect(page.locator('#email')).toHaveAttribute('autocomplete', 'username')
    await expect(page.locator('#password')).toHaveAttribute('autocomplete', 'current-password')

    await submitSignIn(page)
    await expect(page).toHaveURL(/\/app\/links/)
    await expect(page.getByRole('heading', { name: 'Your links, on the record.' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(page.getByText('Owner', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: 'Sign in to Shortstack' })).toBeVisible()
  })

  test('rejects a wrong password without creating a session', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await expect(async () => {
      await page.getByRole('button', { name: 'Fill owner demo' }).click()
      await expect(page.locator('#email')).toHaveValue('maya@northstar.example')
    }).toPass({ timeout: 15_000 })
    await page.locator('#password').fill('definitely-not-the-password')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByText('Email or password is incorrect.')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/app/links')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('member access', () => {
  test.use({ storageState: 'tests/e2e/.auth/member.json' })

  test('a member can work with links but cannot archive them', async ({ page }) => {
    await page.goto('/app/links')
    await expect(page.getByText('Member', { exact: true })).toBeVisible()
    await page.goto('/app/links/lnk_fieldguide')
    await expect(page.getByRole('heading', { name: '/spring-field-guide' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edit link' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Archive', exact: true })).toHaveCount(0)
  })
})
