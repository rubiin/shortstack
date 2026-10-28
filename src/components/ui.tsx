import { useEffect, useId, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { LinkState } from '~/domain/time'

export function StatePill({ state, expiring = false }: { state: LinkState; expiring?: boolean }) {
  const label =
    state === 'active'
      ? expiring
        ? 'Expiring soon'
        : 'Active'
      : state === 'disabled'
        ? 'Paused'
        : state === 'expired'
          ? 'Expired'
          : 'Archived'
  return <span className={`pill pill--${expiring && state === 'active' ? 'expired' : state}`}>{label}</span>
}

export function StatusPill({ status }: { status: string }) {
  const safe = status.replace(/[^a-z]/g, '')
  return <span className={`pill pill--${safe}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
}

export function StatCard({
  label,
  value,
  note,
}: {
  label: string
  value: string | number
  note?: string
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note ? <div className="stat-note">{note}</div> : null}
    </div>
  )
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  )
}

export function CopyButton({
  text,
  label = 'Copy link',
  compact = false,
}: {
  text: string
  label?: string
  compact?: boolean
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        area.remove()
      }
      setStatus('copied')
    } catch {
      setStatus('error')
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus('idle'), 2400)
  }

  return (
    <span className="inline">
      <button
        type="button"
        className={compact ? 'btn btn--ghost btn--small' : 'btn'}
        onClick={() => void copy()}
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10.5 5.5v-1A1.5 1.5 0 0 0 9 3H4a1.5 1.5 0 0 0-1.5 1.5V10A1.5 1.5 0 0 0 4 11.5h1" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        {label}
      </button>
      <span className="copy-status" role="status" aria-live="polite">
        {status === 'copied' ? 'Copied' : status === 'error' ? 'Copy failed — select the URL manually.' : ''}
      </span>
    </span>
  )
}

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3200)
    return () => clearTimeout(timer)
  }, [message, onDone])

  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  )
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />
}

export function SubmitButton({
  children,
  busy,
  className = 'btn btn--primary',
  disabled,
  ...rest
}: {
  children: ReactNode
  busy?: boolean
  className?: string
  disabled?: boolean
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>) {
  return (
    <button type="submit" className={className} disabled={disabled || busy} {...rest}>
      {busy ? <Spinner /> : null}
      {children}
    </button>
  )
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  aside,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: ReactNode
  aside?: ReactNode
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined
  const errorId = error ? `${htmlFor}-error` : undefined
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        <span>{label}</span>
        {aside ? <span className="field-hint">{aside}</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  )
}

export function InlineAlert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'error' | 'success' | 'warn'
  title?: string
  children?: ReactNode
}) {
  const role = tone === 'error' ? 'alert' : 'status'
  return (
    <div className={`alert${tone === 'info' ? '' : ` alert--${tone}`}`} role={role}>
      {title ? <strong>{title}</strong> : null}
      {children}
    </div>
  )
}

export function useUniqueId(prefix: string): string {
  const id = useId()
  return `${prefix}${id.replace(/[^a-zA-Z0-9_-]/g, '')}`
}
