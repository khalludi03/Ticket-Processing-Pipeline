import 'dotenv/config'
import { Pool } from 'pg'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, 'migrations')

const url = new URL(process.env.DATABASE_URL!)
const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'

const pool = new Pool({
  host: url.hostname,
  port: Number(url.port) || 5432,
  database: url.pathname.slice(1),
  user: url.username,
  password: process.env.DATABASE_PASSWORD!,
  ssl: isLocal ? false : { rejectUnauthorized: false },
})

const journal = JSON.parse(readFileSync(resolve(migrationsFolder, 'meta/_journal.json'), 'utf-8')) as {
  entries: { tag: string }[]
}
const entries = [...journal.entries].reverse()

if (entries.length === 0) {
  console.log('No migrations to roll back.')
  process.exit(0)
}

const latest = entries[0]!
const downFile = resolve(migrationsFolder, `${latest.tag}.down.ts`)
const mod = await import(downFile) as { down: (pool: Pool) => Promise<void> }
await mod.down(pool)
console.log(`Rolled back: ${latest.tag}`)

await pool.end()
