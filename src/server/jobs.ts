import { getDb } from './db'
import { newId, nowIso } from './ids'
import { logger } from './log'

export type JobKind = 'cache.purge' | 'export.generate' | 'maintenance.daily'

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export type Job = {
  id: string
  workspaceId: string | null
  kind: JobKind
  payload: Record<string, unknown>
  status: JobStatus
  attempts: number
  maxAttempts: number
  idempotencyKey: string
  runAfter: string
  lockedAt: string | null
  lockedBy: string | null
  lastError: string | null
  correlationId: string
  createdAt: string
  updatedAt: string
  finishedAt: string | null
}

type JobRow = {
  id: string
  workspace_id: string | null
  kind: string
  payload_json: string
  status: JobStatus
  attempts: number
  max_attempts: number
  idempotency_key: string
  run_after: string
  locked_at: string | null
  locked_by: string | null
  last_error: string | null
  correlation_id: string
  created_at: string
  updated_at: string
  finished_at: string | null
}

function mapJob(row: JobRow): Job {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind as JobKind,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    idempotencyKey: row.idempotency_key,
    runAfter: row.run_after,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    lastError: row.last_error,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  }
}

export type EnqueueJobInput = {
  kind: JobKind
  payload: Record<string, unknown>
  idempotencyKey: string
  workspaceId?: string | null
  runAfter?: string
  maxAttempts?: number
}

export function enqueueJob(input: EnqueueJobInput): Job {
  const db = getDb()
  const timestamp = nowIso()
  const id = newId('job')
  db.prepare(
    `INSERT INTO jobs (id, workspace_id, kind, payload_json, status, attempts, max_attempts, idempotency_key, run_after, correlation_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(idempotency_key) DO NOTHING`,
  ).run(
    id,
    input.workspaceId ?? null,
    input.kind,
    JSON.stringify(input.payload),
    input.maxAttempts ?? 5,
    input.idempotencyKey,
    input.runAfter ?? timestamp,
    newId('corr'),
    timestamp,
    timestamp,
  )
  const row = db
    .prepare('SELECT * FROM jobs WHERE idempotency_key = ?')
    .get(input.idempotencyKey) as JobRow
  return mapJob(row)
}

export function claimNextJob(workerId: string, now = nowIso()): Job | null {
  const db = getDb()
  const row = db
    .prepare(
      `UPDATE jobs
       SET status = 'running', attempts = attempts + 1, locked_at = ?, locked_by = ?, updated_at = ?
       WHERE id = (
         SELECT id FROM jobs
         WHERE status = 'queued' AND run_after <= ?
         ORDER BY run_after ASC, created_at ASC
         LIMIT 1
       ) AND status = 'queued'
       RETURNING *`,
    )
    .get(now, workerId, now, now) as JobRow | undefined
  return row ? mapJob(row) : null
}

export function completeJob(jobId: string, workerId: string): void {
  const db = getDb()
  const timestamp = nowIso()
  db.prepare(
    "UPDATE jobs SET status = 'succeeded', locked_at = NULL, locked_by = NULL, finished_at = ?, updated_at = ? WHERE id = ? AND locked_by = ?",
  ).run(timestamp, timestamp, jobId, workerId)
}

export function failJob(
  jobId: string,
  workerId: string,
  error: string,
): { retrying: boolean; attempts: number } {
  const db = getDb()
  const row = db
    .prepare('SELECT attempts, max_attempts FROM jobs WHERE id = ? AND locked_by = ?')
    .get(jobId, workerId) as { attempts: number; max_attempts: number } | undefined
  if (!row) return { retrying: false, attempts: 0 }
  const timestamp = nowIso()
  const retrying = row.attempts < row.max_attempts
  const delaySeconds = Math.min(300, 5 * 2 ** Math.max(0, row.attempts - 1))
  const runAfter = new Date(Date.now() + delaySeconds * 1000).toISOString()
  db.prepare(
    `UPDATE jobs SET status = ?, locked_at = NULL, locked_by = NULL, last_error = ?, run_after = ?, updated_at = ?, finished_at = ?
     WHERE id = ? AND locked_by = ?`,
  ).run(
    retrying ? 'queued' : 'failed',
    error.slice(0, 2_000),
    retrying ? runAfter : timestamp,
    timestamp,
    retrying ? null : timestamp,
    jobId,
    workerId,
  )
  if (retrying) {
    logger.warn('job will retry', { jobId, attempts: row.attempts, runAfter, error })
  } else {
    logger.error('job exhausted retries', { jobId, attempts: row.attempts, error })
  }
  return { retrying, attempts: row.attempts }
}

export function recoverStaleJobs(staleAfterMs = 10 * 60 * 1000): number {
  const db = getDb()
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString()
  const timestamp = nowIso()
  const result = db
    .prepare(
      `UPDATE jobs
       SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
           locked_at = NULL, locked_by = NULL, updated_at = ?, finished_at = CASE WHEN attempts >= max_attempts THEN ? ELSE NULL END
       WHERE status = 'running' AND locked_at < ?`,
    )
    .run(timestamp, timestamp, cutoff)
  return result.changes
}

export function ensureDailyMaintenanceJob(now = new Date()): Job {
  const day = now.toISOString().slice(0, 10)
  return enqueueJob({
    kind: 'maintenance.daily',
    payload: { day },
    idempotencyKey: `maintenance:${day}`,
    runAfter: now.toISOString(),
    maxAttempts: 3,
  })
}

export function getJobCounts(): Record<JobStatus, number> {
  const db = getDb()
  const counts: Record<JobStatus, number> = {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
  }
  for (const row of db
    .prepare('SELECT status, count(*) AS n FROM jobs GROUP BY status')
    .all() as Array<{
    status: JobStatus
    n: number
  }>) {
    counts[row.status] = row.n
  }
  return counts
}
