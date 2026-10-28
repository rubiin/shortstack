import { describe, expect, it } from 'vitest'
import {
  claimNextJob,
  completeJob,
  enqueueJob,
  failJob,
  recoverStaleJobs,
} from '../../src/server/jobs'
import { getDb } from '../../src/server/db'
import { seedWorkspace } from '../helpers'

describe('job queue', () => {
  it('enqueues idempotently and claims work atomically', () => {
    seedWorkspace()
    const first = enqueueJob({
      kind: 'cache.purge',
      payload: { urls: ['https://links.test/one'] },
      idempotencyKey: 'purge:one',
      maxAttempts: 3,
    })
    const second = enqueueJob({
      kind: 'cache.purge',
      payload: { urls: ['https://links.test/two'] },
      idempotencyKey: 'purge:one',
    })
    expect(second.id).toBe(first.id)
    expect(second.payload).toEqual({ urls: ['https://links.test/one'] })

    const claimed = claimNextJob('worker-a', new Date().toISOString())
    expect(claimed).toMatchObject({ id: first.id, status: 'running', attempts: 1, lockedBy: 'worker-a' })
    expect(claimNextJob('worker-b', new Date().toISOString())).toBeNull()
    completeJob(first.id, 'worker-a')
    expect(getDb().prepare('SELECT status, finished_at FROM jobs WHERE id = ?').get(first.id)).toMatchObject({
      status: 'succeeded',
      finished_at: expect.any(String),
    })
  })

  it('retries failed jobs with backoff and eventually exhausts attempts', () => {
    seedWorkspace()
    const job = enqueueJob({
      kind: 'cache.purge',
      payload: { urls: [] },
      idempotencyKey: 'purge:retry',
      maxAttempts: 2,
    })
    claimNextJob('worker-a', new Date().toISOString())
    expect(failJob(job.id, 'worker-a', 'first failure')).toEqual({ retrying: true, attempts: 1 })
    expect(getDb().prepare('SELECT status, last_error FROM jobs WHERE id = ?').get(job.id)).toMatchObject({
      status: 'queued',
      last_error: 'first failure',
    })

    const retryAt = new Date(Date.now() + 10_000).toISOString()
    expect(claimNextJob('worker-a', retryAt)).toMatchObject({ id: job.id, attempts: 2 })
    expect(failJob(job.id, 'worker-a', 'second failure')).toEqual({ retrying: false, attempts: 2 })
    expect(getDb().prepare('SELECT status, last_error FROM jobs WHERE id = ?').get(job.id)).toMatchObject({
      status: 'failed',
      last_error: 'second failure',
    })
    expect(claimNextJob('worker-a', retryAt)).toBeNull()
  })

  it('recovers stale running jobs', () => {
    seedWorkspace()
    const job = enqueueJob({
      kind: 'cache.purge',
      payload: { urls: [] },
      idempotencyKey: 'purge:stale',
    })
    claimNextJob('worker-a', new Date().toISOString())
    getDb()
      .prepare('UPDATE jobs SET locked_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 20 * 60_000).toISOString(), job.id)
    expect(recoverStaleJobs()).toBe(1)
    expect(getDb().prepare('SELECT status, locked_by FROM jobs WHERE id = ?').get(job.id)).toMatchObject({
      status: 'queued',
      locked_by: null,
    })
  })
})
