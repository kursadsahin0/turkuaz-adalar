/**
 * AdMob IDs for release builds, read from `.env.production.local` (git-ignored)
 * or the environment (CI secrets). Only production builds load that file, so
 * `npm run dev` and the browser always stay on Google's test IDs.
 *
 *   ADMOB_APP_ID_ANDROID=ca-app-pub-1234567890123456~1234567890
 *   ADMOB_APP_ID_IOS=ca-app-pub-1234567890123456~0987654321
 *   VITE_ADMOB_REWARDED_ANDROID=ca-app-pub-1234567890123456/1111111111
 *   VITE_ADMOB_REWARDED_IOS=ca-app-pub-1234567890123456/2222222222
 *   VITE_ADMOB_BANNER_ANDROID=ca-app-pub-1234567890123456/3333333333
 *   VITE_ADMOB_BANNER_IOS=ca-app-pub-1234567890123456/4444444444
 *   VITE_ADMOB_INTERSTITIAL_ANDROID=ca-app-pub-1234567890123456/5555555555
 *   VITE_ADMOB_INTERSTITIAL_IOS=ca-app-pub-1234567890123456/6666666666
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Google's published sample publisher: these IDs only ever serve test ads. */
export const TEST_PUBLISHER = '3940256099942544'
export const TEST_IDS = {
  ADMOB_APP_ID_ANDROID: 'ca-app-pub-3940256099942544~3347511713',
  ADMOB_APP_ID_IOS: 'ca-app-pub-3940256099942544~1458002511',
  VITE_ADMOB_REWARDED_ANDROID: 'ca-app-pub-3940256099942544/5224354917',
  VITE_ADMOB_REWARDED_IOS: 'ca-app-pub-3940256099942544/1712485313',
  VITE_ADMOB_BANNER_ANDROID: 'ca-app-pub-3940256099942544/9214589741',
  VITE_ADMOB_BANNER_IOS: 'ca-app-pub-3940256099942544/2435281174',
  VITE_ADMOB_INTERSTITIAL_ANDROID: 'ca-app-pub-3940256099942544/1033173712',
  VITE_ADMOB_INTERSTITIAL_IOS: 'ca-app-pub-3940256099942544/4411468910',
}

const APP_ID = /^ca-app-pub-(\d{16})~\d{10}$/
const AD_UNIT = /^ca-app-pub-(\d{16})\/\d{10}$/

/** The eight IDs; missing ones are `''`. Environment variables win over the file. */
export function loadAdMobIds() {
  const env = loadEnv('production', ROOT, '')
  const read = (key) => (process.env[key] ?? env[key] ?? '').trim()
  return Object.fromEntries(Object.keys(TEST_IDS).map((key) => [key, read(key)]))
}

/**
 * Checks one ID. Returns null when it is a real, well-formed ID, otherwise a
 * short reason.
 */
export function problemWith(key, value) {
  if (!value) {
    return 'missing'
  }
  const pattern = key.startsWith('VITE_') ? AD_UNIT : APP_ID
  const match = pattern.exec(value)
  if (!match) {
    return key.startsWith('VITE_')
      ? 'not an ad unit ID (ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY)'
      : 'not an app ID (ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY)'
  }
  if (match[1] === TEST_PUBLISHER) {
    return "Google's test ID"
  }
  return null
}

/** The publisher part of an ID (the 16 digits), or null. */
export function publisherOf(value) {
  return /^ca-app-pub-(\d{16})[~/]/.exec(value)?.[1] ?? null
}
