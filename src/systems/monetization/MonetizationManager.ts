import type { AdConfig, AdResult, RewardConfig } from './AdProvider.ts'
import type { AdProvider } from './AdProvider.ts'
import { TestAdProvider } from './TestAdProvider.ts'
import { AdMobProvider, resolveAdMobConfig, type AdConsentOutcome } from './AdMobProvider.ts'

export type AdProviderType = 'test' | 'admob'

export interface MonetizationConfig {
  /** Type of ad provider to use */
  provider: AdProviderType
  /** Whether test mode is enabled */
  testMode: boolean
  /** AdMob configuration (if using AdMob) */
  adMobConfig?: {
    appId: string
    rewardedAdUnitId: string
  }
  /** Test provider configuration */
  testConfig?: {
    minDelay?: number
    successRate?: number
  }
}

export interface MonetizationEvent {
  type:
    | 'ad_loaded'
    | 'ad_shown'
    | 'ad_completed'
    | 'ad_failed'
    | 'ad_skipped'
    | 'interstitial_shown'
    | 'purchase_completed'
    | 'purchase_failed'
  timestamp: number
  data?: unknown
}

/**
 * Monetization manager that coordinates ads and purchases.
 * Separates monetization logic from gameplay with clear integration points.
 */
export class MonetizationManager {
  private readonly provider: AdProvider
  private readonly events: MonetizationEvent[] = []
  private disposed = false
  private personalizedAds = false

  constructor(config: MonetizationConfig) {
    if (config.provider === 'test') {
      this.provider = new TestAdProvider(config.testMode, config.testConfig)
    } else if (config.provider === 'admob') {
      this.provider = new AdMobProvider(config.testMode, resolveAdMobConfig())
    } else {
      throw new Error(`Unknown ad provider: ${config.provider}`)
    }
  }

  /**
   * Load an advertisement for later display.
   */
  async loadAd(config: AdConfig): Promise<void> {
    if (this.disposed) {
      throw new Error('MonetizationManager has been disposed')
    }

    await this.provider.loadAd(config)
    this.recordEvent({ type: 'ad_loaded', timestamp: Date.now(), data: config })
  }

  /**
   * Show a rewarded ad and grant reward on completion.
   * Reward is ONLY granted if ad provider confirms completion.
   * Do not interrupt active gameplay - show at break points only.
   */
  async showRewardedAd(config: AdConfig, rewardConfig: RewardConfig): Promise<AdResult> {
    if (this.disposed) {
      return { success: false, error: 'MonetizationManager disposed' }
    }

    if (config.type !== 'rewarded') {
      return { success: false, error: 'Invalid ad type for rewarded ad' }
    }

    const result = await this.provider.showAd(config, rewardConfig)
    this.lastRewardedAt = Date.now()
    this.recordEvent({
      type: result.success ? 'ad_completed' : 'ad_failed',
      timestamp: Date.now(),
      data: result,
    })

    // Reward is conditional on provider confirmation
    if (!result.success || !result.rewardGranted) {
      return { success: false, error: 'Ad not completed or reward not granted' }
    }

    return result
  }

  /**
   * Native start-up privacy flow (UMP form where required, iOS tracking
   * prompt). No-op for the test provider.
   */
  async prepareConsent(): Promise<AdConsentOutcome | null> {
    return this.provider instanceof AdMobProvider ? this.provider.prepareConsent() : null
  }

  async showPrivacyOptions(): Promise<void> {
    if (this.provider instanceof AdMobProvider) {
      await this.provider.showPrivacyOptions()
    }
  }

  /**
   * Applies the player's consent choice. Providers that support it (AdMob:
   * `npa=1` for non-personalised requests) read this before each request.
   */
  private bannerHeight: ((height: number) => void) | null = null
  /** When the last rewarded ad closed (ms epoch), 0 = never. */
  lastRewardedAt = 0

  setPersonalizedAds(personalized: boolean): void {
    const changed = personalized !== this.personalizedAds
    this.personalizedAds = personalized
    this.provider.setPersonalizedAds?.(personalized)
    // A banner requested under the old choice is reloaded under the new one.
    if (changed && this.bannerHeight) {
      void this.showBanner(this.bannerHeight)
    }
  }

  /** Preloads the between-islands full-screen ad (native AdMob only). */
  prepareInterstitial(): Promise<boolean> {
    return this.provider instanceof AdMobProvider
      ? this.provider.prepareInterstitial()
      : Promise.resolve(false)
  }

  /** Shows the preloaded full-screen ad; resolves after it closes. */
  async showInterstitial(): Promise<boolean> {
    if (!(this.provider instanceof AdMobProvider)) {
      return false
    }
    const shown = await this.provider.showInterstitial()
    if (shown) {
      this.recordEvent({ type: 'interstitial_shown', timestamp: Date.now() })
    }
    return shown
  }

  /**
   * Shows the always-on bottom banner (native AdMob only). `onHeight` gets
   * its height in CSS pixels, 0 when it is gone. Returns whether a banner
   * is (being) shown.
   */
  async showBanner(onHeight: (height: number) => void): Promise<boolean> {
    if (!(this.provider instanceof AdMobProvider)) {
      return false
    }
    this.bannerHeight = onHeight
    return this.provider.showBanner(onHeight)
  }

  get personalizedAdsAllowed(): boolean {
    return this.personalizedAds
  }

  /**
   * Check if an ad is ready to show.
   */
  isAdReady(config: AdConfig): boolean {
    return this.provider.isAdReady(config)
  }

  /**
   * Check if ads are available on this platform.
   */
  isAdsAvailable(): boolean {
    return this.provider.isAdsAvailable()
  }

  /**
   * Get minimum time between ads.
   */
  getMinTimeBetweenAds(): number {
    return this.provider.getMinTimeBetweenAds()
  }

  /**
   * Record a monetization event for analytics.
   */
  private recordEvent(event: MonetizationEvent): void {
    this.events.push(event)
    this.onEvent?.(event)
  }

  /** Forwards ad events to analytics (set by the game). */
  onEvent: ((event: MonetizationEvent) => void) | null = null

  /**
   * Get all recorded events.
   */
  getEvents(): MonetizationEvent[] {
    return [...this.events]
  }

  /**
   * Clear recorded events.
   */
  clearEvents(): void {
    this.events.length = 0
  }

  /**
   * Dispose the manager and underlying provider.
   */
  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.provider.dispose()
  }
}
