import { setTimeout as sleep } from 'node:timers/promises'

import { getCachePurgeAdapter } from './adapters/cloudflare'
import { getStorage } from './adapters/storage'
import { produceExportFile } from './analytics'
import { getConfig } from './config'
import { getDb } from './db'
import { nowIso } from './ids'
import {
  claimNextJob,
  completeJob,
  ensureDailyMaintenanceJob,
  failJob,
  recoverStaleJobs,
  type Job,
} from './jobs'
import { errorDetails, logger, runWithCorrelationId } from './log'

const workerId = `${getConfig().WORKER_ID}-${process.pid}`

async function updateExportFailure(
  exportId: string,
  message: string,
  final: boolean,
): Promise<void> {
  const db = getDb()
  const timestamp = nowIso()
  db.prepare(
    `UPDATE exports SET last_error = ?, status = ?, attempts = attempts + 1, updated_at = ?, finished_at = CASE WHEN ? = 1 THEN ? ELSE NULL END
     WHERE id = ?`,
  ).run(
    message.slice(0, 2_000),
    final ? 'failed' : 'queued',
    timestamp,
    final ? 1 : 0,
    timestamp,
    exportId,
  )
}

async function processJob(job: Job): Promise<void> {
  if (job.kind === 'cache.purge') {
    const urls = Array.isArray(job.payload.urls) ? (job.payload.urls as string[]) : []
    const result = await getCachePurgeAdapter().purge(urls)
    if (!result.ok) throw new Error(`cache purge ${result.code}: ${result.message}`)
    return
  }

  if (job.kind === 'export.generate') {
    const exportId = String(job.payload.exportId ?? '')
    if (!exportId) throw new Error('Export job is missing exportId')
    const db = getDb()
    const row = db
      .prepare('SELECT status, workspace_id FROM exports WHERE id = ?')
      .get(exportId) as { status: string; workspace_id: string } | undefined
    if (!row) throw new Error(`Export ${exportId} no longer exists`)
    if (row.status === 'ready') return
    db.prepare("UPDATE exports SET status = 'running', updated_at = ? WHERE id = ?").run(
      nowIso(),
      exportId,
    )
    const file = await produceExportFile(exportId)
    const config = getConfig()
    const timestamp = nowIso()
    const expiresAt = new Date(Date.now() + config.EXPORT_RETENTION_DAYS * 86_400_000).toISOString()
    db.prepare(
      `UPDATE exports SET status = 'ready', file_key = ?, file_name = ?, row_count = ?, last_error = NULL,
       updated_at = ?, finished_at = ?, expires_at = ? WHERE id = ?`,
    ).run(file.key, file.fileName, file.rows, timestamp, timestamp, expiresAt, exportId)
    logger.info('analytics export ready', { exportId, rows: file.rows })
    return
  }

  if (job.kind === 'maintenance.daily') {
    const db = getDb()
    const config = getConfig()
    const timestamp = nowIso()

    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(timestamp)
    db.prepare('DELETE FROM rate_limits WHERE window_start < ?').run(
      Date.now() - 24 * 60 * 60 * 1000,
    )

    const clickCutoff = new Date()
    clickCutoff.setUTCMonth(clickCutoff.getUTCMonth() - config.CLICK_RETENTION_MONTHS)
    db.prepare('DELETE FROM click_events WHERE day < ?').run(clickCutoff.toISOString().slice(0, 10))

    const rawCutoff = new Date(
      Date.now() - config.RAW_IMPORT_RETENTION_DAYS * 86_400_000,
    ).toISOString()
    // Clear raw CSV text (and raw row payloads) after the retention window while
    // preserving normalized import rows and the links they created.
    const oldBatches = db
      .prepare(
        `SELECT id FROM import_batches
         WHERE raw_csv IS NOT NULL
           AND (raw_expires_at <= ? OR (completed_at IS NOT NULL AND completed_at < ?))`,
      )
      .all(timestamp, rawCutoff) as Array<{ id: string }>
    for (const batch of oldBatches) {
      const clear = db.transaction(() => {
        db.prepare("UPDATE import_rows SET raw_json = '{}' WHERE batch_id = ?").run(batch.id)
        db.prepare(
          'UPDATE import_batches SET raw_csv = NULL, mapping_json = NULL WHERE id = ?',
        ).run(batch.id)
      })
      clear()
    }

    const staleExports = db
      .prepare(
        "SELECT id, file_key FROM exports WHERE status = 'ready' AND expires_at IS NOT NULL AND expires_at <= ?",
      )
      .all(timestamp) as Array<{ id: string; file_key: string | null }>
    const storage = getStorage()
    for (const item of staleExports) {
      if (item.file_key) {
        try {
          await storage.delete(item.file_key)
        } catch (error) {
          logger.warn('could not remove expired export file', {
            exportId: item.id,
            ...errorDetails(error),
          })
          continue
        }
      }
      db.prepare(
        "UPDATE exports SET status = 'expired', file_key = NULL, updated_at = ? WHERE id = ?",
      ).run(timestamp, item.id)
    }
    logger.info('maintenance complete', {
      clearedImportBatches: oldBatches.length,
      expiredExports: staleExports.length,
    })
    return
  }

  throw new Error(`Unknown job kind: ${(job as { kind: string }).kind}`)
}

async function tick(): Promise<boolean> {
  const job = claimNextJob(workerId)
  if (!job) return false
  await runWithCorrelationId(job.correlationId, async () => {
    logger.info('job started', { jobId: job.id, kind: job.kind, attempt: job.attempts })
    try {
      await processJob(job)
      completeJob(job.id, workerId)
      logger.info('job succeeded', { jobId: job.id, kind: job.kind })
    } catch (error) {
      const details = errorDetails(error)
      const outcome = failJob(job.id, workerId, details.message)
      if (job.kind === 'export.generate') {
        const exportId = String(job.payload.exportId ?? '')
        if (exportId) await updateExportFailure(exportId, details.message, !outcome.retrying)
      }
    }
  })
  return true
}

export async function runWorker(
  options: { once?: boolean; signal?: AbortSignal } = {},
): Promise<void> {
  recoverStaleJobs()
  ensureDailyMaintenanceJob()
  if (options.once) {
    while (await tick()) {
      // Drain the queue in tests and one-shot runs.
    }
    return
  }
  logger.info('worker started', { workerId })
  let stopped = false
  const stop = () => {
    stopped = true
  }
  options.signal?.addEventListener('abort', stop, { once: true })
  while (!stopped) {
    const didWork = await tick()
    if (!didWork)
      await sleep(getConfig().WORKER_POLL_MS, undefined, { signal: options.signal }).catch(
        () => undefined,
      )
    ensureDailyMaintenanceJob()
  }
  logger.info('worker stopped', { workerId })
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  process.on('SIGTERM', () => process.exit(0))
  process.on('SIGINT', () => process.exit(0))
  runWorker().catch((error) => {
    logger.error('worker crashed', errorDetails(error))
    process.exit(1)
  })
}
