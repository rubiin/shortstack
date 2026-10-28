export const DESTINATION_MAX_LENGTH = 2048

export type DestinationResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

export function normalizeDestination(input: string): DestinationResult {
  const value = input.trim()
  if (!value) return { ok: false, error: 'Enter a destination URL.' }
  if (value.length > DESTINATION_MAX_LENGTH) {
    return { ok: false, error: `Destination URLs can be at most ${DESTINATION_MAX_LENGTH} characters.` }
  }
  // Control characters can break HTTP headers or hide a second URL in UI.
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return { ok: false, error: 'Destination contains control characters.' }
  }
  if (/\s/.test(value)) {
    return { ok: false, error: 'Destination must not contain spaces. Use %20 instead.' }
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { ok: false, error: 'Enter a complete URL, including https://.' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only http and https destinations are allowed.' }
  }
  if (!parsed.hostname) return { ok: false, error: 'Destination needs a hostname.' }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'Destination URLs cannot include credentials.' }
  }
  if (parsed.hostname.includes('..')) {
    return { ok: false, error: 'Destination hostname is not valid.' }
  }

  return { ok: true, url: parsed.href }
}

export function isSafeRedirectDestination(value: string): boolean {
  return normalizeDestination(value).ok
}

export function schemeOf(value: string): string {
  try {
    return new URL(value).protocol
  } catch {
    return ''
  }
}
