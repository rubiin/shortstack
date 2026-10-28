export const RESERVED_SLUGS = new Set([
  'api',
  'app',
  'assets',
  'login',
  'logout',
  'health',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'storage',
  '_build',
  '__build',
  'public',
  'static',
  'well-known',
])

export const SLUG_MIN_LENGTH = 3
export const SLUG_MAX_LENGTH = 64

export type SlugResult =
  | { ok: true; slug: string }
  | { ok: false; error: string }

export function normalizeSlug(input: string): SlugResult {
  let value: string
  try {
    value = input.normalize('NFKC')
  } catch {
    return { ok: false, error: 'Slug contains unsupported characters.' }
  }
  value = value.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-')
  if (!value) return { ok: false, error: 'Choose a slug.' }
  if (value.length < SLUG_MIN_LENGTH) {
    return { ok: false, error: `Slugs need at least ${SLUG_MIN_LENGTH} characters.` }
  }
  if (value.length > SLUG_MAX_LENGTH) {
    return { ok: false, error: `Slugs can be at most ${SLUG_MAX_LENGTH} characters.` }
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)) {
    return {
      ok: false,
      error: 'Use lowercase letters, numbers, and hyphens; start and end with a letter or number.',
    }
  }
  if (RESERVED_SLUGS.has(value)) {
    return { ok: false, error: 'That slug is reserved by the system. Try another.' }
  }
  return { ok: true, slug: value }
}

const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'

export function generateSlug(random: (size: number) => Uint8Array = (size) => crypto.getRandomValues(new Uint8Array(size))): string {
  const bytes = random(8)
  let result = ''
  for (let index = 0; index < 8; index += 1) {
    const byte = bytes[index] ?? 0
    result += alphabet[byte % alphabet.length]
  }
  return result
}

export function suggestAvailableSlug(slug: string, attempt: number): string {
  const suffix = `-${attempt}`
  return `${slug.slice(0, SLUG_MAX_LENGTH - suffix.length)}${suffix}`
}
