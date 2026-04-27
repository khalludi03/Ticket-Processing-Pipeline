import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { config } from '../config.ts'
import * as schema from './schema.ts'

const url = new URL(config.DATABASE_URL)
const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'

export const pool = new Pool({
  host: url.hostname,
  port: Number(url.port) || 5432,
  database: url.pathname.slice(1),
  user: url.username,
  password: config.DATABASE_PASSWORD,
  ssl: isLocal ? false : { rejectUnauthorized: false },
})

export const db = drizzle(pool, { schema })
