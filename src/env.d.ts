/// <reference types="vite/client" />

/** package.json version, injected by vite.config.ts. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Sentry DSN for remote crash reports. Leave unset to keep crashes local. */
  readonly VITE_SENTRY_DSN?: string
  /** AdMob ad unit IDs. Unset = Google's test ads. See RELEASE.md. */
  readonly VITE_ADMOB_REWARDED_ANDROID?: string
  readonly VITE_ADMOB_REWARDED_IOS?: string
}
