import { drizzle } from 'drizzle-orm/bun-sql'
import { SQL } from 'bun'
import { config } from '../config'
import * as schema from './schema'

const url = new URL(config.DATABASE_URL)
const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'

export const client = new SQL({
  hostname: url.hostname,
  port: Number(url.port) || 5432,
  database: url.pathname.slice(1),
  username: url.username,
  password: config.DATABASE_PASSWORD,
  tls: !isLocal,
})

export const db = drizzle(client, { schema })
