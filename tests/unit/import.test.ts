import { describe, expect, it } from 'vitest'
import {
  IMPORT_FIELDS,
  autoMap,
  importTemplate,
  normalizeImportRow,
  validateMapping,
} from '../../src/domain/import'

const headers = ['Slug', 'Destination URL', 'Campaign', 'Note', 'Expiry', 'Active']

describe('autoMap', () => {
  it('maps common header aliases case-insensitively', () => {
    expect(autoMap(headers)).toEqual({
      slug: 'Slug',
      destination_url: 'Destination URL',
      campaign: 'Campaign',
      note: 'Note',
      expires_at: 'Expiry',
      enabled: 'Active',
    })
  })

  it('returns null for unknown columns', () => {
    const mapping = autoMap(['url', 'path'])
    expect(mapping.slug).toBe('path')
    expect(mapping.destination_url).toBe('url')
    expect(mapping.campaign).toBeNull()
    expect(IMPORT_FIELDS).toContain('enabled')
  })
})

describe('validateMapping', () => {
  it('requires slug and destination mappings', () => {
    const errors = validateMapping({}, headers)
    expect(errors.map((error) => error.field)).toEqual(['slug', 'destination_url'])
  })

  it('rejects missing and repeated columns', () => {
    const repeated = validateMapping(
      { slug: 'Slug', destination_url: 'Slug' },
      headers,
    )
    expect(repeated.some((error) => /more than once/.test(error.message))).toBe(true)
    const missing = validateMapping({ slug: 'Nope', destination_url: 'Destination URL' }, headers)
    expect(missing.some((error) => /not in the CSV/.test(error.message))).toBe(true)
  })
})

describe('normalizeImportRow', () => {
  const mapping = {
    slug: 'Slug',
    destination_url: 'Destination URL',
    campaign: 'Campaign',
    note: 'Note',
    expires_at: 'Expiry',
    enabled: 'Active',
  }

  it('normalises a complete row', () => {
    const row = normalizeImportRow(
      {
        Slug: 'Spring Launch',
        'Destination URL': 'https://example.com/spring',
        Campaign: 'Spring',
        Note: 'Hero',
        Expiry: '2026-12-31',
        Active: 'yes',
      },
      mapping,
      new Date('2026-10-26T12:00:00.000Z'),
    )
    expect(row).toMatchObject({
      slug: 'spring-launch',
      destinationUrl: 'https://example.com/spring',
      campaignName: 'Spring',
      note: 'Hero',
      expiresAt: '2026-12-31T23:59:00.000Z',
      enabled: true,
      errors: {},
    })
  })

  it('defaults blank optional fields and treats missing enabled as true', () => {
    const row = normalizeImportRow(
      { Slug: 'launch', 'Destination URL': 'https://example.com' },
      mapping,
      new Date('2026-10-26T12:00:00.000Z'),
    )
    expect(row).toMatchObject({
      slug: 'launch',
      campaignName: null,
      note: null,
      expiresAt: null,
      enabled: true,
      errors: {},
    })
  })

  it('collects field-level errors', () => {
    const row = normalizeImportRow(
      {
        Slug: 'no',
        'Destination URL': 'javascript:alert(1)',
        Campaign: 'x'.repeat(81),
        Note: 'n'.repeat(501),
        Expiry: '2026-02-31',
        Active: 'maybe',
      },
      mapping,
      new Date('2026-10-26T12:00:00.000Z'),
    )
    expect(row.slug).toBeNull()
    expect(row.destinationUrl).toBeNull()
    expect(row.errors.slug).toMatch(/at least 3/)
    expect(row.errors.destination_url).toMatch(/http/)
    expect(row.errors.campaign).toMatch(/80/)
    expect(row.errors.note).toMatch(/500/)
    expect(row.errors.expires_at).toBeTruthy()
    expect(row.errors.enabled).toMatch(/true\/false/)
  })

  it('rejects an expiry in the past', () => {
    const row = normalizeImportRow(
      { Slug: 'launch', 'Destination URL': 'https://example.com', Expiry: '2026-10-25' },
      mapping,
      new Date('2026-10-26T12:00:00.000Z'),
    )
    expect(row.errors.expires_at).toBe('Expiry must be in the future.')
  })

  it('accepts explicit disabled values', () => {
    const row = normalizeImportRow(
      { Slug: 'launch', 'Destination URL': 'https://example.com', Active: '0' },
      mapping,
      new Date('2026-10-26T12:00:00.000Z'),
    )
    expect(row.enabled).toBe(false)
    expect(row.errors).toEqual({})
  })
})

describe('importTemplate', () => {
  it('round trips through the parser', () => {
    const template = importTemplate()
    expect(template.split('\n')[0]).toBe('slug,destination_url,campaign,note,expires_at,enabled')
    expect(template.split('\n')).toHaveLength(3)
  })
})
