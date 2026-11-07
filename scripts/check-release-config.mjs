/**
 * Refuses a store build that would ship Google's test ads (or no ads at all):
 * every AdMob ID must be real, well-formed and from one publisher.
 *
 *   npm run release:check            # both platforms
 *   npm run release:check -- android # one platform
 *
 * Exit code 1 lists what to fix. See RELEASE.md → "Ads (AdMob)".
 */
import { loadEnv } from 'vite'
import { loadAdMobIds, problemWith, publisherOf, ROOT } from './admob-config.mjs'

const only = process.argv.slice(2).find((arg) => arg === 'android' || arg === 'ios')
const platforms = only ? [only] : ['android', 'ios']
const keys = {
  android: ['ADMOB_APP_ID_ANDROID', 'VITE_ADMOB_REWARDED_ANDROID'],
  ios: ['ADMOB_APP_ID_IOS', 'VITE_ADMOB_REWARDED_IOS'],
}

const ids = loadAdMobIds()
const problems = []
for (const platform of platforms) {
  for (const key of keys[platform]) {
    const problem = problemWith(key, ids[key])
    console.log(`  ${problem ? '✗' : '✓'} ${key.padEnd(28)} ${problem ?? ids[key]}`)
    if (problem) {
      problems.push(`${key}: ${problem}`)
    }
  }
}

const publishers = new Set(
  platforms
    .flatMap((platform) => keys[platform])
    .map((key) => publisherOf(ids[key]))
    .filter(Boolean),
)
if (problems.length === 0 && publishers.size > 1) {
  problems.push('the IDs come from different AdMob accounts (publisher IDs differ)')
}

if (problems.length > 0) {
  console.error(
    '\nRelease blocked: this build would not show your own ads.\n' +
      `  - ${problems.join('\n  - ')}\n\n` +
      'Put your AdMob IDs in .env.production.local (copy .env.example) or set\n' +
      'them as environment variables / CI secrets. See RELEASE.md → "Ads (AdMob)".',
  )
  process.exit(1)
}
console.log(`\nAdMob IDs ready for ${platforms.join(' and ')}.`)

// Crash reports are optional, so a missing DSN only warns.
const sentry = (
  process.env.VITE_SENTRY_DSN ??
  loadEnv('production', ROOT, '').VITE_SENTRY_DSN ??
  ''
).trim()
if (!sentry) {
  console.warn(
    'Note: VITE_SENTRY_DSN is not set, so crashes stay in the on-device log only.\n' +
      'Add your Sentry DSN to .env.production.local to receive crash reports.',
  )
}

const analytics = (
  process.env.VITE_ANALYTICS_KEY ??
  loadEnv('production', ROOT, '').VITE_ANALYTICS_KEY ??
  ''
).trim()
if (!analytics) {
  console.warn(
    'Note: VITE_ANALYTICS_KEY is not set, so usage events (where players stop) stay on the device.\n' +
      'Add a PostHog project key to .env.production.local to see funnels. See RELEASE.md.',
  )
}
