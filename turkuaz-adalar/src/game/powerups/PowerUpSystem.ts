import { GAME_CONFIG } from '../../config/GameConfig.ts'
import type { PowerUpKind } from '../collectibles/CollectibleKind.ts'
import { POWER_UP_KINDS } from '../collectibles/CollectibleKind.ts'

export interface ActivePowerUp {
  readonly kind: PowerUpKind
  readonly label: string
  readonly remaining: number
  readonly duration: number
  readonly charges: number
}

const powerUpConfig = GAME_CONFIG.powerUps

/**
 * Timed power-up state.
 *
 * Every modifier is derived from `GAME_CONFIG.powerUps`, so durations and
 * strengths are tuned in one place. The system never moves the player: it
 * exposes multipliers (speed, air jumps), a magnet radius and shield charges
 * that the run loop reads during a fixed step. `update` returns the effects
 * that expired on that step so the HUD can clear them exactly once.
 */
export class PowerUpSystem {
  private readonly timers = new Map<PowerUpKind, number>()
  private shieldCharges = 0

  apply(kind: PowerUpKind): boolean {
    const definition = powerUpConfig[kind]
    if (!definition || definition.duration <= 0) {
      return false
    }

    this.timers.set(kind, definition.duration)
    if (kind === 'shield' && 'charges' in definition) {
      this.shieldCharges = definition.charges
    }
    return true
  }

  /** Advances every timer and returns the power-ups that ran out. */
  update(delta: number): PowerUpKind[] {
    if (delta <= 0 || this.timers.size === 0) {
      return []
    }

    const expired: PowerUpKind[] = []
    for (const [kind, remaining] of [...this.timers.entries()]) {
      const next = remaining - delta
      if (next <= 0) {
        this.timers.delete(kind)
        if (kind === 'shield') {
          this.shieldCharges = 0
        }
        expired.push(kind)
      } else {
        this.timers.set(kind, next)
      }
    }
    return expired
  }

  isActive(kind: PowerUpKind): boolean {
    return (this.timers.get(kind) ?? 0) > 0
  }

  remainingOf(kind: PowerUpKind): number {
    return this.timers.get(kind) ?? 0
  }

  get active(): readonly ActivePowerUp[] {
    const result: ActivePowerUp[] = []
    for (const kind of POWER_UP_KINDS) {
      const remaining = this.timers.get(kind)
      if (remaining === undefined || remaining <= 0) {
        continue
      }
      const definition = powerUpConfig[kind]
      result.push({
        kind,
        label: definition.label,
        remaining,
        duration: definition.duration,
        charges: kind === 'shield' ? this.shieldCharges : 0,
      })
    }
    return result
  }

  get speedMultiplier(): number {
    return this.isActive('speed') ? powerUpConfig.speed.speedMultiplier : 1
  }

  get magnetRadius(): number {
    return this.isActive('magnet') ? powerUpConfig.magnet.radius : 0
  }

  get magnetPullSpeed(): number {
    return powerUpConfig.magnet.pullSpeed
  }

  get airJumps(): number {
    return this.isActive('doubleJump') ? powerUpConfig.doubleJump.airJumps : 0
  }

  get shieldActive(): boolean {
    return this.shieldCharges > 0
  }

  get shieldChargesRemaining(): number {
    return this.shieldCharges
  }

  /**
   * Consumes one collision. Returns true when a shield charge absorbed it and
   * false when the runner takes the hit. The shield ends once its last charge
   * is spent, even if time remains on the timer.
   */
  absorbHit(): boolean {
    if (this.shieldCharges <= 0) {
      return false
    }

    this.shieldCharges -= 1
    if (this.shieldCharges <= 0) {
      this.timers.delete('shield')
      this.shieldCharges = 0
      return true
    }
    return true
  }

  reset(): void {
    this.timers.clear()
    this.shieldCharges = 0
  }
}
