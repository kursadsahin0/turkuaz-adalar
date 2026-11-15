import type { PlayerSaveManager } from '../../systems/save/PlayerSaveManager.ts'
import type { LevelProgress } from '../../systems/save/PlayerSaveState.ts'
import type { LevelDefinition } from './LevelDefinition.ts'

export type { LevelProgress }

/** Result of finishing (or failing) a level run. */
export interface LevelRunResult {
  readonly distance: number
  readonly score: number
  readonly coins: number
  readonly crystals: number
  readonly completed: boolean
}

export interface LevelRunOutcome {
  /** Stars earned by this run (0 when not completed). */
  readonly stars: number
  readonly isPersonalBest: boolean
  /** The level this completion unlocked, if any. */
  readonly unlockedNext: LevelDefinition | null
}

const EMPTY_PROGRESS: LevelProgress = {
  attempts: 0,
  completed: false,
  bestDistance: 0,
  bestScore: 0,
  totalCoins: 0,
  totalCrystals: 0,
  unlockedAt: 0,
  bestStars: 0,
}

/**
 * ★ for finishing, ★ for the level's coin target, ★ for its crystal target.
 */
export function starsFor(level: LevelDefinition, result: LevelRunResult): number {
  if (!result.completed) {
    return 0
  }
  return (
    1 +
    (result.coins >= level.completionCoins ? 1 : 0) +
    (result.crystals >= level.completionCrystals ? 1 : 0)
  )
}

/**
 * Level unlocks and per-level records, stored in the unified player save.
 *
 * Finishing a level unlocks the next one for free. Any locked level can also
 * be opened early by paying its `unlockCost` in coins.
 */
export class LevelProgressionManager {
  private readonly save: PlayerSaveManager
  private readonly levels: readonly LevelDefinition[]

  constructor(save: PlayerSaveManager, levels: readonly LevelDefinition[]) {
    this.save = save
    this.levels = levels
  }

  get unlockedLevels(): readonly string[] {
    return this.save.unlockedLevels
  }

  get allProgress(): Readonly<Record<string, LevelProgress>> {
    return this.save.levelProgress
  }

  isUnlocked(levelId: string): boolean {
    return levelId === this.levels[0]?.id || this.save.unlockedLevels.includes(levelId)
  }

  getProgress(levelId: string): LevelProgress {
    return this.save.levelProgress[levelId] ?? { ...EMPTY_PROGRESS }
  }

  /** Marks a level playable. The caller handles any coin payment first. */
  unlock(levelId: string): boolean {
    if (!this.levels.some((level) => level.id === levelId)) {
      return false
    }
    if (this.isUnlocked(levelId)) {
      return true
    }
    this.save.updateUnlockedLevels([...this.save.unlockedLevels, levelId])
    this.save.updateLevelProgress(levelId, { ...this.getProgress(levelId), unlockedAt: Date.now() })
    return true
  }

  recordRun(level: LevelDefinition, result: LevelRunResult): LevelRunOutcome {
    const existing = this.getProgress(level.id)
    const stars = starsFor(level, result)
    const isPersonalBest = result.score > existing.bestScore
    this.save.updateLevelProgress(level.id, {
      attempts: existing.attempts + 1,
      completed: existing.completed || result.completed,
      bestDistance: Math.max(existing.bestDistance, Math.floor(result.distance)),
      bestScore: Math.max(existing.bestScore, Math.floor(result.score)),
      totalCoins: existing.totalCoins + result.coins,
      totalCrystals: existing.totalCrystals + result.crystals,
      unlockedAt: existing.unlockedAt,
      bestStars: Math.max(existing.bestStars, stars),
    })

    let unlockedNext: LevelDefinition | null = null
    const next = this.getNextLevel(level.id)
    if (result.completed && next && !this.isUnlocked(next.id)) {
      this.unlock(next.id)
      unlockedNext = next
    }
    return { stars, isPersonalBest, unlockedNext }
  }

  getNextLevel(levelId: string): LevelDefinition | null {
    const index = this.levels.findIndex((level) => level.id === levelId)
    return index >= 0 && index < this.levels.length - 1 ? this.levels[index + 1] : null
  }

  /** Islands finished at least once. */
  completedCount(): number {
    return this.levels.filter((level) => this.getProgress(level.id).completed).length
  }

  totalStars(): number {
    return this.levels.reduce((sum, level) => sum + this.getProgress(level.id).bestStars, 0)
  }
}
