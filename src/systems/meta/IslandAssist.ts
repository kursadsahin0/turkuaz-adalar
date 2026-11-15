import type { SaveManager } from '../save/SaveManager.ts'

const SAVE_KEY = 'island_assist'
/** Failed tries in a row on one island before the first / second assist step. */
export const ASSIST_STEPS = [3, 6] as const

/**
 * Silent struggle assist: after several failed tries in a row on the same
 * island the next try is a little slower with fewer obstacles (LevelManager
 * applies the factors). Finishing the island resets it. Every run reports its
 * assist level to analytics so the thresholds can be tuned from real data.
 */
export class IslandAssist {
  private readonly save: SaveManager
  private fails: Record<string, number>

  constructor(save: SaveManager) {
    this.save = save
    const raw = save.load<Record<string, unknown> | null>(SAVE_KEY, null)
    this.fails = {}
    for (const [id, value] of Object.entries(raw ?? {})) {
      const count = Math.floor(Number(value))
      if (count > 0) {
        this.fails[id] = count
      }
    }
  }

  /** 0 (none), 1 or 2 for the next try on this island. */
  levelFor(islandId: string): number {
    const fails = this.fails[islandId] ?? 0
    return ASSIST_STEPS.filter((step) => fails >= step).length
  }

  failsOn(islandId: string): number {
    return this.fails[islandId] ?? 0
  }

  recordResult(islandId: string, completed: boolean): void {
    if (completed) {
      delete this.fails[islandId]
    } else {
      this.fails[islandId] = (this.fails[islandId] ?? 0) + 1
    }
    this.save.save(SAVE_KEY, this.fails)
  }
}
