import { useEffect, useRef, useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionFn } from '~/server/functions/auth'
import { createAnonymousLinkFn } from '~/server/functions/links'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const { user } = await getSessionFn()
    if (user) throw redirect({ to: '/app/links' })
  },
  head: () => ({
    meta: [
      { title: 'Shortstack — URL shortener with custom domains & analytics' },
      {
        name: 'description',
        content:
          'Free URL shortener with custom branded domains, privacy-minded analytics, and QR codes. Create up to 1,000 branded short links at no cost.',
      },
    ],
  }),
  component: HomePage,
})

/* ------------------------------------------------------------------ icons */

const ICONS: Record<string, React.ReactNode> = {
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="m7 14 4-4 3 3 5-6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9z" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  qr: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3z" />
      <path d="M20 14h1M14 20h3M20 18v3" />
    </>
  ),
  code: (
    <>
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </>
  ),
  folder: (
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  star: (
    <path
      d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"
      fill="currentColor"
      stroke="none"
    />
  ),
  starOff: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  mail: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="m3 7.5 9 6 9-6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  zap: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  tag: (
    <>
      <path d="M20.6 13.4 12 22l-9-9V4h9z" />
      <circle cx="7.6" cy="7.6" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  monitor: (
    <>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  bag: (
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </>
  ),
  cpu: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </>
  ),
  utensils: (
    <>
      <path d="M5 2v7a3 3 0 0 0 3 3v10" />
      <path d="M8.5 2v7" />
      <path d="M18 2c-1.6 2-2.4 4-2.4 6.2 0 1.9.9 3.3 2.4 3.8V22" />
    </>
  ),
  bank: (
    <>
      <path d="M3 21h18" />
      <path d="M5.5 21V10M10 21V10M14 21V10M18.5 21V10" />
      <path d="m2.5 10 9.5-6 9.5 6z" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="m7 5-2 5M13 5l-2 5M19 5l-2 5" />
    </>
  ),
  heart: (
    <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5C2 10.8 3.5 12.5 5 14l7 7z" />
  ),
  truck: (
    <>
      <path d="M10 17h4V5H2v12h2.5" />
      <path d="M14 9h4l4 4v4h-2" />
      <circle cx="7.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
  infinity: (
    <path d="M9.5 8C7 8 5 9.8 5 12s2 4 4.5 4c3.5 0 4.5-8 8-8 2.5 0 4.5 1.8 4.5 4s-2 4-4.5 4c-3.5 0-4.5-8-8-8z" />
  ),
  rocket: (
    <>
      <path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.8-.8 7.5-6 11a22.3 22.3 0 0 1-4 2z" />
      <path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0" />
      <path d="M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5" />
    </>
  ),
  briefcase: (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>
  ),
  cursor: <path d="m4 3 7 17 2.5-6.5L20 11z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      className="lp-ico"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  )
}

function Stars({ score = 4 }: { score?: number }) {
  return (
    <span className="lp-stars" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <Icon key={i} name={i < score ? 'star' : 'starOff'} size={15} />
      ))}
    </span>
  )
}

/* ------------------------------------------------------------------- data */

const NAV = [
  { label: 'Pricing', href: '#cta' },
  { label: 'Features', href: '#features' },
  { label: 'Enterprise', href: '#teams' },
  { label: 'Demo', href: '#demo' },
  { label: 'FAQ', href: '#faq' },
]

const HERO_WORDS = ['custom domains', 'analytics', 'QR codes', 'API access', 'team collaboration']

const BENEFITS = [
  { icon: 'infinity', title: 'Free forever plan', body: 'Up to 1,000 branded links' },
  { icon: 'globe', title: 'Custom domain support', body: 'Use your own domain name' },
  { icon: 'card', title: 'No credit card required', body: 'Start creating links instantly' },
  { icon: 'chart', title: 'Rich analytics included', body: 'Track clicks and performance' },
]

