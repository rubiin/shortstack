import { useState } from 'react'
import type { FormEvent } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { getSessionFn, loginFn } from '~/server/functions/auth'
import { Field, InlineAlert, SubmitButton } from '~/components/ui'

type LoginSearch = { next?: string }

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    next: typeof search.next === 'string' ? search.next : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const { user } = await getSessionFn()
    if (user) {
      const next = search.next && /^\/app(?:\/|$)/.test(search.next) ? search.next : '/app/links'
      throw redirect({ href: next })
    }
  },
  head: () => ({
    meta: [{ title: 'Sign in · Shortstack' }],
  }),
  component: LoginPage,
})

function LoginPage() {
  const { next } = Route.useSearch()
  const login = useServerFn(loginFn)
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setFields({})
    try {
      const result = await login({
        data: {
          email,
          password,
          next: next && /^\/app(?:\/|$)/.test(next) ? next : '/app/links',
        },
      })
      if (!result.ok) {
        setError(result.message)
        setFields(result.fields ?? {})
        return
      }
      await router.invalidate()
    } catch (caught) {
      // Server-side redirects are handled by the Start client. Only surface
      // genuine failures here.
      if (caught instanceof Response) return
      setError('Could not sign in. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  function useDemo(kind: 'owner' | 'member') {
    setEmail(kind === 'owner' ? 'maya@northstar.example' : 'theo@northstar.example')
    setPassword('shortstack-demo')
    setError(null)
  }

  return (
    <div className="login-page">
      <div className="login-aside">
        <span className="brand" aria-hidden="true">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            <span className="brand-name">Shortstack</span>
            <span className="brand-sub">Branded link desk</span>
          </span>
        </span>

        <div className="login-quote">
          <p className="eyebrow" style={{ color: '#e5b66e' }}>
            The short link desk
          </p>
          <h1>Every click, minus the surveillance.</h1>
          <p>
            Branded redirects, QR codes, and a clean read on what is working — with analytics that
            keep only the day, coarse country, referrer domain, and device class.
          </p>
        </div>

        <footer>
          <span>One focused workspace. No visitor profiles.</span>
          <span>Northstar Studio demo environment</span>
        </footer>
      </div>

      <div className="login-panel">
        <div className="login-form-wrap">
          <p className="eyebrow">Welcome back</p>
          <h2>Sign in to Shortstack</h2>
          <p className="muted" style={{ marginBottom: 24 }}>
            Use your team account to manage links and read campaign performance.
          </p>

          {error ? (
            <div style={{ marginBottom: 16 }}>
              <InlineAlert tone="error" title="Sign-in failed">
                {error}
              </InlineAlert>
            </div>
          ) : null}

          <form className="form" onSubmit={(event) => void submit(event)} noValidate>
            <Field label="Work email" htmlFor="email" error={fields.email}>
              <input
                id="email"
                name="email"
                className="input"
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={fields.email ? true : undefined}
                aria-describedby={fields.email ? 'email-error' : undefined}
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              error={fields.password}
              aside={
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              }
            >
              <input
                id="password"
                name="password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={fields.password ? true : undefined}
                aria-describedby={fields.password ? 'password-error' : undefined}
              />
            </Field>

            <SubmitButton busy={busy} className="btn btn--primary btn--wide">
              {busy ? 'Signing in…' : 'Sign in'}
            </SubmitButton>
          </form>

          <div className="demo-creds">
            <span className="field-label">Demo accounts</span>
            <span>
              Owner <code>maya@northstar.example</code> · Member{' '}
              <code>theo@northstar.example</code>
            </span>
            <span>
              Password <code>shortstack-demo</code> unless SEED_PASSWORD was changed.
            </span>
            <div className="inline" style={{ marginTop: 4 }}>
              <button type="button" className="btn btn--small" onClick={() => useDemo('owner')}>
                Fill owner demo
              </button>
              <button type="button" className="btn btn--small" onClick={() => useDemo('member')}>
                Fill member demo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
