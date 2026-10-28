import { describe, expect, it } from 'vitest'
import {
  effectiveLinkState,
  enumerateDays,
  expiryWarning,
  humanExpiry,
  isRedirectable,
  parseDateTimeLocalUtc,
  resolveDateRange,
  toDateTimeLocal,
} from '../../src/domain/time'

const now = new Date('2026-10-26T12:00:00.000Z')

describe('effectiveLinkState', () => {
  it('prefers archived over every other state', () => {
    expect(
      effectiveLinkState({ enabled: false, expiresAt: '2020-01-01T00:00:00.000Z', archivedAt: '2026-01-01T00:00:00.000Z' }, now),
    ).toBe('archived')
  })

  it('reports disabled before expired', () => {
    expect(
      effectiveLinkState({ enabled: false, expiresAt: '2020-01-01T00:00:00.000Z', archivedAt: null }, now),
    ).toBe('disabled')
  })

  it('treats the exact expiry instant as expired', () => {
    expect(
      effectiveLinkState(
        { enabled: true, expiresAt: '2026-10-26T12:00:00.000Z', archivedAt: null },
        now,
      ),
    ).toBe('expired')
  })

  it('redirects only active links', () => {
    expect(isRedirectable({ enabled: true, expiresAt: '2026-10-26T12:00:01.000Z', archivedAt: null }, now)).toBe(true)
    expect(isRedirectable({ enabled: false, expiresAt: null, archivedAt: null }, now)).toBe(false)
  })

  it('warns only for enabled active links inside the warning window', () => {
    expect(
      expiryWarning({ enabled: true, expiresAt: '2026-10-30T12:00:00.000Z', archivedAt: null }, now),
    ).toBe(true)
    expect(
      expiryWarning({ enabled: true, expiresAt: '2026-11-10T12:00:00.000Z', archivedAt: null }, now),
    ).toBe(false)
    expect(
      expiryWarning({ enabled: false, expiresAt: '2026-10-30T12:00:00.000Z', archivedAt: null }, now),
    ).toBe(false)
  })
})

describe('UTC date input', () => {
  it('parses minute precision as UTC', () => {
    expect(parseDateTimeLocalUtc('2026-10-26T09:30')).toBe('2026-10-26T09:30:00.000Z')
  })

  it('rejects impossible calendar dates instead of rolling them over', () => {
    expect(parseDateTimeLocalUtc('2026-02-31T09:30')).toBeNull()
    expect(parseDateTimeLocalUtc('2026-13-01T09:30')).toBeNull()
  })

  it('rejects malformed values', () => {
    expect(parseDateTimeLocalUtc('2026-10-26')).toBeNull()
    expect(parseDateTimeLocalUtc('tomorrow')).toBeNull()
    expect(parseDateTimeLocalUtc('')).toBeNull()
  })

  it('formats an existing ISO timestamp for a datetime-local input', () => {
    expect(toDateTimeLocal('2026-10-26T09:30:00.000Z')).toBe('2026-10-26T09:30')
    expect(toDateTimeLocal(null)).toBe('')
  })
})

describe('resolveDateRange', () => {
  it('defaults to 30 inclusive UTC days ending today', () => {
    const range = resolveDateRange({}, now)
    expect(range).toEqual({
      from: '2026-09-27',
      to: '2026-10-26',
      days: 30,
      previousFrom: '2026-08-28',
      previousTo: '2026-09-26',
    })
  })

  it('honours explicit bounds and builds the immediately preceding window', () => {
    const range = resolveDateRange({ from: '2026-10-01', to: '2026-10-10' }, now)
    expect(range.days).toBe(10)
    expect(range.previousFrom).toBe('2026-09-21')
    expect(range.previousTo).toBe('2026-09-30')
  })

  it('swaps reversed bounds', () => {
    const range = resolveDateRange({ from: '2026-10-10', to: '2026-10-01' }, now)
    expect(range.from).toBe('2026-10-01')
    expect(range.to).toBe('2026-10-10')
  })

  it('falls back to defaults for invalid days and caps the span', () => {
    const range = resolveDateRange({ from: 'not-a-day', to: '2026-10-10', days: 'nope' }, now)
    expect(range.to).toBe('2026-10-10')
    expect(range.days).toBe(30)
    const capped = resolveDateRange({ from: '2020-01-01', to: '2026-01-01' }, now)
    expect(capped.days).toBe(366)
  })
})

describe('enumerateDays', () => {
  it('enumerates across month and leap-day boundaries', () => {
    expect(enumerateDays('2024-02-27', '2024-03-01')).toEqual([
      '2024-02-27',
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ])
  })
})

describe('humanExpiry', () => {
  it('describes expiry without guessing a timezone', () => {
    expect(humanExpiry(null, now)).toBe('No expiry')
    expect(humanExpiry('2026-10-26T11:00:00.000Z', now)).toBe('Expired')
    expect(humanExpiry('2026-10-26T12:30:00.000Z', now)).toBe('Expires in under an hour')
    expect(humanExpiry('2026-10-28T11:00:00.000Z', now)).toBe('Expires in 47h')
    expect(humanExpiry('2026-11-02T12:00:00.000Z', now)).toBe('Expires in 7 days')
  })
})
