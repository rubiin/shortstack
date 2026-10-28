import { describe, expect, it } from 'vitest'
import {
  AuthorizationError,
  belongsToWorkspace,
  canArchiveLinks,
  canRestoreLinks,
  ConflictError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '../../src/domain/authz'
import { hashPassword, verifyPassword } from '../../src/server/password'
import { hashedRateLimitKey } from '../../src/server/rate-limit'

describe('role authorization', () => {
  it('allows only owners to archive and restore links', () => {
    expect(canArchiveLinks({ role: 'owner' })).toBe(true)
    expect(canArchiveLinks({ role: 'member' })).toBe(false)
    expect(canRestoreLinks({ role: 'owner' })).toBe(true)
    expect(canRestoreLinks({ role: 'member' })).toBe(false)
  })

  it('enforces workspace tenancy', () => {
    expect(belongsToWorkspace({ workspaceId: 'ws_a' }, 'ws_a')).toBe(true)
    expect(belongsToWorkspace({ workspaceId: 'ws_a' }, 'ws_b')).toBe(false)
  })
})

describe('typed errors', () => {
  it('carries stable HTTP statuses and safe messages', () => {
    expect(new AuthorizationError().status).toBe(403)
    expect(new NotFoundError().status).toBe(404)
    expect(new ConflictError().status).toBe(409)
    expect(new ValidationError('bad', { slug: 'no' })).toMatchObject({ status: 400, fields: { slug: 'no' } })
    expect(new RateLimitError(12)).toMatchObject({ status: 429, retryAfterSeconds: 12 })
  })
})

describe('password hashing', () => {
  it('verifies the correct password and rejects the wrong one', () => {
    const hash = hashPassword('correct horse battery staple')
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true)
    expect(verifyPassword('wrong', hash)).toBe(false)
  })

  it('uses a fresh salt for every hash', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'))
  })

  it('rejects malformed stored hashes without throwing', () => {
    expect(verifyPassword('password', 'not-a-hash')).toBe(false)
    expect(verifyPassword('password', 'scrypt$bad')).toBe(false)
  })
})

describe('rate-limit keys', () => {
  it('hashes raw identifiers', () => {
    const key = hashedRateLimitKey('login', 'maya@example.com')
    expect(key.startsWith('login:')).toBe(true)
    expect(key).not.toContain('maya')
    expect(key).toBe(hashedRateLimitKey('login', 'maya@example.com'))
    expect(key).not.toBe(hashedRateLimitKey('login', 'theo@example.com'))
  })
})
