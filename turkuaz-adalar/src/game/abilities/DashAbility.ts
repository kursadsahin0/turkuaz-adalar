import { GAME_CONFIG } from '../../config/GameConfig.ts'
import { clamp } from '../../utils/math.ts'

/**
 * Dash ability state machine. The speed multiplier is read by the player while
 * the HUD reads `charge` for its cooldown ring.
 */
export class DashAbility {
  private activeRemaining = 0
  private cooldownRemaining = 0

  get isActive(): boolean {
    return this.activeRemaining > 0
  }

  get isReady(): boolean {
    return this.cooldownRemaining <= 0
  }

  get speedMultiplier(): number {
    return this.isActive ? GAME_CONFIG.dash.speedMultiplier : 1
  }

  get charge(): number {
    if (this.isReady) {
      return 1
    }
    return clamp(1 - this.cooldownRemaining / GAME_CONFIG.dash.cooldown, 0, 1)
  }

  get cooldownRemainingSeconds(): number {
    return Math.max(0, this.cooldownRemaining)
  }

  tryActivate(): boolean {
    if (!this.isReady) {
      return false
    }

    this.activeRemaining = GAME_CONFIG.dash.duration
    this.cooldownRemaining = GAME_CONFIG.dash.cooldown
    return true
  }

  update(delta: number): void {
    this.activeRemaining = Math.max(0, this.activeRemaining - delta)
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - delta)
  }

  reset(): void {
    this.activeRemaining = 0
    this.cooldownRemaining = 0
  }
}
