import { expect, type Page } from '@playwright/test'

export const BASE_URL = 'http://127.0.0.1:3100'

export async function waitForHydration(page: Page): Promise<void> {
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached', timeout: 20_000 })
}

export async function gotoHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await waitForHydration(page)
}

export async function reloadHydrated(page: Page): Promise<void> {
  await page.reload()
  await waitForHydration(page)
}

export async function submitSignIn(page: Page, kind: 'owner' | 'member' = 'owner'): Promise<void> {
  const email = kind === 'owner' ? 'maya@northstar.example' : 'theo@northstar.example'
  const button = kind === 'owner' ? 'Fill owner demo' : 'Fill member demo'
  await page.waitForLoadState('networkidle')
  // The form is interactive only after hydration. Retry the demo fill so a
  // click that lands a fraction early cannot turn this into a native GET.
  await expect(async () => {
    await page.getByRole('button', { name: button }).click()
    await expect(page.locator('#email')).toHaveValue(email)
  }).toPass({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(/\/app\/links/)
}

export async function signIn(page: Page, kind: 'owner' | 'member' = 'owner'): Promise<void> {
  await page.goto('/login')
  await submitSignIn(page, kind)
}

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export async function requestShortLink(
  path: string,
  options: {
    referrer?: string
    userAgent?: string
    country?: string
  } = {},
): Promise<Response> {
  const headers: Record<string, string> = {}
  if (options.referrer) headers.referer = options.referrer
  if (options.userAgent) headers['user-agent'] = options.userAgent
  if (options.country) headers['cf-ipcountry'] = options.country
  return fetch(`${BASE_URL}${path}`, { redirect: 'manual', headers })
}

export function totalClicks(page: Page): Promise<string> {
  return page
    .locator('.clicks-cell')
    .filter({ hasText: 'Total' })
    .locator('strong')
    .innerText()
}
