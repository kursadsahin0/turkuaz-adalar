import type { SaveManager } from '../save/SaveManager.ts'

export interface RunResult {
  score: number
  distance: number
  crystals: number
}

export interface ProgressionSnapshot {
  bestScore: number
  bestDistance: number
  totalRuns: number
  totalCrystals: number
  /** Persistent wallet balance, shared by every run. */
  coins: number
}

export interface ProgressionUpdate {
  snapshot: ProgressionSnapshot
  isBestScore: boolean
  isBestDistance: boolean
}

const SAVE_KEY = 'progress'
const DEFAULT_PROGRESSION: ProgressionSnapshot = {
  bestScore: 0,
  bestDistance: 0,
  totalRuns: 0,
  totalCrystals: 0,
  coins: 0,
}

function sanitiseNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0
}

function sanitiseSnapshot(value: unknown): ProgressionSnapshot {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_PROGRESSION }
  }

  const record = value as Record<string, unknown>
  return {
    bestScore: sanitiseNumber(record.bestScore),
    bestDistance: sanitiseNumber(record.bestDistance),
    totalRuns: sanitiseNumber(record.totalRuns),
    totalCrystals: sanitiseNumber(record.totalCrystals),
    coins: sanitiseNumber(record.coins),
  }
}

/** Persistent records for the local player profile. */
export class ProgressionManager {
  private readonly save: SaveManager
  private data: ProgressionSnapshot

  constructor(save: SaveManager) {
    this.save = save
    this.data = sanitiseSnapshot(save.load<unknown>(SAVE_KEY, DEFAULT_PROGRESSION))
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
    if (credited <= 0) {
      return this.data.coins
    }

    this.data = { ...this.data, coins: this.data.coins + credited }
    this.save.save(SAVE_KEY, this.data)
    return this.data.coins
  }

  debitCoins(amount: number): number {
    const debited = sanitiseNumber(amount)
    if (debited <= 0) {
      return this.data.coins
    }

    const newBalance = Math.max(0, this.data.coins - debited)
    this.data = { ...this.data, coins: newBalance }
    this.save.save(SAVE_KEY, this.data)
    return this.data.coins
  }

  recordRun(result: RunResult): ProgressionUpdate {
    const isBestScore = result.score > this.data.bestScore
    const isBestDistance = result.distance > this.data.bestDistance

    this.data = {
      coins: this.data.coins,
      bestScore: Math.max(this.data.bestScore, Math.floor(result.score)),
      bestDistance: Math.max(this.data.bestDistance, Math.floor(result.distance)),
      totalRuns: this.data.totalRuns + 1,
      totalCrystals: this.data.totalCrystals + Math.max(0, Math.floor(result.crystals)),
    }

    this.save.save(SAVE_KEY, this.data)
    return { snapshot: this.snapshot, isBestScore, isBestDistance }
  }
}
