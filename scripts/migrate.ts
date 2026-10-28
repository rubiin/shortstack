import { getConfig } from '../src/server/config'
import { getDb, migrate } from '../src/server/db'

migrate()
const db = getDb()
const applied = db.prepare('SELECT id, name, applied_at FROM schema_migrations ORDER BY id').all() as Array<{
  id: string
  name: string
  applied_at: string
}>
console.log(`Database ready at ${getConfig().DATABASE_PATH}`)
for (const row of applied) console.log(`${row.id}  ${row.name}  ${row.applied_at}`)
