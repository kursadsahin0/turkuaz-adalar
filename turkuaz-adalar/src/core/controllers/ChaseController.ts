import { t } from '../../i18n/i18n.ts'
import type { GameServices } from './GameServices.ts'

/** Metres between the wave and the runner when the island starts. */
export const CHASE_START_GAP = 35
/** The wave never falls further behind than this, so it stays a threat. */
export const CHASE_MAX_GAP = 60
/** After a continue, the wave is pushed back to this gap. */
const CHASE_REVIVE_GAP = 30
/** Wave speed relative to the island's base run speed, start → finish. */
export const CHASE_SPEED_RATIO: readonly [number, number] = [0.96, 1.06]
/** Below this gap the HUD turns red and the phone buzzes. */
const DANGER_GAP = 12

/**
 * Chase islands: a tidal wave follows the runner. It starts slower than the
 * run and ends a little faster, so the runner has to dash and hit speed
 * pads to stay ahead; sliding gives ground. If it catches up, the run
 * crashes (a continue pushes it back).
 */
export class ChaseController {
  private readonly services: GameServices
  private activeRun = false
  private currentGap = CHASE_START_GAP
  private warned = false

  constructor(services: GameServices) {
    this.services = services
  }

  get active(): boolean {
    return this.activeRun
  }

  /** Metres between wave and runner, or null when there is no chase. */
  get gap(): number | null {
    return this.activeRun ? this.currentGap : null
  }

  begin(chase: boolean | undefined): void {
    this.activeRun = chase === true
    this.currentGap = CHASE_START_GAP
    this.warned = false
    if (this.activeRun) {
      this.services.ui.pushFeedback(t('chase.intro'), 'shield')
    }
  }

  end(): void {
    this.activeRun = false
  }

  /** Called when a continue revives the runner. */
  recover(): void {
    this.currentGap = Math.max(this.currentGap, CHASE_REVIVE_GAP)
    this.warned = false
  }

  /**
   * Fixed-step update. `runnerSpeed` includes dash, pads and power-ups;
   * `baseSpeed` is the island's own pace; `progress` runs 0 → 1 to the
   * finish line. Returns true when the wave catches the runner.
   */
  update(delta: number, runnerSpeed: number, baseSpeed: number, progress: number): boolean {
    if (!this.activeRun) {
      return false
    }
    const [from, to] = CHASE_SPEED_RATIO
    const ratio = from + (to - from) * Math.min(1, Math.max(0, progress))
    this.currentGap = Math.min(
      CHASE_MAX_GAP,
      this.currentGap + (runnerSpeed - baseSpeed * ratio) * delta,
    )
    if (this.currentGap < DANGER_GAP && !this.warned) {
      this.warned = true
      this.services.ui.pushFeedback(t('chase.close'), 'shield')
      this.services.haptics.pulse('crash')
    } else if (this.currentGap > DANGER_GAP + 6) {
      this.warned = false
    }
    return this.currentGap <= 0
  }
}
