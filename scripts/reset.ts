import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

import { getConfig } from '../src/server/config'
import { closeDb } from '../src/server/db'
import { seedDemoData } from './seed'

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Refusing to reset a production database. Pass --force if you truly mean it.')
  process.exit(1)
}

const config = getConfig()
closeDb()
for (const suffix of ['', '-shm', '-wal']) {
  const path = resolve(process.cwd(), config.DATABASE_PATH + suffix)
  if (existsSync(path)) rmSync(path)
}
const storagePath = resolve(process.cwd(), config.FILE_STORAGE_DIR)
if (existingDirectory(storagePath)) rmSync(storagePath, { recursive: true, force: true })

const result = seedDemoData()
if (!result.seeded) {
  console.error(`Reset did not seed: ${result.reason}`)
  process.exit(1)
}
console.log(`Reset complete. Database: ${config.DATABASE_PATH}`)
console.log('Owner: maya@northstar.example')
console.log('Member: theo@northstar.example')
console.log(`Password: ${config.SEED_PASSWORD}`)

function existingDirectory(path: string): boolean {
  try {
    return existsSync(path)
  } catch {
    return false
  }
}
