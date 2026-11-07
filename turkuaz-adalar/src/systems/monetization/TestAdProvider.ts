import type { AdConfig, AdResult, RewardConfig } from './AdProvider.ts'
import { AdProvider } from './AdProvider.ts'

/**
 * Test implementation of ad provider for development and testing.
 * Simulates ad behavior with configurable delays and success rates.
 * NEVER use this in production - it does not interact with real ad networks.
 */
export class TestAdProvider extends AdProvider {
  private readonly loadedAds = new Set<string>()
  private readonly minDelay: number
  private readonly successRate: number

  constructor(
    testMode = true,
    options: {
      minDelay?: number
      successRate?: number
    } = {},
  ) {
    super(testMode)
    this.minDelay = options.minDelay ?? 2000
    this.successRate = options.successRate ?? 1.0
  }

  async loadAd(config: AdConfig): Promise<void> {
    if (this.disposed) {
      throw new Error('TestAdProvider has been disposed')
    }

    // Simulate ad loading delay
    await new Promise((resolve) => setTimeout(resolve, 500))
    this.loadedAds.add(config.placementId)
  }

  async showAd(config: AdConfig, rewardConfig?: RewardConfig): Promise<AdResult> {
    if (this.disposed) {
      return { success: false, error: 'Provider disposed' }
    }

    if (!this.isAdReady(config)) {
      return { success: false, error: 'Ad not loaded' }
    }

    if (!this.canShowAd()) {
      return { success: false, error: 'Too soon since last ad' }
    }

    // Simulate ad duration
    await new Promise((resolve) => setTimeout(resolve, this.minDelay))

    // Simulate user skip or completion
    const skipped = Math.random() < 0.1 // 10% skip rate
    const success = !skipped && Math.random() < this.successRate

    this.recordAdShown()

    if (success && config.type === 'rewarded' && rewardConfig) {
      return {
        success: true,
        rewardGranted: true,
        skipped: false,
      }
    }

    if (skipped) {
      return {
        success: false,
        skipped: true,
        error: 'User skipped ad',
      }
    }

    return {
      success: false,
      error: 'Ad failed or not completed',
    }
  }

  isAdReady(config: AdConfig): boolean {
    return this.loadedAds.has(config.placementId)
  }

  isAdsAvailable(): boolean {
    return true
  }

  getMinTimeBetweenAds(): number {
    return this.minDelay
  }

  dispose(): void {
    super.dispose()
    this.loadedAds.clear()
  }
}
