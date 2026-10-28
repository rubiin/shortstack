import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { getConfig } from './config'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type LogFields = Record<string, unknown>

const levels: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const secretKey = /pass(word)?|secret|token|cookie|authorization|api[-_]?key|raw_csv|rawCsv|destination/i

type RequestLogContext = {
  correlationId: string
}

const context = new AsyncLocalStorage<RequestLogContext>()

export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return context.run({ correlationId }, fn)
}

export function getCorrelationId(): string {
  return context.getStore()?.correlationId ?? randomUUID()
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth-limit]'
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        secretKey.test(key) ? '[redacted]' : redact(item, depth + 1),
      ]),
    )
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`
  return value
}

function write(level: LogLevel, message: string, fields: LogFields = {}): void {
  const configured = (getConfig().LOG_LEVEL ?? 'info') as LogLevel
  if (levels[level] < levels[configured]) return
  const record = {
    ts: new Date().toISOString(),
    level,
    message,
    correlationId: getCorrelationId(),
    ...(redact(fields) as LogFields),
  }
  const line = JSON.stringify(record)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (message: string, fields?: LogFields) => write('debug', message, fields),
  info: (message: string, fields?: LogFields) => write('info', message, fields),
  warn: (message: string, fields?: LogFields) => write('warn', message, fields),
  error: (message: string, fields?: LogFields) => write('error', message, fields),
}

export function errorDetails(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message }
  return { name: 'UnknownError', message: String(error) }
}