const FEATURES = [
  {
    art: 'chart',
    icon: 'chart',
    title: 'Advanced analytics',
    body: 'See what every link does with click, device, referrer, and geo reporting as it happens.',
    points: ['Real-time click stream', 'Device, browser & referrer breakdowns', 'Country-level geo data'],
  },
  {
    art: 'domain',
    icon: 'globe',
    title: 'Custom domains',
    body: 'Send traffic through your own branded domain so every short link looks like you.',
    points: ['Free automated SSL', 'Unlimited domains per account', 'Bring your own or buy in-app'],
  },
  {
    art: 'team',
    icon: 'users',
    title: 'Team collaboration',
    body: 'Invite the team, split up ownership, and keep every campaign in one shared workspace.',
    points: ['Role-based access (Admin, Member)', 'Shared analytics & folders', 'Single sign-on'],
  },
  {
    art: 'qr',
    icon: 'qr',
    title: 'QR codes',
    body: 'Generate a QR code for any link and change where it points without a new print run.',
    points: ['Editable destinations, no reprint', 'Full colors, logo & finder shapes', 'PNG, SVG & PDF exports'],
  },
  {
    art: 'code',
    icon: 'code',
    title: 'API access',
    body: 'Create and manage links from your own product with a plain REST API.',
    points: ['REST endpoints for every object', 'JavaScript and Node.js clients', 'Bulk operations & webhooks'],
  },
  {
    art: 'tags',
    icon: 'folder',
    title: 'Link management',
    body: 'Keep thousands of links tidy with folders, tags, search, and bulk editing.',
    points: ['Folders, tags & search', 'Bulk create / edit via CSV or API', 'UTM builder & campaign tracking'],
  },
]

const DEMO_STEPS = [
  {
    title: 'Shorten links instantly',
    body: 'Create a branded short link in seconds with your own alias and domain.',
  },
  {
    title: 'Track performance',
    body: 'Follow clicks, locations, devices, and referrers as they arrive.',
  },
  {
    title: 'Manage at scale',
    body: 'Organize thousands of links with folders, tags, and bulk operations.',
  },
  {
    title: 'Collaborate with teams',
    body: 'Share a workspace, set permissions, and work together in one place.',
  },
]

const TEAMS = [
  {
    icon: 'target',
    title: 'Marketing teams',
    body: 'Follow every campaign from first click to conversion, all in one place.',
    tags: ['Campaign tracking', 'A/B testing', 'ROI measurement'],
  },
  {
    icon: 'briefcase',
    title: 'Sales teams',
    body: 'Share tailored links and see exactly which prospect opened what.',
    tags: ['Personalized links', 'Engagement tracking', 'CRM integration'],
  },
  {
    icon: 'rocket',
    title: 'Infrastructure teams',
    body: 'Ship link infrastructure at volume with the controls large orgs need.',
    tags: ['SSO authentication', 'API access', 'System integration'],
  },
]

const FAQS: Array<[string, string]> = [
  [
    'How do I get started with Shortstack?',
    'Create a free account, then shorten your first link from the dashboard or straight from this page. No credit card is needed for the free plan.',
  ],
  [
    'Can I use my own domain?',
    'Yes. Add a custom domain to your workspace, point the DNS records we give you, and every link you make on it is issued a free SSL certificate.',
  ],
  [
    'What analytics are available?',
    'Clicks over time, countries, device classes, and referrer domains. Reports are live, and raw identifiers such as IP addresses are never stored.',
  ],
  [
    'Is there an API available?',
    'Yes. A REST API covers links, folders, and imports, with token auth and webhooks for bulk workflows.',
  ],
  [
    'How secure are my links?',
    'Every link is served over HTTPS, destinations are validated before they are stored, and sessions use opaque hashed tokens.',
  ],
  [
    "What's included in the free plan?",
    'Up to 1,000 branded links, custom domains, QR codes, analytics, and API access — enough for individuals and small teams.',
  ],
  [
    'Can I cancel my subscription anytime?',
    'Yes. Upgrade, downgrade, or cancel whenever you like. There are no long-term contracts or hidden fees.',
  ],
  [
    'Is Shortstack a free URL shortener?',
    'Yes. You can shorten links with no account at all, and the free plan keeps working indefinitely for up to 1,000 branded links.',
  ],
  [
    'What link analytics are kept?',
    'Only what a report needs: link, day, coarse country, referrer domain, and device class. IP addresses, user agents, and exact timestamps are discarded.',
  ],
]

