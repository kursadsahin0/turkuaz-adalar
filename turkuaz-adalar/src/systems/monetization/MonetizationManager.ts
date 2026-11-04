import type { AdConfig, AdResult, RewardConfig } from './AdProvider.ts'
import { AdProvider } from './AdProvider.ts'
import { TestAdProvider } from './TestAdProvider.ts'

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
    interstitialAdUnitId: string
  }
  /** Test provider configuration */
  testConfig?: {
    minDelay?: number
    successRate?: number
  }
}

export interface MonetizationEvent {
  type: 'ad_loaded' | 'ad_shown' | 'ad_completed' | 'ad_failed' | 'ad_skipped' | 'purchase_completed' | 'purchase_failed'
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

  constructor(config: MonetizationConfig) {
    if (config.provider === 'test') {
      this.provider = new TestAdProvider(config.testMode, config.testConfig)
    } else if (config.provider === 'admob') {
      // TODO: Initialize AdMobProvider when Android SDK is integrated
      throw new Error('AdMobProvider not yet implemented - requires Android SDK integration')
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
  async showRewardedAd(
    config: AdConfig,
    rewardConfig: RewardConfig,
  ): Promise<AdResult> {
    if (this.disposed) {
      return { success: false, error: 'MonetizationManager disposed' }
    }

    if (config.type !== 'rewarded') {
      return { success: false, error: 'Invalid ad type for rewarded ad' }
    }

    const result = await this.provider.showAd(config, rewardConfig)
    this.recordEvent({ type: result.success ? 'ad_completed' : 'ad_failed', timestamp: Date.now(), data: result })

    // Reward is conditional on provider confirmation
    if (!result.success || !result.rewardGranted) {
      return { success: false, error: 'Ad not completed or reward not granted' }
    }

    return result
  }

  /**
   * Show an interstitial ad at appropriate break points.
   */
  async showInterstitialAd(config: AdConfig): Promise<AdResult> {
    if (this.disposed) {
      return { success: false, error: 'MonetizationManager disposed' }
    }

    if (config.type !== 'interstitial') {
      return { success: false, error: 'Invalid ad type for interstitial' }
    }

    const result = await this.provider.showAd(config)
    this.recordEvent({ type: result.success ? 'ad_completed' : 'ad_failed', timestamp: Date.now(), data: result })

    return result
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
    // TODO: Send to analytics service when implemented
  }

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
