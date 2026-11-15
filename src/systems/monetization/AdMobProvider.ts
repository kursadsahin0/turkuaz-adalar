import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
  MaxAdContentRating,
  RewardAdPluginEvents,
} from '@capacitor-community/admob'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { Logger } from '../../utils/logger.ts'
import type { AdConfig, AdResult, RewardConfig } from './AdProvider.ts'
import { AdProvider } from './AdProvider.ts'

/**
 * Google's public test IDs. They always serve test ads, so a build can never
 * earn (or be banned for) invalid traffic by accident. Real IDs come from
 * VITE_ADMOB_* variables at build time; see RELEASE.md.
 *
 * WARNING: NEVER use real ad IDs in development builds.
 */
export const ADMOB_TEST_IDS = {
  android: {
    appId: 'ca-app-pub-3940256099942544~3347511713',
    rewardedAdUnitId: 'ca-app-pub-3940256099942544/5224354917',
    bannerAdUnitId: 'ca-app-pub-3940256099942544/9214589741',
    interstitialAdUnitId: 'ca-app-pub-3940256099942544/1033173712',
  },
  ios: {
    appId: 'ca-app-pub-3940256099942544~1458002511',
    rewardedAdUnitId: 'ca-app-pub-3940256099942544/1712485313',
    bannerAdUnitId: 'ca-app-pub-3940256099942544/2435281174',
    interstitialAdUnitId: 'ca-app-pub-3940256099942544/4411468910',
  },
} as const

/** The plugin does not export this enum; its value is the string 'REQUIRED'. */
const PRIVACY_OPTIONS_REQUIRED = 'REQUIRED'

export interface AdMobConfig {
  /** Informational: the app ID itself is set natively (manifest / Info.plist). */
  readonly appId: string
  readonly rewardedAdUnitId: string
  /**
   * The always-on bottom banner, or null for none: a store build without a
   * real banner unit shows no banner rather than Google's test banner.
   */
  readonly bannerAdUnitId: string | null
  /** Full-screen ad between islands (paced by InterstitialPacing), or null for none. */
  readonly interstitialAdUnitId: string | null
}

/** Result of the start-up privacy flow (UMP + App Tracking Transparency). */
export interface AdConsentOutcome {
  /** Google's consent platform handled the choice (EEA, UK, Switzerland). */
  readonly handledByUmp: boolean
  /** Ads may be requested at all. */
  readonly canRequestAds: boolean
  /** Settings should offer "Ad privacy options" (UMP requires it in those regions). */
  readonly privacyOptionsRequired: boolean
}

/**
 * Picks the ad unit IDs for this platform: real ones when provided at build
 * time, Google's test IDs otherwise.
 */
export function resolveAdMobConfig(): AdMobConfig & { readonly testing: boolean } {
  const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'
  const env = import.meta.env
  const rewarded =
    platform === 'ios' ? env.VITE_ADMOB_REWARDED_IOS : env.VITE_ADMOB_REWARDED_ANDROID
  const banner = platform === 'ios' ? env.VITE_ADMOB_BANNER_IOS : env.VITE_ADMOB_BANNER_ANDROID
  const interstitial =
    platform === 'ios' ? env.VITE_ADMOB_INTERSTITIAL_IOS : env.VITE_ADMOB_INTERSTITIAL_ANDROID
  const test = ADMOB_TEST_IDS[platform]
  const testing = !rewarded
  return {
    appId: test.appId,
    rewardedAdUnitId: rewarded || test.rewardedAdUnitId,
    bannerAdUnitId: banner || (testing ? test.bannerAdUnitId : null),
    interstitialAdUnitId: interstitial || (testing ? test.interstitialAdUnitId : null),
    testing,
  }
}

/**
 * Google AdMob through @capacitor-community/admob (Android and iOS).
 *
 * INTEGRATION NOTES:
 * - `prepareConsent()` runs Google's UMP form where the law requires it and
 *   the iOS App Tracking Transparency prompt, then initialises the SDK.
 * - Rewarded ads grant the reward only on the SDK's reward callback; closing
 *   the ad early resolves as "not rewarded" (the plugin's show() promise would
 *   otherwise never settle).
 * - Requests are non-personalised (`npa`) unless the player allowed
 *   personalised ads in the game's own prompt.
 */
