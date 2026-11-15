export type AssetErrorCode =
  | 'ASSET_NOT_REGISTERED'
  | 'ASSET_FETCH_FAILED'
  | 'ASSET_INVALID'
  | 'ASSET_PARSE_FAILED'
  | 'ASSET_EMPTY'
  | 'ASSET_DISPOSED'

export interface AssetErrorOptions extends ErrorOptions {
  assetId: string
  url?: string
}

/**
 * Every failure raised by the asset pipeline is tagged with the asset id and
 * URL. That makes the console message actionable instead of a generic loader
 * error, and lets callers distinguish "no such asset" from "invalid binary".
 */
export class AssetError extends Error {
  readonly code: AssetErrorCode
  readonly assetId: string
  readonly url: string | undefined

  constructor(message: string, code: AssetErrorCode, options: AssetErrorOptions) {
    super(message, options)
    this.name = 'AssetError'
    this.code = code
    this.assetId = options.assetId
    this.url = options.url
  }
}
