import type { IslandMechanic } from '../../game/levels/LevelDefinition.ts'
import { ICE_LANE_CONTROL } from '../../game/levels/SpawnRules.ts'
import { t, type StringKey } from '../../i18n/i18n.ts'
import type { Rng } from '../../utils/random.ts'
import type { GameServices } from './GameServices.ts'

/** Seconds between gusts, and how long a gust is announced before it hits. */
const GUST_INTERVAL: readonly [number, number] = [7, 11]
const GUST_WARNING = 1.3
/** A gust only pushes into a lane that stays clear this long at run speed. */
const GUST_CLEAR_SECONDS = 1.2

export interface MechanicsHooks {
  /** Current lane, 0 = leftmost. */
  readonly laneIndex: () => number
  readonly laneCount: () => number
  /** True when nothing blocks `lane` for the next `seconds` of running. */
  readonly laneClear: (lane: number, seconds: number) => boolean
  /** Moves the runner one lane, like a swipe. */
  readonly push: (direction: -1 | 1) => void
}

/**
 * The rule an island plays by. Ice lowers lane control, wind pushes the
 * runner (always announced, never into an obstacle), embers live in the
 * spawn rules. The endless run has none.
 */
export class IslandMechanicsController {
  private readonly services: GameServices
  private readonly hooks: MechanicsHooks
  private readonly random: Rng
  private mechanic: IslandMechanic | null = null
  private gustTimer = 0
  private gustDirection: -1 | 1 = 1
  private warned = false

  constructor(services: GameServices, hooks: MechanicsHooks, random: Rng) {
    this.services = services
    this.hooks = hooks
    this.random = random
  }

  get active(): IslandMechanic | null {
    return this.mechanic
  }

  /** Lane-control multiplier for the player step. */
  get laneControl(): number {
    return this.mechanic === 'ice' ? ICE_LANE_CONTROL : 1
  }

  /** Called when a run starts; announces the island's rule. */
  begin(mechanic: IslandMechanic | null | undefined): void {
    this.mechanic = mechanic ?? null
    this.warned = false
    this.scheduleGust()
    if (this.mechanic) {
      this.services.ui.pushFeedback(t(`mechanic.${this.mechanic}.intro` as StringKey), 'powerup')
    }
  }

  end(): void {
    this.mechanic = null
  }

  /** Fixed-step update while playing. */
  update(delta: number): void {
    if (this.mechanic !== 'wind') {
      return
    }
    this.gustTimer -= delta
    if (!this.warned && this.gustTimer <= GUST_WARNING) {
      this.warned = true
      this.gustDirection = this.pickDirection()
      this.services.ui.pushFeedback(
        t(this.gustDirection < 0 ? 'mechanic.wind.left' : 'mechanic.wind.right'),
        'shield',
      )
    }
    if (this.gustTimer > 0) {
      return
    }
    const target = this.hooks.laneIndex() + this.gustDirection
    // Never blow the runner off the track or into an obstacle.
    if (
      target >= 0 &&
      target < this.hooks.laneCount() &&
      this.hooks.laneClear(target, GUST_CLEAR_SECONDS)
    ) {
      this.hooks.push(this.gustDirection)
      this.services.haptics.pulse('ui')
    }
    this.scheduleGust()
  }

  private scheduleGust(): void {
    this.gustTimer = this.random.range(GUST_INTERVAL[0], GUST_INTERVAL[1])
    this.warned = false
  }

  private pickDirection(): -1 | 1 {
    const lane = this.hooks.laneIndex()
    if (lane <= 0) {
      return 1
    }
    if (lane >= this.hooks.laneCount() - 1) {
      return -1
    }
    return this.random.chance(0.5) ? -1 : 1
  }
}
