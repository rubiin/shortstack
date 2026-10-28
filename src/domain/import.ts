import { normalizeDestination } from './destination'
import { normalizeSlug } from './slug'
import { parseDateTimeLocalUtc } from './time'

export const IMPORT_FIELDS = ['slug', 'destination_url', 'campaign', 'note', 'expires_at', 'enabled'] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]
export type ImportMapping = Partial<Record<ImportField, string | null>>

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  slug: 'Short slug',
  destination_url: 'Destination URL',
  campaign: 'Campaign',
  note: 'Note',
  expires_at: 'Expiry',
  enabled: 'Enabled',
}

const aliases: Record<ImportField, string[]> = {
  slug: ['slug', 'short_slug', 'short slug', 'path', 'shortlink', 'short_link'],
  destination_url: ['destination', 'destination_url', 'destination url', 'url', 'long_url', 'target'],
  campaign: ['campaign', 'campaign_name', 'tag', 'tags'],
  note: ['note', 'notes', 'description', 'memo'],
  expires_at: ['expires_at', 'expiry', 'expires', 'expiration', 'expire_at'],
  enabled: ['enabled', 'active', 'status'],
}

export function autoMap(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {}
  for (const field of IMPORT_FIELDS) {
    const found = headers.find((header) => {
      const normalized = header.trim().toLowerCase()
      return aliases[field].includes(normalized)
    })
    mapping[field] = found ?? null
  }
  return mapping
}

export function validateMapping(mapping: ImportMapping, headers: string[]): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = []
  for (const required of ['slug', 'destination_url'] as const) {
    const header = mapping[required]
    if (!header) errors.push({ field: required, message: `Map a column to ${IMPORT_FIELD_LABELS[required]}.` })
    else if (!headers.includes(header)) {
      errors.push({ field: required, message: `Mapped column "${header}" is not in the CSV.` })
    }
  }
  const used = new Set<string>()
  for (const field of IMPORT_FIELDS) {
    const header = mapping[field]
    if (!header) continue
    if (used.has(header)) errors.push({ field, message: `Column "${header}" is mapped more than once.` })
    used.add(header)
    if (!headers.includes(header)) errors.push({ field, message: `Mapped column "${header}" is not in the CSV.` })
  }
  return errors
}

export type NormalizedImportRow = {
  slug: string | null
  destinationUrl: string | null
  campaignName: string | null
  note: string | null
  expiresAt: string | null
  enabled: boolean
  errors: Record<string, string>
}

function parseEnabled(value: string): { enabled: boolean; error?: string } {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return { enabled: true }
  if (['true', '1', 'yes', 'active', 'enabled'].includes(normalized)) return { enabled: true }
  if (['false', '0', 'no', 'disabled', 'inactive'].includes(normalized)) return { enabled: false }
  return { enabled: true, error: 'Enabled must be true/false, yes/no, or 1/0.' }
}

function parseExpiry(value: string): { expiresAt: string | null; error?: string } {
  const trimmed = value.trim()
  if (!trimmed) return { expiresAt: null }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = parseDateTimeLocalUtc(`${trimmed}T23:59`)
    if (!parsed) return { expiresAt: null, error: 'Expiry is not a valid date.' }
    return { expiresAt: parsed }
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(trimmed)) {
    const normalized = trimmed.replace(' ', 'T').replace(/Z$/, '')
    const parsed = parseDateTimeLocalUtc(normalized)
    if (!parsed) return { expiresAt: null, error: 'Expiry is not a valid date.' }
    return { expiresAt: parsed }
  }
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return { expiresAt: null, error: 'Expiry is not a valid date.' }
  return { expiresAt: parsed.toISOString() }
}

export function normalizeImportRow(
  raw: Record<string, string>,
  mapping: ImportMapping,
  now = new Date(),
): NormalizedImportRow {
  const errors: Record<string, string> = {}
  const slugRaw = mapping.slug ? raw[mapping.slug] ?? '' : ''
  const slug = normalizeSlug(slugRaw)
  if (!slug.ok) errors.slug = slug.error

  const destinationRaw = mapping.destination_url ? raw[mapping.destination_url] ?? '' : ''
  const destination = normalizeDestination(destinationRaw)
  if (!destination.ok) errors.destination_url = destination.error

  const campaignNameRaw = mapping.campaign ? (raw[mapping.campaign] ?? '').trim() : ''
  if (campaignNameRaw.length > 80) errors.campaign = 'Campaign names can be at most 80 characters.'
  const noteRaw = mapping.note ? (raw[mapping.note] ?? '').trim() : ''
  if (noteRaw.length > 500) errors.note = 'Notes can be at most 500 characters.'

  const expiryType = mapping.expires_at ? raw[mapping.expires_at] ?? '' : ''
  const expiry = parseExpiry(expiryType)
  if (expiry.error) errors.expires_at = expiry.error
  if (expiry.expiresAt && Date.parse(expiry.expiresAt) <= now.getTime()) {
    errors.expires_at = 'Expiry must be in the future.'
  }

  const enabledRaw = mapping.enabled ? raw[mapping.enabled] ?? '' : ''
  const enabled = parseEnabled(enabledRaw)
  if (enabled.error) errors.enabled = enabled.error

  return {
    slug: slug.ok ? slug.slug : null,
    destinationUrl: destination.ok ? destination.url : null,
    campaignName: campaignNameRaw || null,
    note: noteRaw || null,
    expiresAt: expiry.expiresAt,
    enabled: enabled.enabled,
    errors,
  }
}

export function importTemplate(): string {
  return [
    'slug,destination_url,campaign,note,expires_at,enabled',
    'spring-launch,https://example.com/spring-launch,Spring Launch,Homepage hero,2026-12-31,true',
    'spring-guide,https://example.com/guides/spring,Spring Launch,,,',
  ].join('\n')
}
