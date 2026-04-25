import type { SQL } from 'bun'

export async function down(client: SQL) {
  await client`DROP TABLE IF EXISTS job_tasks CASCADE`
  await client`DROP TABLE IF EXISTS tickets CASCADE`
  await client`DROP TABLE IF EXISTS api_keys CASCADE`
  await client`DROP TYPE IF EXISTS ticket_status`
  await client`DROP TYPE IF EXISTS job_task_status`
  await client`DROP TYPE IF EXISTS phase`
  await client`DROP TYPE IF EXISTS channel`
  await client`DROP TYPE IF EXISTS priority_hint`
}
