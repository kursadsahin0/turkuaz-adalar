import type { LevelDefinition } from './LevelDefinition.ts'

export interface LevelProgress {
  /** Number of times the level has been attempted. */
  attempts: number
  /** Whether the level has been completed. */
  completed: boolean
  /** Best distance achieved in this level. */
  bestDistance: number
  /** Best score achieved in this level. */
  bestScore: number
  /** Total coins collected across all runs. */
  totalCoins: number
  /** Total crystals collected across all runs. */
  totalCrystals: number
  /** Timestamp when the level was unlocked (0 if never unlocked). */
  unlockedAt: number
}

export interface LevelProgressState {
  readonly unlockedLevels: string[]
  progress: Record<string, LevelProgress>
}

export class LevelProgressionManager {
  private static readonly SAVE_KEY = 'level_progression'
  
  private state: LevelProgressState = {
    unlockedLevels: ['turkuaz-shallows'], // First level always unlocked
    progress: {},
  }

  constructor() {
    this.load()
  }

  /**
   * Check if a level is unlocked.
   */
  isUnlocked(levelId: string): boolean {
    return this.state.unlockedLevels.includes(levelId)
  }

  /**
   * Get the progress for a specific level.
   */
  getProgress(levelId: string): LevelProgress {
    return this.state.progress[levelId] ?? {
      attempts: 0,
      completed: false,
      bestDistance: 0,
      bestScore: 0,
      totalCoins: 0,
      totalCrystals: 0,
      unlockedAt: 0,
    }
  }

  /**
   * Unlock a level (requires sufficient coins).
   */
  unlockLevel(levelId: string, cost: number, currentCoins: number): boolean {
    if (this.isUnlocked(levelId)) {
      return true
    }
    if (currentCoins < cost) {
      return false
    }
    this.state.unlockedLevels.push(levelId)
    this.state.progress[levelId] = {
      attempts: 0,
      completed: false,
      bestDistance: 0,
      bestScore: 0,
      totalCoins: 0,
      totalCrystals: 0,
      unlockedAt: Date.now(),
    }
    this.save()
    return true
  }

  /**
   * Record a run result for a level.
   */
  recordRun(
    levelId: string,
    distance: number,
    score: number,
    coins: number,
    crystals: number,
    completed: boolean,
  ): void {
    const existing = this.getProgress(levelId)
    const updated = {
      attempts: existing.attempts + 1,
      bestDistance: Math.max(existing.bestDistance, distance),
      bestScore: Math.max(existing.bestScore, score),
      totalCoins: existing.totalCoins + coins,
      totalCrystals: existing.totalCrystals + crystals,
      completed: completed || existing.completed,
      unlockedAt: existing.unlockedAt,
    }
    this.state = {
      ...this.state,
      progress: { ...this.state.progress, [levelId]: updated },
    }
    this.save()
  }

  /**
   * Check if a level can be unlocked with the current coin balance.
   */
  canUnlock(level: LevelDefinition, currentCoins: number): boolean {
    if (this.isUnlocked(level.id)) {
      return true
    }
    return currentCoins >= level.unlockCost
  }

  /**
   * Get the next level after the given one.
   */
  getNextLevel(currentLevelId: string, allLevels: readonly LevelDefinition[]): LevelDefinition | null {
    const currentIndex = allLevels.findIndex(l => l.id === currentLevelId)
    if (currentIndex === -1 || currentIndex >= allLevels.length - 1) {
      return null
    }
    return allLevels[currentIndex + 1]
  }

  /**
   * Get the first unlocked level.
   */
  getFirstUnlockedLevel(allLevels: readonly LevelDefinition[]): LevelDefinition {
    for (const level of allLevels) {
      if (this.isUnlocked(level.id)) {
        return level
      }
    }
    return allLevels[0]
  }

  /**
   * Calculate completion percentage across all levels.
   */
  getCompletionPercentage(allLevels: readonly LevelDefinition[]): number {
    let completed = 0
    for (const level of allLevels) {
      const progress = this.getProgress(level.id)
      if (progress.completed) {
        completed += 1
      }
    }
    return (completed / allLevels.length) * 100
  }

  private load(): void {
    try {
      const saved = localStorage.getItem(LevelProgressionManager.SAVE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        this.state = {
          unlockedLevels: parsed.unlockedLevels ?? ['turkuaz-shallows'],
          progress: parsed.progress ?? {},
        }
      }
    } catch (error) {
      console.error('Failed to load level progression:', error)
    }
  }

  private save(): void {
    try {
      localStorage.setItem(
        LevelProgressionManager.SAVE_KEY,
        JSON.stringify(this.state),
      )
    } catch (error) {
      console.error('Failed to save level progression:', error)
    }
  }

  reset(): void {
    this.state = {
      unlockedLevels: ['turkuaz-shallows'],
      progress: {},
    }
    this.save()
  }
}
