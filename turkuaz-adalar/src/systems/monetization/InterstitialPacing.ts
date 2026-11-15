import type { SaveManager } from '../save/SaveManager.ts'

/**
 * How often the full-screen ad may appear between islands. Kept gentle on
 * purpose: new players finish a few islands ad-free, and a player who just
 * chose to watch a rewarded ad is not shown another one right away.
 */
export const INTERSTITIAL_RULES = {
  /** No full-screen ad before this many islands have been completed. */
  firstAfterCompletions: 3,
  /** Afterwards, at most one every this many completed islands. */
  everyCompletions: 3,
  /** Minimum gap between two full-screen ads. */
  minSecondsBetween: 180,
  /** Quiet period after a rewarded ad (continue, double coins). */
  quietAfterRewardedSeconds: 90,
} as const

interface PacingState {
  completions: number
  sinceLast: number
  lastShownAt: number
}

const SAVE_KEY = 'interstitial_pacing'

/** Decides when a completed island earns a full-screen ad on the way out. */
export class InterstitialPacing {
  private readonly save: SaveManager
  private state: PacingState

  constructor(save: SaveManager) {
    this.save = save
    const raw = save.load<Partial<PacingState> | null>(SAVE_KEY, null)
    this.state = {
      completions: Math.max(0, Math.floor(Number(raw?.completions) || 0)),
      sinceLast: Math.max(0, Math.floor(Number(raw?.sinceLast) || 0)),
      lastShownAt: Math.max(0, Number(raw?.lastShownAt) || 0),
    }
  }

  /** Call once per completed island. */
  recordCompletion(): void {
    this.state.completions += 1
    this.state.sinceLast += 1
    this.persist()
  }

  /**
   * Whether leaving this island's summary should show the ad. `lastRewardedAt`
   * is when the player last watched a rewarded ad (ms epoch, 0 = never).
   */
  shouldShow(now: number, lastRewardedAt = 0): boolean {
    const rules = INTERSTITIAL_RULES
    if (this.state.completions < rules.firstAfterCompletions) {
      return false
    }
    // The first eligible island counts as a full cycle.
    const cycle =
      this.state.lastShownAt === 0 ? rules.firstAfterCompletions : rules.everyCompletions
    if (this.state.sinceLast < cycle) {
      return false
    }
    if (
      this.state.lastShownAt > 0 &&
      now - this.state.lastShownAt < rules.minSecondsBetween * 1000
    ) {
      return false
    }
    if (lastRewardedAt > 0 && now - lastRewardedAt < rules.quietAfterRewardedSeconds * 1000) {
      return false
    }
    return true
  }

  /** Call after the ad was actually shown; restarts the cycle. */
  recordShown(now: number): void {
    this.state.sinceLast = 0
    this.state.lastShownAt = now
    this.persist()
  }

  private persist(): void {
    this.save.save(SAVE_KEY, this.state)
  }
}
