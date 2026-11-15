/**
 * Writes the AdMob iOS app ID into Info.plist (GADApplicationIdentifier):
 * ADMOB_APP_ID_IOS from .env.production.local / the environment, otherwise
 * Google's test app ID. Run by `npm run ios:sync`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAdMobIds, problemWith, ROOT, TEST_IDS } from './admob-config.mjs'

const configured = loadAdMobIds().ADMOB_APP_ID_IOS
const problem = configured ? problemWith('ADMOB_APP_ID_IOS', configured) : null
if (configured && problem && problem !== "Google's test ID") {
  console.error(`ADMOB_APP_ID_IOS: ${problem}`)
  process.exit(1)
}
const appId = configured || TEST_IDS.ADMOB_APP_ID_IOS

const plist = join(ROOT, 'ios/App/App/Info.plist')
const before = readFileSync(plist, 'utf8')
const pattern = /(<key>GADApplicationIdentifier<\/key>\s*<string>)[^<]*(<\/string>)/
if (!pattern.test(before)) {
  console.error('GADApplicationIdentifier not found in Info.plist.')
  process.exit(1)
}
const after = before.replace(pattern, `$1${appId}$2`)
if (after !== before) {
  writeFileSync(plist, after)
}
console.log(`iOS AdMob app ID: ${appId}${configured ? '' : " (Google's test ID)"}`)