export class AdMobProvider extends AdProvider {
  private readonly logger = new Logger('AdMob')
  private readonly config: AdMobConfig
  private readonly testing: boolean
  private initialized = false
  private ready = new Set<string>()
  private loading = new Map<string, Promise<void>>()
  private personalized = false
  private bannerShown = false
  private interstitialReady = false
  private bannerSizeListener: PluginListenerHandle | null = null

  constructor(testMode = false, config: AdMobConfig & { readonly testing?: boolean }) {
    super(testMode)
    this.config = config
    this.testing = testMode || config.testing === true
  }

  /** Runs once at start-up, before any ad is requested. */
  async prepareConsent(): Promise<AdConsentOutcome> {
    let handledByUmp = false
    let canRequestAds = true
    let privacyOptionsRequired = false
    try {
      const info = await AdMob.requestConsentInfo()
      handledByUmp = info.status !== AdmobConsentStatus.NOT_REQUIRED
      if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
        const after = await AdMob.showConsentForm()
        canRequestAds = after.canRequestAds
        privacyOptionsRequired =
          String(after.privacyOptionsRequirementStatus) === PRIVACY_OPTIONS_REQUIRED
      } else {
        canRequestAds = info.canRequestAds
        privacyOptionsRequired =
          String(info.privacyOptionsRequirementStatus) === PRIVACY_OPTIONS_REQUIRED
      }
    } catch (error) {
      // Offline or misconfigured: keep going with non-personalised requests.
      this.logger.warn('Consent info unavailable.', error)
    }

    if (Capacitor.getPlatform() === 'ios') {
      try {
        const { status } = await AdMob.trackingAuthorizationStatus()
        if (status === 'notDetermined') {
          await AdMob.requestTrackingAuthorization()
        }
      } catch (error) {
        this.logger.warn('App Tracking Transparency prompt failed.', error)
      }
    }