const CTA_BADGES = ['No credit card required', 'Free plan forever', 'Upgrade anytime', 'Fast support response']

const FOOTER_COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
          { label: 'QR codes', href: '#features' },
      { label: 'API access', href: '#features' },
      { label: 'Pricing', href: '#cta' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Product demo', href: '#demo' },
      { label: 'FAQ', href: '#faq' },
      { label: 'Bulk import', href: '/login' },
      { label: 'Analytics', href: '#features' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Enterprise', href: '#teams' },
      { label: 'Trust & security', href: '#features' },
      { label: 'Contact us', href: 'mailto:support@shortstack.example' },
    ],
  },
  {
    title: 'Get started',
    links: [
      { label: 'Log in', href: '/login' },
      { label: 'Create free account', href: '/login' },
      { label: 'View demo', href: '#demo' },
      { label: 'Help center', href: '#faq' },
    ],
  },
]

const LANGUAGES = [
  'Deutsch',
  'English',
  'Español',
  'Français',
  'Italiano',
  'Nederlands',
  'Polski',
  'Português',
  'Svenska',
  'Türkçe',
  'Українська',
  '日本語',
  '한국어',
  '中文',
]

/* ------------------------------------------------------------------ page */

function HomePage() {
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [word, setWord] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [demoStep, setDemoStep] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setWord((i) => (i + 1) % HERO_WORDS.length), 2600)
    return () => clearInterval(id)
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    setResult(null)
    try {
      const res = await createAnonymousLinkFn({ data: { destinationUrl: url } })
      if (res.ok) setResult(res.data.shortUrl)
      else setError(res.message ?? 'Could not shorten that URL.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not shorten that URL.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="lp" id="main">
      <header className="lp-header">
        <div className="lp-container lp-header-inner">
          <a className="lp-brand" href="/">
            <span className="lp-brand-mark" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
                <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1" />
                <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" />
              </svg>
            </span>
            <span className="lp-brand-name">Shortstack</span>
          </a>

          <nav className={`lp-nav${menuOpen ? ' is-open' : ''}`} aria-label="Main">
            {NAV.map((item) => (
              <a key={item.label} href={item.href} onClick={() => setMenuOpen(false)}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="lp-header-actions">
            <span className="lp-lang" title="Language: English">
              <Icon name="globe" size={15} />
              EN
              <Icon name="chevron" size={13} />
            </span>
            <a className="lp-login" href="/login">
              Log in
            </a>
            <a className="lp-btn lp-btn--primary lp-btn--sm" href="/login">
              Get started
            </a>
            <button
              type="button"
              className="lp-burger"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Icon name={menuOpen ? 'close' : 'menu'} size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <section className="lp-hero">
        <div className="lp-container lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">Free plan available • No credit card required</p>
            <h1 className="lp-h1">
              <span>URL shortener with</span>{' '}
              <span className="lp-rotator" key={HERO_WORDS[word]}>
                {HERO_WORDS[word]}
              </span>
            </h1>
            <p className="lp-lede">
              Make branded short links on your own domain or on ours. Free link shortener with detailed
              analytics, QR codes, and an API — shorten a URL, share it, and watch every click come in.
            </p>
            <div className="lp-hero-actions">
              <a className="lp-btn lp-btn--primary" href="/login">
                Create free account
                <Icon name="arrow" size={16} />
              </a>
              <a className="lp-btn" href="#demo">
                <Icon name="play" size={14} />
                View demo
              </a>
            </div>
            <div className="lp-rating">
              <Stars />
              <span>
                <strong>Great</strong> · rated 4.6 out of 5 by 1,200+ teams
              </span>
            </div>
          </div>

          <div className="lp-shorten" id="shorten">
            <div className="lp-shorten-head">
              <Icon name="link" size={17} />
              <h2>Shorten your link</h2>
            </div>
            <form onSubmit={submit} className="lp-shorten-form">
              <label className="sr-only" htmlFor="lp-url">
                Long URL
              </label>
              <input
                id="lp-url"
                className="lp-input"
                type="url"
                required
                placeholder="Paste your long URL here..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button className="lp-btn lp-btn--primary" type="submit" disabled={pending}>
                {pending ? 'Shortening…' : 'Shorten'}
                <Icon name="arrow" size={16} />
              </button>
            </form>

            {result ? (
              <div className="lp-shorten-result">
                <div>
                  <span className="lp-shorten-label">Your short link</span>
                  <a className="lp-shorten-url" href={result}>
                    {result}
                  </a>
                </div>
                <a className="lp-btn lp-btn--sm" href="/login">
                  Customize
                </a>
              </div>
            ) : (
              <div className="lp-shorten-result lp-shorten-result--empty" aria-hidden="true">
                <div>
                  <span className="lp-shorten-label">Your short link</span>
                  <span className="lp-shorten-url lp-shorten-url--muted">ss.io/your-link</span>
                </div>
                <span className="lp-btn lp-btn--sm lp-btn--disabled">Customize</span>
              </div>
            )}

            {error ? (
              <p className="lp-shorten-error" role="alert">
                {error}
              </p>
            ) : null}

            <p className="lp-shorten-foot">
              Want your own domain? <a href="/login">Create free account</a>
            </p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- benefits */}
      <section className="lp-benefits">
        <div className="lp-container lp-benefits-grid">
          {BENEFITS.map((item) => (
            <div className="lp-benefit" key={item.title}>
              <span className="lp-ico-tile" aria-hidden="true">
                <Icon name={item.icon} size={18} />
              </span>
              <div>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- features */}
      <section className="lp-section lp-section--soft" id="features">
        <div className="lp-container">
          <div className="lp-section-head">
            <h2>Everything you need to manage links</h2>
            <p>Advanced link management tools that help you track performance and optimize campaigns</p>
          </div>
          <div className="lp-feature-grid">
            {FEATURES.map((f) => (
              <article className="lp-feature" key={f.title}>
                <FeatureArt kind={f.art} />
                <div className="lp-feature-body">
                  <span className="lp-ico-tile" aria-hidden="true">
                    <Icon name={f.icon} size={18} />
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                  <ul>
                    {f.points.map((point) => (
                      <li key={point}>
                        <Icon name="check" size={14} />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <a className="lp-more" href="#demo">
                    Learn more <Icon name="arrow" size={14} />
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ demo */}
      <section className="lp-section" id="demo">
        <div className="lp-container">
          <div className="lp-section-head">
            <h2>See Shortstack in action</h2>
            <p>Discover how easy it is to create, manage, and track your links</p>
          </div>
          <div className="lp-demo">
            <div className="lp-steps" role="tablist" aria-label="Product walkthrough">
              {DEMO_STEPS.map((step, index) => (
                <button
                  key={step.title}
                  type="button"
                  role="tab"
                  aria-selected={demoStep === index}
                  className={`lp-step${demoStep === index ? ' is-active' : ''}`}
                  onClick={() => setDemoStep(index)}
                >
                  <span className="lp-step-num">{String(index + 1).padStart(2, '0')}</span>
                  <span>
                    <strong>{step.title}</strong>
                    <span>{step.body}</span>
                  </span>
                </button>
              ))}
            </div>
            <DemoMockup step={demoStep} />
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- teams */}
      <section className="lp-section lp-section--soft" id="teams">
        <div className="lp-container">
          <div className="lp-section-head">
            <h2>Built for every team</h2>
            <p>See how different teams use Shortstack to reach their goals</p>
          </div>
          <div className="lp-team-grid">
            {TEAMS.map((team) => (
              <article className="lp-team" key={team.title}>
                <span className="lp-ico-tile" aria-hidden="true">
                  <Icon name={team.icon} size={18} />
                </span>
                <h3>{team.title}</h3>
                <p>{team.body}</p>
                <div className="lp-tags">
                  {team.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- faq */}
      <section className="lp-section lp-section--soft" id="faq">
        <div className="lp-container lp-container--narrow">
          <div className="lp-section-head">
            <h2>Frequently asked questions</h2>
            <p>Can&apos;t find what you&apos;re looking for?</p>
          </div>
          <div className="lp-faq">
            {FAQS.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Icon name="chevron" size={16} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- cta */}
      <section className="lp-section lp-cta" id="cta">
        <div className="lp-container lp-container--narrow">
          <h2>Ready to get started?</h2>
          <p>Join over a million users shortening links with Shortstack</p>
          <a className="lp-btn lp-btn--primary lp-btn--lg" href="/login">
            Get started for free
            <Icon name="arrow" size={16} />
          </a>
          <div className="lp-badges">
            {CTA_BADGES.map((badge) => (
              <span key={badge}>
                <Icon name="check" size={14} />
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- footer */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-top">
            <div className="lp-footer-brand">
              <a className="lp-brand" href="/">
                <span className="lp-brand-mark" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1" />
                    <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" />
                  </svg>
                </span>
                <span className="lp-brand-name">Shortstack</span>
              </a>
              <a className="lp-footer-mail" href="mailto:support@shortstack.example">
                <Icon name="mail" size={16} />
                support@shortstack.example
              </a>
              <div className="lp-review">
                <span className="lp-review-title">
                  <Icon name="star" size={14} />
                  Customer rating
                </span>
                <Stars score={4} />
                <span className="lp-review-meta">4.6 score · 1,200+ reviews</span>
              </div>
            </div>

            <div className="lp-footer-cols">
              {FOOTER_COLUMNS.map((column) => (
                <nav key={column.title} aria-label={column.title}>
                  <h3>{column.title}</h3>
                  <span className="lp-underline" aria-hidden="true" />
                  <ul>
                    {column.links.map((link) => (
                      <li key={link.label}>
                        <a href={link.href}>{link.label}</a>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>
          </div>

          <div className="lp-languages" aria-label="Available in">
            {LANGUAGES.map((language) => (
              <span key={language} className={language === 'English' ? 'is-active' : undefined}>
                {language}
              </span>
            ))}
          </div>

          <div className="lp-footer-bottom">
            <span>© 2016–2026 Shortstack. All rights reserved.</span>
            <span className="lp-footer-legal">
              <span>Terms & Conditions</span>
              <span>Privacy Policy and GDPR</span>
            </span>
          </div>
        </div>
      </footer>
    </main>
  )
}

/* --------------------------------------------------------- illustrations */

function FeatureArt({ kind }: { kind: string }) {
  if (kind === 'chart') {
    return (
      <div className="lp-art lp-art--chart" aria-hidden="true">
        <span className="lp-art-badge">+47%</span>
        <svg viewBox="0 0 260 110" preserveAspectRatio="none">
          <polyline points="0,96 40,80 80,86 120,58 160,64 200,32 260,12" fill="none" stroke="#1fb07e" strokeWidth="3" />
          <polyline points="0,96 40,80 80,86 120,58 160,64 200,32 260,12 260,110 0,110" fill="rgba(31,176,126,.12)" stroke="none" />
        </svg>
      </div>
    )
  }
  if (kind === 'domain') {
    return (
      <div className="lp-art lp-art--domain" aria-hidden="true">
        <div className="lp-browser">
          <span className="lp-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="lp-browser-url">
            <Icon name="globe" size={12} />
            yourbrand.co/<em>summer</em>
          </span>
        </div>
      </div>
    )
  }
  if (kind === 'team') {
    return (
      <div className="lp-art lp-art--team" aria-hidden="true">
        <span style={{ background: '#7c3aed' }}>JS</span>
        <span style={{ background: '#2563eb' }}>MK</span>
        <span style={{ background: '#1fb07e' }}>AT</span>
      </div>
    )
  }
  if (kind === 'qr') {
    return (
      <div className="lp-art lp-art--qr" aria-hidden="true">
        <svg viewBox="0 0 100 100" width="96" height="96">
          <rect x="4" y="4" width="26" height="26" fill="none" stroke="#0f172a" strokeWidth="6" />
          <rect x="70" y="4" width="26" height="26" fill="none" stroke="#0f172a" strokeWidth="6" />
          <rect x="4" y="70" width="26" height="26" fill="none" stroke="#0f172a" strokeWidth="6" />
          <g fill="#0f172a">
            <rect x="40" y="8" width="8" height="8" />
            <rect x="52" y="8" width="8" height="8" />
            <rect x="40" y="24" width="8" height="8" />
            <rect x="56" y="24" width="8" height="8" />
            <rect x="8" y="40" width="8" height="8" />
            <rect x="24" y="40" width="8" height="8" />
            <rect x="40" y="40" width="8" height="8" />
            <rect x="56" y="48" width="8" height="8" />
            <rect x="72" y="40" width="8" height="8" />
            <rect x="88" y="48" width="8" height="8" />
            <rect x="40" y="56" width="8" height="8" />
            <rect x="72" y="64" width="8" height="8" />
            <rect x="88" y="72" width="8" height="8" />
            <rect x="40" y="72" width="8" height="8" />
            <rect x="56" y="80" width="8" height="8" />
            <rect x="72" y="88" width="8" height="8" />
            <rect x="40" y="88" width="8" height="8" />
          </g>
        </svg>
      </div>
    )
  }
  if (kind === 'code') {
    return (
      <div className="lp-art lp-art--code" aria-hidden="true">
        <pre>
          <span className="lp-code-method">POST</span> /v1/links{'\n'}
          {'{'}
          {'\n'}  "destination": <em>"https://example.com/sale"</em>,{'\n'}  "slug": <em>"summer"</em>
          {'\n'}
          {'}'}
        </pre>
      </div>
    )
  }
  return (
    <div className="lp-art lp-art--tags" aria-hidden="true">
      <div className="lp-tag-row">
        <span className="lp-tag-chip">summer</span>
        <span className="lp-tag-bar" />
      </div>
      <div className="lp-tag-row">
        <span className="lp-tag-chip lp-tag-chip--alt">newsletter</span>
        <span className="lp-tag-bar lp-tag-bar--short" />
      </div>
    </div>
  )
}

function DemoMockup({ step }: { step: number }) {
  return (
    <div className="lp-mock">
      <div className="lp-mock-bar">
        <span className="lp-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="lp-mock-url">app.shortstack.example</span>
      </div>

      {step === 0 ? (
        <div className="lp-mock-body">
          <span className="lp-mock-label">New link</span>
          <div className="lp-mock-input">https://northstar.example/blog/summer-campaign</div>
          <div className="lp-mock-row">
            <span className="lp-mock-chip">ss.io/summer</span>
            <span className="lp-mock-btn">Shorten</span>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="lp-mock-body">
          <span className="lp-mock-label">Clicks, last 14 days</span>
          <div className="lp-mock-chart">
            {[38, 52, 44, 66, 58, 74, 62, 88, 70, 94, 82, 96, 78, 90].map((height, index) => (
              <i key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className="lp-mock-legend">
            <span>
              <i /> Clicks 48,210
            </span>
            <span>
              <i className="prev" /> Previous period
            </span>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="lp-mock-body">
          <span className="lp-mock-label">All links</span>
          {[
            { slug: '/summer', tag: 'campaign' },
            { slug: '/newsletter', tag: 'email' },
            { slug: '/qr-menu', tag: 'print' },
          ].map((row) => (
            <div className="lp-mock-link" key={row.slug}>
              <span className="lp-mock-slug">{row.slug}</span>
              <span className="lp-tag-chip">{row.tag}</span>
              <span className="lp-mock-count">{(Math.random() * 9000 + 400) | 0}</span>
            </div>
          ))}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="lp-mock-body">
          <span className="lp-mock-label">Workspace members</span>
          <div className="lp-mock-avatars">
            <span style={{ background: '#7c3aed' }}>JS</span>
            <span style={{ background: '#2563eb' }}>MK</span>
            <span style={{ background: '#1fb07e' }}>AT</span>
            <span className="add">+</span>
          </div>
          {[
            { role: 'Owner', who: 'maya@northstar.example' },
            { role: 'Admin', who: 'theo@northstar.example' },
            { role: 'Member', who: 'sam@northstar.example' },
          ].map((member) => (
            <div className="lp-mock-member" key={member.who}>
              <span>{member.who}</span>
              <span className="lp-tag-chip">{member.role}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}