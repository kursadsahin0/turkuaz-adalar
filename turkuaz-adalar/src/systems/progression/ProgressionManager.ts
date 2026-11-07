import type { PlayerSaveManager } from '../save/PlayerSaveManager.ts'
import { sanitiseProgression, type PlayerProgression } from '../save/PlayerSaveState.ts'
import type { SaveManager } from '../save/SaveManager.ts'

export interface RunResult {
  score: number
  distance: number
  crystals: number
}

/** Records and wallet. Stored as `progression` in the unified player save. */
export type ProgressionSnapshot = PlayerProgression

export interface ProgressionUpdate {
  snapshot: ProgressionSnapshot
  isBestScore: boolean
  isBestDistance: boolean
}

export type Currency = 'coins' | 'crystals'

/** Where the wallet lived before it moved into the player save. */
const LEGACY_SAVE_KEY = 'progress'

function sanitiseNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/**
 * Persistent records and the coin/crystal wallet for the local player.
 *
 * This is the single source of truth for those numbers; it reads and writes
 * the `progression` section of the player save. Saves written before that
 * existed (a separate `progress` key) are merged in once and then removed.
 */
export class ProgressionManager {
  private readonly playerSave: PlayerSaveManager
  private data: ProgressionSnapshot

  constructor(playerSave: PlayerSaveManager, legacy?: SaveManager) {
    this.playerSave = playerSave
    this.data = sanitiseProgression(playerSave.progression)
    if (legacy) {
      this.migrateLegacy(legacy)
    }
  }

  get snapshot(): ProgressionSnapshot {
    return { ...this.data }
  }

  /**
   * Adds coins to the persistent wallet immediately. Called once per collected
   * pickup, so a run that ends unexpectedly still keeps what it earned.
   */
  creditCoins(amount: number): number {
    const credited = sanitiseNumber(amount)
    if (credited > 0) {
      this.commit({
        ...this.data,
        coins: this.data.coins + credited,
        totalCoinsEarned: this.data.totalCoinsEarned + credited,
      })
    }
    return this.data.coins
  }

  /** Adds spendable crystals immediately (the lifetime count updates in recordRun). */
  creditCrystals(amount: number): number {
    const credited = sanitiseNumber(amount)
    if (credited > 0) {
      this.commit({ ...this.data, crystalBalance: this.data.crystalBalance + credited })
    }
    return this.data.crystalBalance
  }

  balance(currency: Currency): number {
    return currency === 'coins' ? this.data.coins : this.data.crystalBalance
  }

  /** Spends only when the full amount is available. Returns whether it did. */
  trySpend(currency: Currency, amount: number): boolean {
    const cost = sanitiseNumber(amount)
    if (cost <= 0) {
      return true
    }
    if (this.balance(currency) < cost) {
      return false
    }
    this.commit(
      currency === 'coins'
        ? { ...this.data, coins: this.data.coins - cost }
        : { ...this.data, crystalBalance: this.data.crystalBalance - cost },
    )
    return true
  }

  /** Clamps at zero. Prefer `trySpend`, which refuses an unaffordable cost. */
  debitCoins(amount: number): number {
    const debited = sanitiseNumber(amount)
    if (debited > 0) {
      this.commit({ ...this.data, coins: Math.max(0, this.data.coins - debited) })
    }
    return this.data.coins
  }

  recordRun(result: RunResult): ProgressionUpdate {
    const isBestScore = result.score > this.data.bestScore
    const isBestDistance = result.distance > this.data.bestDistance

    this.commit({
      ...this.data,
      bestScore: Math.max(this.data.bestScore, Math.floor(result.score)),
      bestDistance: Math.max(this.data.bestDistance, Math.floor(result.distance)),
      totalRuns: this.data.totalRuns + 1,
      totalCrystals: this.data.totalCrystals + Math.max(0, Math.floor(result.crystals)),
    })
    // A finished run is a natural checkpoint: write it now, not on the debounce.
    this.playerSave.saveNow()
    return { snapshot: this.snapshot, isBestScore, isBestDistance }
  }

  private commit(next: ProgressionSnapshot): void {
    this.data = next
    this.playerSave.updateProgression(next)
  }

  /** Field-wise max, so nothing earned under either key is ever lost. */
  private migrateLegacy(legacy: SaveManager): void {
    const raw = legacy.load<unknown>(LEGACY_SAVE_KEY, null)
    if (raw === null) {
      return
    }
    const old = sanitiseProgression(raw)
    const merged: ProgressionSnapshot = { ...this.data }
    for (const key of Object.keys(merged) as (keyof ProgressionSnapshot)[]) {
      merged[key] = Math.max(merged[key], old[key])
    }
    this.commit(merged)
    if (this.playerSave.saveNow()) {
      legacy.remove(LEGACY_SAVE_KEY)
    }
  }
}