    await this.initialize()
    return { handledByUmp, canRequestAds, privacyOptionsRequired }
  }

  /** "Ad privacy options" from Settings, for players in UMP regions. */
  async showPrivacyOptions(): Promise<void> {
    await AdMob.showPrivacyOptionsForm()
  }

  setPersonalizedAds(personalized: boolean): void {
    this.personalized = personalized
    // Ads loaded under the previous choice must not be shown under the new one.
    this.ready.clear()
    this.interstitialReady = false
  }

  async loadAd(config: AdConfig): Promise<void> {
    if (this.disposed) {
      throw new Error('AdMobProvider has been disposed')
    }
    const pending = this.loading.get(config.placementId)
    if (pending) {
      return pending
    }
    const load = (async () => {
      await this.initialize()
      if (config.type !== 'rewarded') {
        throw new Error('Only rewarded ads are used by this game.')
      }
      await AdMob.prepareRewardVideoAd({
        adId: this.config.rewardedAdUnitId,
        isTesting: this.testing,
        npa: !this.personalized,
      })
      this.ready.add(config.placementId)
    })().finally(() => this.loading.delete(config.placementId))
    this.loading.set(config.placementId, load)
    return load
  }

  async showAd(config: AdConfig, _rewardConfig?: RewardConfig): Promise<AdResult> {
    if (this.disposed) {
      return { success: false, error: 'Provider disposed' }
    }
    if (!this.ready.has(config.placementId)) {
      try {
        await this.loadAd(config)
      } catch (error) {
        return { success: false, error: errorMessage(error) }
      }
    }
    if (!this.canShowAd()) {
      return { success: false, error: 'Too soon since last ad' }
    }
    this.ready.delete(config.placementId)

    const handles: PluginListenerHandle[] = []
    try {
      const outcome = new Promise<AdResult>((resolve) => {
        let rewarded = false
        void AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
          rewarded = true
        }).then((handle) => handles.push(handle))
        void AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
          resolve(
            rewarded ? { success: true, rewardGranted: true } : { success: false, skipped: true },
          )
        }).then((handle) => handles.push(handle))
        void AdMob.addListener(RewardAdPluginEvents.FailedToShow, (error) => {
          resolve({ success: false, error: error.message })
        }).then((handle) => handles.push(handle))
      })
      void AdMob.showRewardVideoAd().catch(() => undefined)
      const result = await outcome
      this.recordAdShown()
      return result
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    } finally {
      for (const handle of handles) {
        void handle.remove()
      }
    }
  }

  isAdReady(config: AdConfig): boolean {
    return this.ready.has(config.placementId)
  }

  isAdsAvailable(): boolean {
    return Capacitor.isNativePlatform() && !this.disposed
  }

  getMinTimeBetweenAds(): number {
    // Rewarded ads are opt-in; a short guard only stops double taps.
    return 3000
  }

  /**
   * Shows the adaptive banner at the bottom of the screen (or reloads it, e.g.
   * after the personalisation choice changed). `onHeight` receives the
   * banner's height in CSS pixels, 0 when it is gone, so the game can keep
   * its own controls clear of it.
   */
  async showBanner(onHeight: (height: number) => void): Promise<boolean> {
    const adId = this.config.bannerAdUnitId
    if (this.disposed || !adId) {
      return false
    }
    try {
      await this.initialize()
      if (!this.bannerSizeListener) {
        this.bannerSizeListener = await AdMob.addListener(
          BannerAdPluginEvents.SizeChanged,
          (size) => onHeight(Math.max(0, size.height)),
        )
      }
      if (this.bannerShown) {
        await AdMob.removeBanner().catch(() => undefined)
      }
      await AdMob.showBanner({
        adId,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: 0,
        isTesting: this.testing,
        npa: !this.personalized,
      })
      this.bannerShown = true
      return true
    } catch (error) {
      this.logger.warn('Banner could not be shown.', error)
      return false
    }
  }

  /** Loads the full-screen ad in the background so it can show without a wait. */
  async prepareInterstitial(): Promise<boolean> {
    const adId = this.config.interstitialAdUnitId
    if (this.disposed || !adId) {
      return false
    }
    if (this.interstitialReady) {
      return true
    }
    try {
      await this.initialize()
      await AdMob.prepareInterstitial({ adId, isTesting: this.testing, npa: !this.personalized })
      this.interstitialReady = true
      return true
    } catch (error) {
      this.logger.warn('Interstitial could not be loaded.', error)
      return false
    }
  }

  /**
   * Shows the prepared full-screen ad and resolves once it is closed (or could
   * not be shown). Returns whether an ad was actually shown.
   */
  async showInterstitial(): Promise<boolean> {
    if (this.disposed || !this.interstitialReady) {
      return false
    }
    this.interstitialReady = false
    const handles: PluginListenerHandle[] = []
    try {
      const outcome = new Promise<boolean>((resolve) => {
        void AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => resolve(true)).then(
          (handle) => handles.push(handle),
        )
        void AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => resolve(false)).then(
          (handle) => handles.push(handle),
        )
      })
      await AdMob.showInterstitial()
      return await outcome
    } catch (error) {
      this.logger.warn('Interstitial could not be shown.', error)
      return false
    } finally {
      for (const handle of handles) {
        void handle.remove()
      }
    }
  }

  async removeBanner(): Promise<void> {
    if (!this.bannerShown) {
      return
    }
    this.bannerShown = false
    await AdMob.removeBanner().catch(() => undefined)
  }

  dispose(): void {
    super.dispose()
    this.ready.clear()
    void this.removeBanner()
    void this.bannerSizeListener?.remove()
    this.bannerSizeListener = null
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    await AdMob.initialize({
      initializeForTesting: this.testing,
      // The game is declared for 13+: no ad rated above Teen may be served.
      maxAdContentRating: MaxAdContentRating.Teen,
    })
    this.initialized = true
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
