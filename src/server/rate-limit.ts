import { createHash } from 'node:crypto'
import { getDb } from './db'
import { nowIso } from './ids'
import { RateLimitError, ValidationError } from '~/domain/authz'

export type RateLimitOptions = {
  key: string
  limit: number
  windowMs: number
}

export function consumeRateLimit(options: RateLimitOptions, now = Date.now()): { remaining: number; resetAt: number } {
  const db = getDb()
  const windowStart = now - options.windowMs
  const updatedAt = new Date(now).toISOString()
  const transaction = db.transaction(() => {
    const row = db.prepare('SELECT window_start, count FROM rate_limits WHERE key = ?').get(options.key) as
      | { window_start: number; count: number }
      | undefined
    if (!row || row.window_start <= windowStart) {
      db.prepare(
        'INSERT INTO rate_limits (key, window_start, count, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = 1, updated_at = excluded.updated_at',
      ).run(options.key, now, updatedAt)
      return { remaining: options.limit - 1, resetAt: now + options.windowMs }
    }
    if (row.count >= options.limit) {
      throw new RateLimitError(Math.ceil((row.window_start + options.windowMs - now) / 1000))
    }
    db.prepare('UPDATE rate_limits SET count = count + 1, updated_at = ? WHERE key = ?').run(updatedAt, options.key)
    return { remaining: options.limit - row.count - 1, resetAt: row.window_start + options.windowMs }
  })
  return transaction()
}

export function hashedRateLimitKey(scope: string, value: string): string {
  return `${scope}:${createHash('sha256').update(value).digest('hex').slice(0, 32)}`
}

export function rateLimitOrThrow(scope: string, value: string, limit: number, windowMs: number): void {
  consumeRateLimit({
    key: hashedRateLimitKey(scope, value),
    limit,
    windowMs,
  })
}

export function validateEmail(email: string): string {
  const trimmed = email.trim().toLowerCase()
  if (trimmed.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new ValidationError('Enter a valid email address.', { email: 'Enter a valid email address.' })
  }
  return trimmed
}
