import type { AdConfig, AdResult, RewardConfig } from './AdProvider.ts'
import { AdProvider } from './AdProvider.ts'

/**
 * AdMob integration interface for future Android version.
 * This is a placeholder that shows the integration points for real AdMob SDK.
 * 
 * INTEGRATION NOTES:
 * - Install Google Mobile Ads SDK via Gradle
 * - Add AdMob app ID to AndroidManifest.xml
 * - Configure rewarded and interstitial ad units
 * - Implement lifecycle callbacks (onAdLoaded, onAdFailedToLoad, onAdOpened, onAdClosed)
 * - Handle GDPR/CCPA consent if required
 * - Test with test ad units before production
 * 
 * TEST AD UNIT IDs (for development only):
 * - Rewarded: ca-app-pub-3940256099942544/5224354917
 * - Interstitial: ca-app-pub-3940256099942544/1033173717
 * 
 * WARNING: NEVER use real ad IDs in development. Use test IDs from AdMob console.
 */
export class AdMobProvider extends AdProvider {
  // TODO: Use these when implementing AdMob SDK
  // private readonly _appId: string
  // private readonly _rewardedAdUnitId: string
  // private readonly _interstitialAdUnitId: string

  constructor(
    testMode = false,
    _config: {
      appId: string
      rewardedAdUnitId: string
      interstitialAdUnitId: string
    },
  ) {
    super(testMode)
    // TODO: Store config when implementing AdMob SDK
    // this._appId = config.appId
    // this._rewardedAdUnitId = config.rewardedAdUnitId
    // this._interstitialAdUnitId = config.interstitialAdUnitId
  }

  async loadAd(_config: AdConfig): Promise<void> {
    // TODO: Implement AdMob SDK loading
    // Example pseudocode:
    // if (config.type === 'rewarded') {
    //   RewardedAd.load(this.rewardedAdUnitId, this.loadCallback)
    // } else {
    //   InterstitialAd.load(this.interstitialAdUnitId, this.loadCallback)
    // }
    throw new Error('AdMobProvider not yet implemented - requires Android SDK integration')
  }

  async showAd(_config: AdConfig, _rewardConfig?: RewardConfig): Promise<AdResult> {
    // TODO: Implement AdMob SDK showing
    // Example pseudocode:
    // if (config.type === 'rewarded') {
    //   RewardedAd.show(this.rewardedAdUnitId, this.showCallback)
    // } else {
    //   InterstitialAd.show(this.interstitialAdUnitId, this.showCallback)
    // }
    throw new Error('AdMobProvider not yet implemented - requires Android SDK integration')
  }

  isAdReady(_config: AdConfig): boolean {
    // TODO: Check if ad is loaded via AdMob SDK
    return false
  }

  isAdsAvailable(): boolean {
    // TODO: Check if AdMob SDK is available on platform
    return false
  }

  getMinTimeBetweenAds(): number {
    // AdMob recommends minimum 30 seconds between ads
    return 30000
  }

  // TODO: Handle AdMob load callback
  // private loadCallback(_error?: Error): void {}

  // TODO: Handle AdMob show callback
  // private showCallback(_error?: Error): void {}
}
