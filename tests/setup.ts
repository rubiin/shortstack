import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach } from 'vitest'

// Isolate every test file from the developer database and local storage. Keep
// this in /tmp so a failed run can never touch ./data or ./storage.
const root = process.env.SHORTSTACK_TEST_ROOT ?? join(tmpdir(), 'shortstack-tests')
mkdirSync(root, { recursive: true })

process.env.NODE_ENV = 'test'
process.env.SHORTSTACK_ENV_LOADED = '1'
process.env.DATABASE_PATH = join(root, 'test.db')
process.env.FILE_STORAGE_DIR = join(root, 'storage')
process.env.APP_ORIGIN = 'http://127.0.0.1:3100'
process.env.SHORT_LINK_ORIGIN = 'http://127.0.0.1:3100'
process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters'
process.env.FILE_SIGNING_SECRET = 'test-file-secret-at-least-32-characters'
process.env.CLOUDFLARE_PURGE_ENABLED = 'false'
process.env.SEED_PASSWORD = 'shortstack-test-password'

async function reset() {
  const { closeDb } = await import('../src/server/db')
  const { setStorageForTests } = await import('../src/server/adapters/storage')
  const { setCachePurgeAdapterForTests } = await import('../src/server/adapters/cloudflare')
  closeDb()
  setStorageForTests(null)
  setCachePurgeAdapterForTests(null)
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${process.env.DATABASE_PATH}${suffix}`, { force: true })
  }
  rmSync(process.env.FILE_STORAGE_DIR as string, { recursive: true, force: true })
  mkdirSync(process.env.FILE_STORAGE_DIR as string, { recursive: true })
}

beforeEach(reset)
