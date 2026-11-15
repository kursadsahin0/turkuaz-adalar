import type { SaveManager } from '../save/SaveManager.ts'

/** Lifetime numbers the achievements are judged on. */
export interface AchievementStats {
  readonly totalRuns: number
  readonly bestDistance: number
  readonly bestScore: number
  readonly totalCoinsEarned: number
  readonly totalCrystals: number
  readonly cosmeticsBought: number
  readonly bestStreak: number
  readonly perfectMissionDays: number
  /** Islands finished at least once. */
  readonly islandsCompleted: number
  /** Best stars summed over every island. */
  readonly totalStars: number
  /** Runners owned, the free one included. */
  readonly charactersOwned: number
}

export type AchievementId =
  | 'firstRun'
  | 'km1'
  | 'km3'
  | 'score10k'
  | 'coins5k'
  | 'crystals50'
  | 'runs100'
  | 'firstCosmetic'
  | 'streak7'
  | 'missions'
  | 'islands10'
  | 'islands20'
  | 'islands30'
  | 'stars45'
  | 'stars90'
  | 'characters3'
  | 'characters7'

export interface AchievementDefinition {
  readonly id: AchievementId
  /** Crystals granted when the reward is claimed. */
  readonly reward: number
  readonly progress: (stats: AchievementStats) => number
  readonly target: number
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: 'firstRun', reward: 2, target: 1, progress: (s) => s.totalRuns },
  { id: 'km1', reward: 5, target: 1000, progress: (s) => s.bestDistance },
  { id: 'km3', reward: 15, target: 3000, progress: (s) => s.bestDistance },
  { id: 'score10k', reward: 10, target: 10000, progress: (s) => s.bestScore },
  { id: 'coins5k', reward: 10, target: 5000, progress: (s) => s.totalCoinsEarned },
  { id: 'crystals50', reward: 10, target: 50, progress: (s) => s.totalCrystals },
  { id: 'runs100', reward: 20, target: 100, progress: (s) => s.totalRuns },
  { id: 'firstCosmetic', reward: 3, target: 1, progress: (s) => s.cosmeticsBought },
  { id: 'streak7', reward: 15, target: 7, progress: (s) => s.bestStreak },
  { id: 'missions', reward: 5, target: 1, progress: (s) => s.perfectMissionDays },
  // Islands and runners (30 islands, 90 stars, 7 runners; checked by the tests).
  { id: 'islands10', reward: 15, target: 10, progress: (s) => s.islandsCompleted },
  { id: 'islands20', reward: 25, target: 20, progress: (s) => s.islandsCompleted },
  { id: 'islands30', reward: 50, target: 30, progress: (s) => s.islandsCompleted },
  { id: 'stars45', reward: 20, target: 45, progress: (s) => s.totalStars },
  { id: 'stars90', reward: 60, target: 90, progress: (s) => s.totalStars },
  { id: 'characters3', reward: 10, target: 3, progress: (s) => s.charactersOwned },
  { id: 'characters7', reward: 40, target: 7, progress: (s) => s.charactersOwned },
]

interface AchievementState {
  unlocked: AchievementId[]
  claimed: AchievementId[]
  cosmeticsBought: number
}

const SAVE_KEY = 'achievements'

/**
 * Lifetime achievements. They unlock automatically from stats and pay out
 * crystals when claimed, which feeds the crystal economy.
 */
export class Achievements {
  private readonly save: SaveManager
  private state: AchievementState

  constructor(save: SaveManager) {
    this.save = save
    const raw = save.load<Partial<AchievementState> | null>(SAVE_KEY, null)
    const ids = new Set<string>(ACHIEVEMENTS.map((entry) => entry.id))
    const clean = (list: unknown): AchievementId[] =>
      Array.isArray(list) ? (list.filter((id) => ids.has(id)) as AchievementId[]) : []
    this.state = {
      unlocked: clean(raw?.unlocked),
      claimed: clean(raw?.claimed),
      cosmeticsBought: Math.max(0, Math.floor(Number(raw?.cosmeticsBought) || 0)),
    }
  }

  get cosmeticsBought(): number {
    return this.state.cosmeticsBought
  }

  recordCosmeticPurchase(): void {
    this.state.cosmeticsBought += 1
    this.persist()
  }

  isUnlocked(id: AchievementId): boolean {
    return this.state.unlocked.includes(id)
  }

  isClaimed(id: AchievementId): boolean {
    return this.state.claimed.includes(id)
  }

  get claimable(): number {
    return this.state.unlocked.filter((id) => !this.state.claimed.includes(id)).length
  }

  /** Unlocks everything the stats now satisfy and returns the new ones. */
  evaluate(stats: AchievementStats): AchievementDefinition[] {
    const fresh: AchievementDefinition[] = []
    for (const achievement of ACHIEVEMENTS) {
      if (!this.isUnlocked(achievement.id) && achievement.progress(stats) >= achievement.target) {
        this.state.unlocked.push(achievement.id)
        fresh.push(achievement)
      }
    }
    if (fresh.length > 0) {
      this.persist()
    }
    return fresh
  }

  /** Returns the crystal reward, or 0 when not claimable. */
  claim(id: AchievementId): number {
    const achievement = ACHIEVEMENTS.find((entry) => entry.id === id)
    if (!achievement || !this.isUnlocked(id) || this.isClaimed(id)) {
      return 0
    }
    this.state.claimed.push(id)
    this.persist()
    return achievement.reward
  }

  private persist(): void {
    this.save.save(SAVE_KEY, this.state)
  }
}
