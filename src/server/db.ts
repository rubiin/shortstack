import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import Database from 'better-sqlite3'

type Db = Database.Database

let db: Db | null = null
let migrated = false

export function loadEnvFile(): void {
  if (process.env.SHORTSTACK_ENV_LOADED === '1') return
  process.env.SHORTSTACK_ENV_LOADED = '1'
  for (const name of ['.env.local', '.env']) {
    const file = resolve(process.cwd(), name)
    if (!existsSync(file)) continue
    try {
      process.loadEnvFile(file)
    } catch {
      // Environment files are optional; malformed files surface through config.
    }
  }
}

export function databasePath(): string {
  loadEnvFile()
  if (process.env.DATABASE_PATH) return resolve(process.cwd(), process.env.DATABASE_PATH)
  return resolve(process.cwd(), 'data/shortstack.db')
}

function migrationsDirectory(): string {
  const candidates = [
    resolve(process.cwd(), 'db/migrations'),
    join(dirname(new URL(import.meta.url).pathname), '../../db/migrations'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('Migration directory db/migrations was not found')
}

export function migrate(handle: Db = openDatabase()): void {
  handle.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)
  const applied = new Map(
    handle
      .prepare('SELECT id, checksum FROM schema_migrations')
      .all()
      .map((row) => {
        const record = row as { id: string; checksum: string }
        return [record.id, record.checksum]
      }),
  )

  const directory = migrationsDirectory()
  const files = readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const id = file.split('_')[0] ?? file
    const sql = readFileSync(join(directory, file), 'utf8')
    const checksum = createHash('sha256').update(sql).digest('hex')
    const previous = applied.get(id)
    if (previous) {
      if (previous !== checksum) {
        throw new Error(`Migration ${file} changed after it was applied`)
      }
      continue
    }
    const apply = handle.transaction(() => {
      handle.exec(sql)
      handle
        .prepare('INSERT INTO schema_migrations (id, name, checksum, applied_at) VALUES (?, ?, ?, ?)')
        .run(id, file, checksum, new Date().toISOString())
    })
    apply()
  }
  migrated = true
}

function openDatabase(): Db {
  const path = databasePath()
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }
  const handle = new Database(path)
  handle.pragma('journal_mode = WAL')
  handle.pragma('foreign_keys = ON')
  handle.pragma('busy_timeout = 5000')
  handle.pragma('synchronous = NORMAL')
  return handle
}

export function getDb(): Db {
  loadEnvFile()
  if (!db) {
    db = openDatabase()
  }
  if (!migrated) {
    migrate(db)
  }
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    migrated = false
  }
}

export function assertSchemaHealthy(handle: Db = getDb()): boolean {
  const result = handle.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'short_links'").get() as {
    n: number
  }
  return result.n === 1
}
