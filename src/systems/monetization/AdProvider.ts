/**
 * Abstract advertising provider interface.
 * Implementations can be platform-specific (AdMob for Android, IAP for iOS, web ads for web).
 * All providers must strictly follow platform policies and never simulate ad completion.
 */

/** The game only uses opt-in rewarded ads (never interstitials). */
export type AdType = 'rewarded'

export interface AdConfig {
  /** Unique identifier for the ad placement */
  placementId: string
  /** Type of advertisement */
  type: AdType
  /** Whether to load the ad immediately or on demand */
  loadOnDemand: boolean
}

export interface AdResult {
  /** Whether the ad was successfully shown and completed */
  success: boolean
  /** Error message if failed */
  error?: string
  /** Whether the user skipped the ad */
  skipped?: boolean
  /** Reward granted only if ad provider confirms completion */
  rewardGranted?: boolean
}

export interface RewardConfig {
  /** Reward type (coins, crystals, cosmetics) */
  type: 'coins' | 'crystals' | 'cosmetic'
  /** Amount or identifier of reward */
  amount: number | string
  /** Reward description for UI */
  description: string
}

/**
 * Abstract base class for ad providers.
 * All implementations must ensure:
 * - NEVER simulate ad completion - rewards only granted with provider confirmation
 * - Never grant rewards without provider confirmation
 * - Respect platform policies (frequency, content)
 * - Never interrupt active gameplay unexpectedly
 */
export abstract class AdProvider {
  protected readonly testMode: boolean
  protected disposed = false

  constructor(testMode = false) {
    this.testMode = testMode
  }

  /**
   * Load an advertisement for the given placement.
   * @param config Ad configuration
   * @returns Promise resolving when ad is ready
   */
  abstract loadAd(config: AdConfig): Promise<void>

  /**
   * Show a loaded advertisement.
   * @param config Ad configuration
   * @param rewardConfig Reward configuration (for rewarded ads only)
   * @returns Promise with ad result
   */
  abstract showAd(config: AdConfig, rewardConfig?: RewardConfig): Promise<AdResult>

  /**
   * Check if an ad is ready to show.
   * @param config Ad configuration
   * @returns True if ad is loaded and ready
   */
  abstract isAdReady(config: AdConfig): boolean

  /**
   * Check if ads are available on this platform.
   * @returns True if ads can be shown
   */
  abstract isAdsAvailable(): boolean

  /**
   * Get the minimum time between ads (in milliseconds).
   * Prevents ad spamming and respects platform policies.
   */
  abstract getMinTimeBetweenAds(): number

  /** Optional: switch between personalised and non-personalised requests. */
  setPersonalizedAds?(personalized: boolean): void

  /**
   * Get the last time an ad was shown.
   */
  protected lastAdShown = 0

  /**
   * Check if enough time has passed since the last ad.
   */
  protected canShowAd(): boolean {
    const now = Date.now()
    const elapsed = now - this.lastAdShown
    return elapsed >= this.getMinTimeBetweenAds()
  }

  /**
   * Record that an ad was shown.
   */
  protected recordAdShown(): void {
    this.lastAdShown = Date.now()
  }

  /**
   * Dispose the provider and clean up resources.
   */
  dispose(): void {
    this.disposed = true
  }
}
