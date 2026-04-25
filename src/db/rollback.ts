import { SQL } from 'bun'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, 'migrations')

const url = new URL(process.env.DATABASE_URL!)
const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
const client = new SQL({
  hostname: url.hostname,
  port: Number(url.port) || 5432,
  database: url.pathname.slice(1),
  username: url.username,
  password: process.env.DATABASE_PASSWORD!,
  tls: !isLocal,
})

const journal = await import('./migrations/meta/_journal.json')
const entries = [...journal.entries].reverse()

if (entries.length === 0) {
  console.log('No migrations to roll back.')
  process.exit(0)
}

const latest = entries[0]!
const downFile = resolve(migrationsFolder, `${latest.tag}.down.ts`)
const mod = await import(downFile)
await mod.down(client)
console.log(`Rolled back: ${latest.tag}`)

await client.end()
