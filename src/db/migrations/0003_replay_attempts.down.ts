import type { Pool } from 'pg'

export async function down(pool: Pool) {
  await pool.query('DROP TABLE IF EXISTS replay_attempts')
}
