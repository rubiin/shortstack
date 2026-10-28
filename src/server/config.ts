import { z } from 'zod'

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ORIGIN: z.string().url().default('http://localhost:3000'),
  SHORT_LINK_ORIGIN: z.string().url().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(16).default('shortstack-development-secret'),
  FILE_SIGNING_SECRET: z.string().min(16).default('shortstack-development-file-secret'),
  DATABASE_PATH: z.string().default('./data/shortstack.db'),
  FILE_STORAGE_DIR: z.string().default('./storage'),
  EXPORT_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  RAW_IMPORT_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  CLICK_RETENTION_MONTHS: z.coerce.number().int().min(1).max(60).default(24),
  SEED_PASSWORD: z.string().min(8).default('shortstack-demo'),
  SEED_WORKSPACE_TIMEZONE: z.string().default('UTC'),
  CLOUDFLARE_PURGE_ENABLED: booleanString,
  CLOUDFLARE_API_TOKEN: z.string().default(''),
  CLOUDFLARE_ZONE_ID: z.string().default(''),
  CLOUDFLARE_API_BASE: z.string().url().default('https://api.cloudflare.com/client/v4'),
  CLOUDFLARE_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(4_000),
  WORKER_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  WORKER_ID: z.string().min(1).default('shortstack-worker'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

export type AppConfig = z.infer<typeof envSchema> & {
  shortLinkHostname: string
  appHostname: string
  isProduction: boolean
}

let cached: AppConfig | null = null

export function loadEnvironment(): void {
  if (process.env.SHORTSTACK_ENV_LOADED === '1') return
  process.env.SHORTSTACK_ENV_LOADED = '1'
  for (const name of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(name)
    } catch {
      // The file is optional. Defaults keep local setup friendly.
    }
  }
}

export function getConfig(): AppConfig {
  loadEnvironment()
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid environment configuration: ${detail}`)
  }
  const env = parsed.data
  if (env.NODE_ENV === 'production' && env.SESSION_SECRET.startsWith('shortstack-development')) {
    throw new Error('SESSION_SECRET must be replaced in production')
  }
  if (env.NODE_ENV === 'production' && env.FILE_SIGNING_SECRET.startsWith('shortstack-development')) {
    throw new Error('FILE_SIGNING_SECRET must be replaced in production')
  }
  if (!/^https?:\/\//.test(env.SHORT_LINK_ORIGIN)) {
    throw new Error('SHORT_LINK_ORIGIN must use http or https')
  }
  if (!/^https?:\/\//.test(env.APP_ORIGIN)) {
    throw new Error('APP_ORIGIN must use http or https')
  }
  cached = {
    ...env,
    shortLinkHostname: new URL(env.SHORT_LINK_ORIGIN).host,
    appHostname: new URL(env.APP_ORIGIN).host,
    isProduction: env.NODE_ENV === 'production',
  }
  return cached
}

export function resetConfigForTests(): void {
  cached = null
}
