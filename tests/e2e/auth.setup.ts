import { mkdirSync } from 'node:fs'

import { test } from '@playwright/test'

import { signIn } from './support'

const authDir = 'tests/e2e/.auth'
const ownerState = `${authDir}/owner.json`
const memberState = `${authDir}/member.json`

test('seeds reusable owner and member sessions', async ({ browser }) => {
  mkdirSync(authDir, { recursive: true })

  const ownerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' })
  const ownerPage = await ownerContext.newPage()
  await signIn(ownerPage, 'owner')
  await ownerContext.storageState({ path: ownerState })
  await ownerContext.close()

  // Use a separate context so signing in as the member does not revoke the
  // owner session whose storage state the other projects consume.
  const memberContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' })
  const memberPage = await memberContext.newPage()
  await signIn(memberPage, 'member')
  await memberContext.storageState({ path: memberState })
  await memberContext.close()
})
