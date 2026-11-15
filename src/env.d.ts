/// <reference types="vite/client" />

/** package.json version, injected by vite.config.ts. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Sentry DSN for remote crash reports. Leave unset to keep crashes local. */
  readonly VITE_SENTRY_DSN?: string
  /** PostHog project API key for anonymous usage analytics. Unset = no upload. */
  readonly VITE_ANALYTICS_KEY?: string
  /** PostHog ingestion host; defaults to https://eu.i.posthog.com */
  readonly VITE_ANALYTICS_HOST?: string
  /** AdMob ad unit IDs. Unset = Google's test ads. See RELEASE.md. */
  readonly VITE_ADMOB_REWARDED_ANDROID?: string
  readonly VITE_ADMOB_REWARDED_IOS?: string
  /** The always-on bottom banner. Unset in a store build = no banner. */
  readonly VITE_ADMOB_BANNER_ANDROID?: string
  readonly VITE_ADMOB_BANNER_IOS?: string
  /** Full-screen ad between islands. Unset in a store build = none. */
  readonly VITE_ADMOB_INTERSTITIAL_ANDROID?: string
  readonly VITE_ADMOB_INTERSTITIAL_IOS?: string
}
