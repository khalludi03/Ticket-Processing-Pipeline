import { defineConfig } from 'drizzle-kit'

const baseUrl = process.env.DATABASE_URL ?? ''
const password = encodeURIComponent(process.env.DATABASE_PASSWORD ?? '')
const url = new URL(baseUrl)
url.password = password

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: url.toString(),
  },
})
