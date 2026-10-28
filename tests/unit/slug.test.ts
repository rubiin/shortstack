import { describe, expect, it } from 'vitest'

import {
  generateSlug,
  normalizeSlug,
  RESERVED_SLUGS,
  suggestAvailableSlug,
} from '../../src/domain/slug'

describe('normalizeSlug', () => {
  it('trims, lowercases, and collapses spaces and underscores', () => {
    expect(normalizeSlug('  Spring__Field   Guide  ')).toEqual({
      ok: true,
      slug: 'spring-field-guide',
    })
  })

  it('normalises full-width characters', () => {
    expect(normalizeSlug('ｓｐｒｉｎｇ')).toEqual({ ok: true, slug: 'spring' })
  })

  it('rejects short, reserved, and unsafe values', () => {
    expect(normalizeSlug('ab')).toMatchObject({ ok: false })
    expect(normalizeSlug('API')).toMatchObject({ ok: false })
    expect(normalizeSlug('api')).toMatchObject({ ok: false })
    expect(normalizeSlug('hello world!')).toMatchObject({ ok: false })
    expect(normalizeSlug('-leading')).toMatchObject({ ok: false })
    expect(normalizeSlug('trailing-')).toMatchObject({ ok: false })
    expect(normalizeSlug('café')).toMatchObject({ ok: false })
    expect(normalizeSlug('')).toMatchObject({ ok: false })
  })

  it('accepts digits and interior hyphens', () => {
    expect(normalizeSlug('2026-launch-2')).toEqual({ ok: true, slug: '2026-launch-2' })
  })

  it('enforces the maximum length after normalisation', () => {
    expect(normalizeSlug('a'.repeat(64))).toEqual({ ok: true, slug: 'a'.repeat(64) })
    expect(normalizeSlug('a'.repeat(65))).toMatchObject({ ok: false })
  })

  it('documents the reserved route names', () => {
    for (const slug of RESERVED_SLUGS) {
      expect(normalizeSlug(slug)).toMatchObject({ ok: false })
    }
  })
})

describe('generated slugs', () => {
  it('uses the unambiguous alphabet', () => {
    const value = generateSlug((size) => new Uint8Array(size).fill(0))
    expect(value).toBe('aaaaaaaa')
  })

  it('truncates a suggested slug so the suffix fits', () => {
    const base = 'a'.repeat(64)
    const suggestion = suggestAvailableSlug(base, 2)
    expect(suggestion.length).toBe(64)
    expect(suggestion.endsWith('-2')).toBe(true)
    expect(normalizeSlug(suggestion)).toEqual({ ok: true, slug: suggestion })
  })
})
