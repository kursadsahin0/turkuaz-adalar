import type { DoubleCoinsOffer } from '../../ui/components/DoubleCoinsButton.ts'
import { Logger } from '../../utils/logger.ts'
import type { GameServices } from './GameServices.ts'

/**
 * After a run: watch a rewarded ad to collect the run's coins a second time.
 * Once per run, and only after the SDK reports the reward.
 */
export class DoubleCoinsController {
  private readonly logger = new Logger('DoubleCoins')
  private readonly services: GameServices
  private runCoins = 0
  private used = false
  private watching = false

  constructor(services: GameServices) {
    this.services = services
  }

  /** Called at the start of every run. */
  reset(): void {
    this.runCoins = 0
    this.used = false
    this.watching = false
  }

  /** The offer for the summary screen of a finished run. */
  offerFor(coins: number): DoubleCoinsOffer {
    this.runCoins = Math.max(0, Math.floor(coins))
    const { consent, monetization } = this.services
    return {
      coins: this.runCoins,
      available:
        this.runCoins > 0 && !this.used && !consent.needsPrompt && monetization.isAdsAvailable(),
    }
  }

  async watch(): Promise<void> {
    if (this.used || this.watching || this.runCoins <= 0) {
      return
    }
    const { ui, monetization, progression, telemetry, audio, haptics } = this.services
    this.watching = true
    ui.setDoubleCoinsState('playing')
    const config = { placementId: 'double-coins', type: 'rewarded' as const, loadOnDemand: true }
    let rewarded = false
    try {
      if (!monetization.isAdReady(config)) {
        await monetization.loadAd(config)
      }
      const result = await monetization.showRewardedAd(config, {
        type: 'coins',
        amount: this.runCoins,
        description: 'Double the coins from this run',
      })
      rewarded = result.success
    } catch (error) {
      this.logger.warn('Rewarded ad failed.', error)
    }
    this.watching = false
    if (!rewarded) {
      ui.setDoubleCoinsState('failed')
      return
    }
    this.used = true
    progression.creditCoins(this.runCoins)
    telemetry.track('double_coins', { coins: this.runCoins })
    audio?.play('reward')
    haptics.pulse('reward')
    ui.setDoubleCoinsState('done')
  }
}
