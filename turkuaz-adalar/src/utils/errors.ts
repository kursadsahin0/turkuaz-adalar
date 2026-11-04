export type GameErrorCode =
  | 'WEBGL_UNAVAILABLE'
  | 'PHYSICS_INIT_FAILED'
  | 'NOT_INITIALIZED'
  | 'RUNTIME_ERROR'
  | 'UNKNOWN'

export class GameError extends Error {
  readonly code: GameErrorCode

  constructor(message: string, code: GameErrorCode = 'UNKNOWN', options?: ErrorOptions) {
    super(message, options)
    this.name = 'GameError'
    this.code = code
  }
}

export function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value
  }
  if (typeof value === 'string') {
    return new Error(value)
  }
  return new Error('An unknown error occurred.')
}
