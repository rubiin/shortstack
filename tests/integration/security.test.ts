import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { RateLimitError } from '../../src/domain/authz'
import { createSession, resolveSession } from '../../src/server/auth'
import { getDb } from '../../src/server/db'
import { consumeRateLimit, rateLimitOrThrow } from '../../src/server/rate-limit'
import { seedWorkspace } from '../helpers'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

describe('sessions', () => {
  it('stores only a hash of the opaque session token', () => {
    const fixture = seedWorkspace()
    const session = createSession(fixture.userId)
    const db = getDb()
    const stored = db.prepare('SELECT id FROM sessions').all() as Array<{ id: string }>
    expect(stored).toHaveLength(1)
    expect(stored[0]!.id).toBe(hashToken(session.token))
    expect(stored[0]!.id).not.toBe(session.token)
    expect(resolveSession(session.token)).toMatchObject({
      id: fixture.userId,
      workspaceId: fixture.workspaceId,
      email: fixture.user.email,
      role: 'owner',
    })
  })

  it('rejects unknown and oversized tokens', () => {
    seedWorkspace()
    expect(resolveSession('unknown')).toBeNull()
    expect(resolveSession('x'.repeat(257))).toBeNull()
  })

  it('expires sessions and deletes the row', () => {
    const fixture = seedWorkspace()
    const session = createSession(fixture.userId)
    const db = getDb()
    db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(
      '2020-01-01T00:00:00.000Z',
      hashToken(session.token),
    )
    expect(resolveSession(session.token)).toBeNull()
    expect(db.prepare('SELECT count(*) AS n FROM sessions').get()).toMatchObject({ n: 0 })
  })

  it('rejects sessions for disabled accounts', () => {
    const fixture = seedWorkspace()
    const session = createSession(fixture.userId)
    getDb()
      .prepare('UPDATE users SET disabled_at = ? WHERE id = ?')
      .run(new Date().toISOString(), fixture.userId)
    expect(resolveSession(session.token)).toBeNull()
  })
})

describe('rate limits', () => {
  it('counts requests inside a window and rejects over the limit', () => {
    const now = 1_000_000
    expect(consumeRateLimit({ key: 'test:key', limit: 2, windowMs: 60_000 }, now)).toMatchObject({
      remaining: 1,
    })
    expect(
      consumeRateLimit({ key: 'test:key', limit: 2, windowMs: 60_000 }, now + 1),
    ).toMatchObject({ remaining: 0 })
    expect(() =>
      consumeRateLimit({ key: 'test:key', limit: 2, windowMs: 60_000 }, now + 2),
    ).toThrow(RateLimitError)
  })

  it('starts a fresh window after the old one elapses', () => {
    const now = 2_000_000
    consumeRateLimit({ key: 'test:window', limit: 1, windowMs: 1_000 }, now)
    expect(() =>
      consumeRateLimit({ key: 'test:window', limit: 1, windowMs: 1_000 }, now + 500),
    ).toThrow(RateLimitError)
    expect(
      consumeRateLimit({ key: 'test:window', limit: 1, windowMs: 1_000 }, now + 1_001),
    ).toMatchObject({
      remaining: 0,
    })
  })

  it('keeps separate hashed scopes independent', () => {
    rateLimitOrThrow('login', 'one@example.com', 1, 60_000)
    expect(() => rateLimitOrThrow('login', 'one@example.com', 1, 60_000)).toThrow(RateLimitError)
    expect(() => rateLimitOrThrow('login', 'two@example.com', 1, 60_000)).not.toThrow()
    expect(() => rateLimitOrThrow('redirect', 'one@example.com', 1, 60_000)).not.toThrow()
    expect(getDb().prepare('SELECT count(*) AS n FROM rate_limits').get()).toMatchObject({ n: 3 })
  })
})
