import type { Pool } from 'pg'

export async function down(pool: Pool) {
  const statements = [
    'DROP TABLE IF EXISTS job_tasks CASCADE',
    'DROP TABLE IF EXISTS tickets CASCADE',
    'DROP TABLE IF EXISTS api_keys CASCADE',
    'DROP TYPE IF EXISTS ticket_status',
    'DROP TYPE IF EXISTS job_task_status',
    'DROP TYPE IF EXISTS phase',
    'DROP TYPE IF EXISTS channel',
    'DROP TYPE IF EXISTS priority_hint',
  ]
  for (const sql of statements) {
    await pool.query(sql)
  }
}
