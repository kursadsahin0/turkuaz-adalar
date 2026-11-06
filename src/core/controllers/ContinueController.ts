import { Logger } from '../../utils/logger.ts'
import type { GameServices } from './GameServices.ts'

/** Continues allowed per run, and their coin prices (escalating). */
const CONTINUE_COSTS = [100, 250] as const
const CONTINUE_OFFER_SECONDS = 6

export interface ContinueHooks {
  /** True while the "continue?" offer is on screen. */
  readonly isOffering: () => boolean
  readonly isDisposed: () => boolean
  /** Puts the runner back on the track. */
  readonly revive: () => void
}

/**
 * The second-chance offer after a crash: an escalating coin price, or one
 * rewarded ad per run.
 */
export class ContinueController {
  private readonly logger = new Logger('Continue')
  private used = 0
  private adUsed = false

  private readonly services: GameServices
  private readonly hooks: ContinueHooks

  constructor(services: GameServices, hooks: ContinueHooks) {
    this.services = services
    this.hooks = hooks
  }

  /** Called at the start of every run. */
  reset(): void {
    this.used = 0
    this.adUsed = false
  }

  get continuesUsed(): number {
    return this.used
  }

  /** Whether a crash should offer a continue rather than end the run. */
  get canOffer(): boolean {
    return this.used < CONTINUE_COSTS.length
  }

  showOffer(): void {
    const { ui, progression, consent, monetization } = this.services
    const cost = CONTINUE_COSTS[this.used]
    ui.showContinue({
      cost,
      canAfford: progression.balance('coins') >= cost,
      adAvailable: !this.adUsed && !consent.needsPrompt && monetization.isAdsAvailable(),
      seconds: CONTINUE_OFFER_SECONDS,
    })
  }

  payWithCoins(): void {
    if (!this.hooks.isOffering()) {
      return
    }
    const cost = CONTINUE_COSTS[this.used]
    if (!this.services.progression.trySpend('coins', cost)) {
      return
    }
    this.services.telemetry.track('continue', { method: 'coins', cost })
    this.revive()
  }

  async watchAd(): Promise<void> {
    if (!this.hooks.isOffering() || this.adUsed) {
      return
    }
    const { ui, monetization, telemetry } = this.services
    ui.setContinueAdPlaying(true)
    const config = { placementId: 'continue', type: 'rewarded' as const, loadOnDemand: true }
    let completed = false
    try {
      if (!monetization.isAdReady(config)) {
        await monetization.loadAd(config)
      }
      const result = await monetization.showRewardedAd(config, {
        type: 'coins',
        amount: 0,
        description: 'Continue the run',
      })
      completed = result.success
    } catch (error) {
      this.logger.warn('Rewarded ad failed.', error)
    }
    // The player may have skipped, or the game moved on, while the ad played.
    if (!this.hooks.isOffering() || this.hooks.isDisposed()) {
      return
    }
    if (completed) {
      this.adUsed = true
      telemetry.track('continue', { method: 'ad' })
      this.revive()
    } else {
      ui.setContinueAdPlaying(false, true)
    }
  }

  private revive(): void {
    this.used += 1
    this.hooks.revive()
  }
}
