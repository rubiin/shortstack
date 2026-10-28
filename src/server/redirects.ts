import { classifyDevice, coarseCountry, referrerDomain } from '~/domain/privacy'
import { normalizeSlug } from '~/domain/slug'
import { effectiveLinkState } from '~/domain/time'

import { getDb } from './db'
import { newId } from './ids'
import { logger } from './log'

export type RedirectResolution =
  | { kind: 'redirect'; linkId: string; destination: string }
  | { kind: 'unavailable'; reason: 'disabled' | 'expired' }
  | { kind: 'not_found' }

type RedirectRow = {
  id: string
  workspace_id: string
  destination_url: string
  enabled: number
  expires_at: string | null
  archived_at: string | null
}

export function resolveRedirect(input: {
  host: string
  slug: string
  referrer?: string | null
  userAgent?: string | null
  countryHeader?: string | null
  now?: Date
}): RedirectResolution {
  const slug = normalizeSlug(input.slug)
  if (!slug.ok) return { kind: 'not_found' }
  const db = getDb()
  const host = input.host.trim().toLowerCase()
  const row = db
    .prepare(
      `SELECT l.id, l.workspace_id, l.destination_url, l.enabled, l.expires_at, l.archived_at
       FROM short_links l JOIN domains d ON d.id = l.domain_id
       WHERE d.hostname = ? COLLATE NOCASE AND l.slug = ? AND d.status = 'active'`,
    )
    .get(host, slug.slug) as RedirectRow | undefined

  if (!row || row.archived_at) return { kind: 'not_found' }
  const now = input.now ?? new Date()
  const state = effectiveLinkState(
    { enabled: row.enabled === 1, expiresAt: row.expires_at, archivedAt: row.archived_at },
    now,
  )
  if (state === 'disabled' || state === 'expired') return { kind: 'unavailable', reason: state }
  if (state !== 'active') return { kind: 'not_found' }

  recordClick({
    linkId: row.id,
    workspaceId: row.workspace_id,
    referrer: input.referrer ?? null,
    userAgent: input.userAgent ?? null,
    countryHeader: input.countryHeader ?? null,
    now,
  })
  return { kind: 'redirect', linkId: row.id, destination: row.destination_url }
}

export function recordClick(input: {
  linkId: string
  workspaceId: string
  referrer: string | null
  userAgent: string | null
  countryHeader: string | null
  now: Date
}): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO click_events (id, workspace_id, link_id, day, country_code, referrer_domain, device_class)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newId('clk'),
        input.workspaceId,
        input.linkId,
        input.now.toISOString().slice(0, 10),
        coarseCountry(input.countryHeader),
        referrerDomain(input.referrer),
        classifyDevice(input.userAgent),
      )
  } catch (error) {
    logger.error('click event could not be recorded', {
      linkId: input.linkId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function redirectResponse(destination: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      'Cache-Control': 'no-store, max-age=0',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export function unavailableResponse(
  kind: 'not_found' | 'disabled' | 'expired' | 'archived',
): Response {
  const title =
    kind === 'expired'
      ? 'This link has expired'
      : kind === 'disabled'
        ? 'This link is paused'
        : kind === 'archived'
          ? 'This link is no longer available'
          : 'This link does not exist'
  const detail =
    kind === 'expired'
      ? 'The campaign owner set an end date for this link.'
      : kind === 'disabled'
        ? 'The campaign owner has temporarily turned this link off.'
        : 'Check the URL for a typo, or ask the person who shared it for a fresh link.'
  const status = kind === 'disabled' || kind === 'expired' ? 410 : 404
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · Shortstack</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f8f9fb; color: #0f1026;
    font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; padding: 24px; }
  main { width: min(100%, 520px); background: #ffffff; border: 1px solid #e5e7eb; border-radius: 18px; padding: clamp(28px, 6vw, 52px);
    box-shadow: 0 1px 1px rgba(15,16,38,.01), 0 30px 60px rgba(15,16,38,.08); }
  .mark { display: inline-flex; align-items: flex-end; gap: 3px; margin-bottom: 30px; }
  .mark span { display: block; width: 7px; border-radius: 3px; background: #0f766e; }
  .mark span:nth-child(1) { height: 13px; } .mark span:nth-child(2) { height: 20px; } .mark span:nth-child(3) { height: 9px; background: #c85a34; }
  .eyebrow { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; color: #6b7280; margin: 0 0 12px; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-size: clamp(30px, 7vw, 44px); line-height: 1.05; letter-spacing: -.025em; margin: 0 0 16px; }
  p { line-height: 1.6; color: #3f4756; margin: 0; }
  footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 13px; }
  strong { color: #0f1026; }
</style>
</head>
<body>
<main>
  <div class="mark" aria-hidden="true"><span></span><span></span><span></span></div>
  <p class="eyebrow">Shortstack link</p>
  <h1>${title}</h1>
  <p>${detail}</p>
  <footer>Short links by <strong>Shortstack</strong>. No visitor profile was created.</footer>
</main>
</body>
</html>`
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  })
}
