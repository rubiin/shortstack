export type UserRole = 'owner' | 'member'

export type AuthUser = {
  id: string
  workspaceId: string
  email: string
  name: string
  role: UserRole
}

export function canArchiveLinks(user: Pick<AuthUser, 'role'>): boolean {
  return user.role === 'owner'
}

export function canRestoreLinks(user: Pick<AuthUser, 'role'>): boolean {
  return user.role === 'owner'
}

export function belongsToWorkspace(
  user: Pick<AuthUser, 'workspaceId'>,
  resourceWorkspaceId: string,
): boolean {
  return user.workspaceId === resourceWorkspaceId
}

export class AuthorizationError extends Error {
  readonly status = 403
  constructor(message = 'You do not have permission to do that.') {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends Error {
  readonly status = 404
  constructor(message = 'Not found.') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends Error {
  readonly status = 400
  readonly fields?: Record<string, string>
  constructor(message: string, fields?: Record<string, string>) {
    super(message)
    this.name = 'ValidationError'
    this.fields = fields
  }
}

export class RateLimitError extends Error {
  readonly status = 429
  readonly retryAfterSeconds: number
  constructor(retryAfterSeconds: number) {
    super('Too many attempts. Take a short pause and try again.')
    this.name = 'RateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export class ConflictError extends Error {
  readonly status = 409
  constructor(message = 'That change conflicts with existing data.') {
    super(message)
    this.name = 'ConflictError'
  }
}
