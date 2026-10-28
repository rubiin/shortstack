import { useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouter,
} from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import '../styles.css'

const themeScript = `(() => {
  try {
    const stored = localStorage.getItem('shortstack-theme');
    if (stored === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0f1411');
      return;
    }
    if (stored === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f6f7f9');
      return;
    }
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0f1411');
      return;
    }
    document.documentElement.setAttribute('data-theme', 'light');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f6f7f9');
  } catch {}
})();`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Shortstack · Branded short links' },
      {
        name: 'description',
        content:
          'Shortstack is a focused branded-link workspace with privacy-minimized analytics, QR codes, and CSV imports.',
      },
      { name: 'theme-color', content: '#f8f9fb' },
      { name: 'robots', content: 'noindex' },
    ],
    links: [
      {
        rel: 'icon',
        href:
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23f4f1e9'/%3E%3Crect x='7' y='14' width='4.5' height='10' rx='1.5' fill='%23205a45'/%3E%3Crect x='13.75' y='7' width='4.5' height='17' rx='1.5' fill='%23205a45'/%3E%3Crect x='20.5' y='17' width='4.5' height='7' rx='1.5' fill='%23b94724'/%3E%3C/svg%3E",
      },
    ],
  }),
  pendingComponent: PendingPage,
  errorComponent: ErrorPage,
  notFoundComponent: NotFoundPage,
  component: RootComponent,
})

function ThemeInitScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />
}

function RootComponent() {
  useEffect(() => {
    // Signals that React controls are interactive. Browser tests wait for this
    // instead of racing the server-rendered markup.
    document.documentElement.dataset.hydrated = 'true'
  }, [])

  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  // The theme script runs before hydration and writes data-theme on <html>,
  // which the server render cannot know about. That pre-hydration attribute is
  // intentional, so React should not report it as a mismatch.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeInitScript />
        <HeadContent />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function PendingPage() {
  return (
    <div className="pending-page" aria-busy="true" aria-live="polite">
      <div className="skeleton" style={{ height: 18, width: 140 }} />
      <div className="skeleton" style={{ height: 46, width: 'min(100%, 420px)' }} />
      <div className="skeleton" style={{ height: 150, width: '100%' }} />
      <span className="sr-only">Loading page</span>
    </div>
  )
}

function ErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const message =
    error instanceof Error && error.message && !/redirect/i.test(error.message)
      ? error.message
      : 'The page could not be loaded.'

  return (
    <main className="page page--narrow" id="main">
      <div className="card card-pad stack">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="section-title">We hit a snag.</h1>
        <div className="alert alert--error" role="alert">
          {message}
        </div>
        <div className="inline">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              void router.invalidate()
              reset()
            }}
          >
            Try again
          </button>
          <Link className="btn" to="/app/links">
            Back to links
          </Link>
        </div>
      </div>
    </main>
  )
}

function NotFoundPage() {
  return (
    <main className="page page--narrow" id="main">
      <div className="card empty">
        <div className="empty-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h2>Nothing lives here</h2>
        <p>
          The page or short link you followed does not exist. Check the address, or head back to
          your link library.
        </p>
        <Link className="btn btn--primary" to="/app/links">
          Go to links
        </Link>
      </div>
    </main>
  )
}
