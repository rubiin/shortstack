import { randomBytes, randomUUID } from 'node:crypto'

export function nowIso(): string {
  return new Date().toISOString()
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function isoDay(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}
