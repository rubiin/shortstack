import { describe, expect, it } from 'vitest'
import { normalizeDestination, schemeOf } from '../../src/domain/destination'

describe('normalizeDestination', () => {
  it('accepts http and https URLs and preserves query strings', () => {
    expect(normalizeDestination('https://example.com/path?utm_source=shortstack&token=secret')).toEqual({
      ok: true,
      url: 'https://example.com/path?utm_source=shortstack&token=secret',
    })
    expect(normalizeDestination('http://example.com')).toMatchObject({ ok: true })
  })

  it('trims surrounding whitespace and normalises the URL', () => {
    expect(normalizeDestination('  https://Example.com/Path  ')).toEqual({
      ok: true,
      url: 'https://example.com/Path',
    })
  })

  it('rejects non-HTTP schemes', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com', 'mailto:a@b.c']) {
      expect(normalizeDestination(value)).toMatchObject({ ok: false })
    }
  })

  it('rejects embedded credentials', () => {
    expect(normalizeDestination('https://user:pass@example.com')).toMatchObject({ ok: false })
    expect(normalizeDestination('https://user@example.com')).toMatchObject({ ok: false })
  })

  it('rejects control characters, spaces, and max-length overflow', () => {
    expect(normalizeDestination('https://example.com/\u0000evil')).toMatchObject({ ok: false })
    expect(normalizeDestination('https://example.com/a b')).toMatchObject({ ok: false })
    expect(normalizeDestination(`https://example.com/${'a'.repeat(2048)}`)).toMatchObject({ ok: false })
  })

  it('rejects malformed and missing hosts', () => {
    expect(normalizeDestination('example.com/path')).toMatchObject({ ok: false })
    expect(normalizeDestination('https://')).toMatchObject({ ok: false })
    expect(normalizeDestination('https://example..com')).toMatchObject({ ok: false })
    expect(normalizeDestination('')).toMatchObject({ ok: false })
  })

  it('exposes a safe scheme helper', () => {
    expect(schemeOf('https://example.com')).toBe('https:')
    expect(schemeOf('not a url')).toBe('')
  })
})
