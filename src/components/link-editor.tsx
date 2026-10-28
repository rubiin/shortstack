import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { checkSlugFn, createLinkFn, updateLinkFn } from '~/server/functions/links'
import { normalizeSlug } from '~/domain/slug'
import { toDateTimeLocal } from '~/domain/time'
import type { CampaignOption, DomainOption, LinkDetail } from '~/domain/types'
import { Field, InlineAlert, StatePill, SubmitButton } from './ui'

type EditorMode = 'create' | 'edit'

type FormValues = {
  domainId: string
  slug: string
  generateSlug: boolean
  destinationUrl: string
  campaignId: string
  note: string
  expiresAt: string
  enabled: boolean
}

export function LinkEditor({
  mode,
  domains,
  campaigns,
  link,
}: {
  mode: EditorMode
  domains: DomainOption[]
  campaigns: CampaignOption[]
  link: LinkDetail | null
}) {
  const router = useRouter()
  const createLink = useServerFn(createLinkFn)
  const updateLink = useServerFn(updateLinkFn)
  const checkSlug = useServerFn(checkSlugFn)

  const defaultDomain = domains.find((domain) => domain.isDefault) ?? domains[0]
  const [values, setValues] = useState<FormValues>({
    domainId: link?.domainId ?? defaultDomain?.id ?? '',
    slug: link?.slug ?? '',
    generateSlug: false,
    destinationUrl: link?.destinationUrl ?? '',
    campaignId: link?.campaignId ?? '',
    note: link?.note ?? '',
    expiresAt: toDateTimeLocal(link?.expiresAt ?? null),
    enabled: link?.enabled ?? true,
  })
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [slugState, setSlugState] = useState<
    { kind: 'idle' } | { kind: 'checking' } | { kind: 'available' } | { kind: 'unavailable'; message: string }
  >({ kind: 'idle' })

  const selectedDomain = domains.find((domain) => domain.id === values.domainId) ?? defaultDomain
  const normalized = normalizeSlug(values.slug)
  const previewSlug = normalized.ok ? normalized.slug : values.slug
  const previewUrl = selectedDomain
    ? `${selectedDomain.origin.replace(/\/$/, '')}/${values.generateSlug ? 'generated-slug' : previewSlug || 'your-slug'}`
    : ''

  useEffect(() => {
    if (mode === 'edit' && link && values.slug === link.slug && values.domainId === link.domainId) {
      setSlugState({ kind: 'idle' })
      return
    }
    if (values.generateSlug || !values.slug.trim()) {
      setSlugState({ kind: 'idle' })
      return
    }
    if (!values.domainId) return
    let active = true
    setSlugState({ kind: 'checking' })
    const timer = setTimeout(() => {
      checkSlug({ data: { domainId: values.domainId, slug: values.slug } })
        .then((result) => {
          if (!active) return
          setSlugState(
            result.available
              ? { kind: 'available' }
              : { kind: 'unavailable', message: result.error ?? 'That slug is unavailable.' },
          )
        })
        .catch(() => {
          if (active) setSlugState({ kind: 'idle' })
        })
    }, 450)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [checkSlug, mode, link, values.domainId, values.slug, values.generateSlug])

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    if (key in fields) setFields((current) => ({ ...current, [key]: '' }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setFields({})
    try {
      const payload = {
        domainId: values.domainId,
        slug: values.generateSlug ? '' : values.slug,
        generateSlug: mode === 'create' && values.generateSlug,
        destinationUrl: values.destinationUrl,
        campaignId: values.campaignId || null,
        note: values.note,
        expiresAt: values.expiresAt,
        enabled: values.enabled,
        ...(mode === 'edit' && link ? { expectedUpdatedAt: link.updatedAt } : {}),
      }
      const result =
        mode === 'edit' && link
          ? await updateLink({ data: { ...payload, linkId: link.id } })
          : await createLink({ data: payload })

      if (!result.ok) {
        setError(result.message)
        setFields(result.fields ?? {})
        return
      }
      await router.navigate({
        to: '/app/links/$linkId',
        params: { linkId: result.data.linkId },
        search: { saved: 1 },
      })
    } catch {
      setError('Could not save this link. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const archived = link?.state === 'archived'
  const slugInvalid = Boolean(fields.slug) || (slugState.kind === 'unavailable' && !values.generateSlug)

  return (
    <form className="form" onSubmit={(event) => void submit(event)} noValidate>
      {archived ? (
        <InlineAlert tone="warn" title="This link is archived">
          Restore it from the{' '}
          <Link to="/app/links/$linkId" params={{ linkId: link?.id ?? '' }} className="notice-link">
            link detail page
          </Link>{' '}
          before editing.
        </InlineAlert>
      ) : null}

      {error ? (
        <InlineAlert tone="error" title="Could not save">
          {error}
        </InlineAlert>
      ) : null}

      <div className="card card-pad">
        <div className="stack">
          <Field
            label="Branded domain"
            htmlFor="domainId"
            error={fields.domainId}
            hint="Redirects resolve by domain hostname and slug."
          >
            <select
              id="domainId"
              className="select"
              value={values.domainId}
              onChange={(event) => update('domainId', event.target.value)}
              aria-invalid={fields.domainId ? true : undefined}
              disabled={archived}
            >
              {domains.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.hostname}
                  {domain.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Short slug"
            htmlFor="slug"
            error={fields.slug}
            hint={
              mode === 'create'
                ? 'Lowercase letters, numbers, and hyphens. We normalize it before saving.'
                : 'Changing the slug immediately updates the redirect and keeps analytics.'
            }
            aside={
              mode === 'create' ? (
                <label className="check" style={{ fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={values.generateSlug}
                    onChange={(event) => update('generateSlug', event.target.checked)}
                    disabled={archived}
                  />
                  <span>Generate for me</span>
                </label>
              ) : null
            }
          >
            <div className="input-row">
              <input
                id="slug"
                className="input mono"
                value={values.generateSlug ? '' : values.slug}
                onChange={(event) => update('slug', event.target.value)}
                placeholder={values.generateSlug ? 'Generated when you save' : 'spring-field-guide'}
                disabled={values.generateSlug || archived}
                aria-invalid={slugInvalid ? true : undefined}
                aria-describedby={fields.slug ? 'slug-error' : undefined}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="pill pill--quiet" aria-live="polite">
                {values.generateSlug
                  ? 'Auto'
                  : slugState.kind === 'checking'
                    ? 'Checking…'
                    : slugState.kind === 'available'
                      ? 'Available'
                      : slugState.kind === 'unavailable'
                        ? 'Unavailable'
                        : '—'}
              </span>
            </div>
            {slugState.kind === 'unavailable' && !fields.slug ? (
              <span className="field-error">{slugState.message}</span>
            ) : null}
          </Field>

          <Field
            label="Destination URL"
            htmlFor="destinationUrl"
            error={fields.destinationUrl}
            hint="HTTP or HTTPS only. Credentials, control characters, and non-web schemes are rejected."
          >
            <input
              id="destinationUrl"
              className="input"
              type="url"
              inputMode="url"
              value={values.destinationUrl}
              onChange={(event) => update('destinationUrl', event.target.value)}
              placeholder="https://example.com/campaign/landing-page"
              aria-invalid={fields.destinationUrl ? true : undefined}
              disabled={archived}
              autoComplete="url"
            />
          </Field>

          <div className="grid-2">
            <Field label="Campaign" htmlFor="campaignId" error={fields.campaignId} hint="Optional grouping.">
              <select
                id="campaignId"
                className="select"
                value={values.campaignId}
                onChange={(event) => update('campaignId', event.target.value)}
                disabled={archived}
              >
                <option value="">No campaign</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Expiry (UTC)"
              htmlFor="expiresAt"
              error={fields.expiresAt}
              hint="Optional. After this moment the link shows a branded unavailable page."
            >
              <input
                id="expiresAt"
                className="input"
                type="datetime-local"
                value={values.expiresAt}
                onChange={(event) => update('expiresAt', event.target.value)}
                aria-invalid={fields.expiresAt ? true : undefined}
                disabled={archived}
              />
            </Field>
          </div>

          <Field
            label="Internal note"
            htmlFor="note"
            error={fields.note}
            hint={`${values.note.length}/500 characters. Notes never appear on the redirect page.`}
          >
            <textarea
              id="note"
              className="textarea"
              style={{ minHeight: 90 }}
              value={values.note}
              onChange={(event) => update('note', event.target.value)}
              maxLength={500}
              disabled={archived}
              placeholder="Where is this link used? Anything the next person should know?"
            />
          </Field>

          <label className="check">
            <input
              type="checkbox"
              checked={values.enabled}
              onChange={(event) => update('enabled', event.target.checked)}
              disabled={archived}
            />
            <span>
              Link is live
              <small>
                Turning this off pauses the redirect immediately. Analytics and history stay intact.
              </small>
            </span>
          </label>
        </div>
      </div>

      <div className="form-actions">
        <SubmitButton busy={busy} disabled={archived}>
          {mode === 'edit' ? 'Save changes' : 'Create link'}
        </SubmitButton>
        <Link
          className="btn"
          to={mode === 'edit' && link ? '/app/links/$linkId' : '/app/links'}
          params={mode === 'edit' && link ? { linkId: link.id } : undefined}
        >
          Cancel
        </Link>
      </div>

      <div className="card card-pad" aria-live="polite">
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          Live preview
        </p>
        <p className="mono" style={{ fontSize: 15, overflowWrap: 'anywhere', color: 'var(--green-deep)' }}>
          {previewUrl || 'Choose a domain to preview the short URL.'}
        </p>
        <div className="inline" style={{ marginTop: 12 }}>
          {link ? <StatePill state={link.state} /> : <span className="pill pill--draft">Draft</span>}
          <span className="small muted">
            {values.enabled ? 'Redirects when saved' : 'Saved as paused'}
            {values.expiresAt ? ` · expires ${values.expiresAt.replace('T', ' ')} UTC` : ' · no expiry'}
          </span>
        </div>
      </div>
    </form>
  )
}
