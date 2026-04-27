import type { Pool } from 'pg'

export async function down(pool: Pool) {
  await pool.query('ALTER TABLE job_tasks DROP COLUMN IF EXISTS processing_time_ms')
}
