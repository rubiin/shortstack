import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

import type { AuthUser } from '~/domain/authz'
import { logoutFn } from '~/server/functions/auth'

import { Spinner } from './ui'

const navItems = [
  {
    to: '/app/links',
    label: 'Links',
    icon: (
      <>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </>
    ),
  },
  {
    to: '/app/import',
    label: 'Bulk import',
    icon: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="M7 10l5 5 5-5" />
        <path d="M12 15V3" />
      </>
    ),
  },
  {
    to: '/app/analytics',
    label: 'Analytics',
    icon: (
      <>
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <path d="m7 14 4-4 3 3 5-6" />
      </>
    ),
  },
] as const

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    try {
      const stored = localStorage.getItem('shortstack-theme') as 'light' | 'dark' | null
      if (stored) {
        setTheme(stored)
        return
      }
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setTheme('dark')
      }
    } catch {}
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try {
      document.documentElement.setAttribute('data-theme', next)
      localStorage.setItem('shortstack-theme', next)
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', next === 'dark' ? '#0f1411' : '#f6f7f9')
    } catch {}
  }

  return (
    <button
      type="button"
      className="btn btn--ghost btn--small btn--icon"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? (
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.13 1.13M11.47 11.47l1.13 1.13M3.4 12.6l1.13-1.13M11.47 4.53l1.13-1.13"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M13.2 9.1A5.2 5.2 0 0 1 6.9 2.8a5.3 5.3 0 1 0 6.3 6.3Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}

export function AppShell({ user, children }: { user: AuthUser; children: ReactNode }) {
  const logout = useServerFn(logoutFn)
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    setNavOpen(false)
  }, [router.state.location.pathname])

  async function signOut() {
    setSigningOut(true)
    try {
      await logout()
      await router.invalidate()
    } catch {
      // A successful logout is a router redirect; navigation handles it.
      void router.invalidate()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="shell">
      <aside className={`sidebar${navOpen ? ' is-open' : ''}`} id="app-sidebar">
        <div className="sidebar-head">
          <Link to="/app/links" className="brand" aria-label="Shortstack links dashboard">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>
              <span className="brand-name">Shortstack</span>
              <span className="brand-sub">Branded link desk</span>
            </span>
          </Link>
          <button
            type="button"
            className="btn btn--ghost btn--small btn--icon sidebar-close"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M12.5 3.5 3.5 12.5M3.5 3.5l9 9"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Main">
          <p className="sidebar-label">Workspace</p>
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="side-link"
              activeProps={{ 'aria-current': 'page' }}
              onClick={() => setNavOpen(false)}
            >
              <svg
                className="side-ico"
                aria-hidden="true"
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {item.icon}
              </svg>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <div className="user-meta">
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role === 'owner' ? 'Owner' : 'Member'}</div>
            </div>
            <ThemeToggle />
          </div>
          <button
            type="button"
            className="btn btn--small btn--wide"
            onClick={() => void signOut()}
            disabled={signingOut}
          >
            {signingOut ? <Spinner /> : null}
            Sign out
          </button>
        </div>
      </aside>

      {navOpen ? (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <div className="shell-body">
        <div className="shell-topbar">
          <button
            type="button"
            className="btn btn--small btn--icon"
            aria-expanded={navOpen}
            aria-controls="app-sidebar"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M2.5 4h11M2.5 8h11M2.5 12h11"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <Link to="/app/links" className="brand" aria-label="Shortstack links dashboard">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="brand-name">Shortstack</span>
          </Link>
        </div>

        <main className="page" id="main">
          {children}
        </main>

        <footer className="page" style={{ paddingTop: 0, paddingBottom: 36 }}>
          <div className="between faint small">
            <span>Shortstack · private by default, useful on purpose.</span>
            <span>
              Analytics keep the link, day, coarse country, referrer domain, and device class only.
            </span>
          </div>
        </footer>
      </div>
    </div>
  )
}
