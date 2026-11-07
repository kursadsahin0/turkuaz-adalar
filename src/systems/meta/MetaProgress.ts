import { t, type StringKey } from '../../i18n/i18n.ts'
import type { ProgressionManager } from '../progression/ProgressionManager.ts'
import type { SaveManager } from '../save/SaveManager.ts'
import { ACHIEVEMENTS, Achievements, type AchievementId } from './Achievements.ts'
import { DAILY_REWARDS, DailyRewards, type Reward } from './DailyRewards.ts'
import { hoursUntilMidnight, systemClock, type Clock } from './dayKey.ts'
import { LocalLeaderboard, type LeaderboardService } from './Leaderboard.ts'
import { Missions, type MissionEvent } from './Missions.ts'
import { SeasonRoad, seasonXpFor } from './SeasonRoad.ts'
import type { CosmeticType } from '../../game/characters/CharacterData.ts'
import type { AchievementView, ProgressData } from '../../ui/screens/ProgressScreen.ts'

/** Collection numbers owned by other systems (islands, wardrobe). */
export interface WorldStats {
  readonly islandsCompleted: number
  readonly totalStars: number
  readonly charactersOwned: number
}

const NO_WORLD_STATS: WorldStats = { islandsCompleted: 0, totalStars: 0, charactersOwned: 1 }

/** Gives a cosmetic for free; false when it was already owned. */
export type CosmeticGrant = (type: CosmeticType, id: string) => boolean

/** What claiming a season tier paid out. */
export interface SeasonPayout {
  readonly coins: number
  readonly crystals: number
  readonly cosmetic: string | null
}

/** Text to flash in the HUD when something completes mid-run. */
export interface MetaNotice {
  readonly text: string
}

/**
 * Coordinates the retention systems around the core run: daily login
 * rewards, daily missions, achievements and the local leaderboard. Rewards
 * are paid into the shared wallet (ProgressionManager).
 */
export class MetaProgress {
  readonly daily: DailyRewards
  readonly missions: Missions
  readonly achievements: Achievements
  readonly leaderboard: LeaderboardService
  readonly season: SeasonRoad
  private readonly grantCosmetic: CosmeticGrant
  private readonly progression: ProgressionManager
  private readonly clock: Clock
  private readonly worldStats: () => WorldStats

  constructor(
    save: SaveManager,
    progression: ProgressionManager,
    clock: Clock = systemClock,
    worldStats: () => WorldStats = () => NO_WORLD_STATS,
    grantCosmetic: CosmeticGrant = () => false,
  ) {
    this.grantCosmetic = grantCosmetic
    this.season = new SeasonRoad(save, clock)
    this.progression = progression
    this.clock = clock
    this.worldStats = worldStats
    this.daily = new DailyRewards(save, clock)
    this.missions = new Missions(save, clock)
    this.achievements = new Achievements(save)
    this.leaderboard = new LocalLeaderboard(save)
    // Saves that predate achievements unlock what they already earned.
    this.achievements.evaluate(this.stats())
  }

  get badges(): { dailyReady: boolean; claimable: number } {
    return {
      dailyReady: this.daily.status().canClaim,
      claimable: this.missions.claimable + this.achievements.claimable + this.season.claimable,
    }
  }

  /** Feeds a gameplay counter; returns HUD notices for missions it completed. */
  record(event: MissionEvent): MetaNotice[] {
    return this.missions.record(event).map((mission) => ({
      text: t('feedback.mission', {
        name: t(`mission.${mission.kind}` as StringKey, { target: mission.target }),
      }),
    }))
  }

  /** Called once per finished run, after the progression record is written. */
  finishRun(score: number, distance: number): MetaNotice[] {
    this.leaderboard.submit({
      score: Math.floor(score),
      distance: Math.floor(distance),
      at: this.clock().getTime(),
    })
    const notices = this.record({ kind: 'runEnd', distance, score })
    return [...notices, ...this.evaluateAchievements()]
  }

  /** Season road XP for a finished run; returns notices for tiers reached. */
  recordSeason(run: { distance: number; completed: boolean; stars: number }): MetaNotice[] {
    return this.season
      .addXp(seasonXpFor(run))
      .map((tier) => ({ text: t('feedback.seasonTier', { tier }) }))
  }

  claimSeason(tier: number): SeasonPayout | null {
    const reward = this.season.claim(tier)
    if (!reward) {
      return null
    }
    let crystals = reward.crystals
    let cosmetic: string | null = null
    if (reward.cosmetic) {
      if (this.grantCosmetic(reward.cosmetic.type, reward.cosmetic.id)) {
        cosmetic = reward.cosmetic.id
      } else {
        crystals += reward.cosmetic.fallback
      }
    }
    this.pay(reward.coins, crystals)
    return { coins: reward.coins, crystals, cosmetic }
  }

  /** Re-checks achievements after island or wardrobe progress changes. */
  refreshAchievements(): MetaNotice[] {
    return this.evaluateAchievements()
  }

  /** Lets the meta layer know a cosmetic was bought (for "Fresh Look"). */
  cosmeticBought(): MetaNotice[] {
    this.achievements.recordCosmeticPurchase()
    return this.evaluateAchievements()
  }

  claimDaily(): Reward | null {
    const reward = this.daily.claim()
    if (reward) {
      this.pay(reward.coins, reward.crystals)
      this.evaluateAchievements()
    }
    return reward
  }

  claimMission(id: string): number {
    const coins = this.missions.claim(id)
    if (coins > 0) {
      this.pay(coins, 0)
      this.evaluateAchievements()
    }
    return coins
  }

  claimAchievement(id: AchievementId): number {
    const crystals = this.achievements.claim(id)
    if (crystals > 0) {
      this.pay(0, crystals)
    }
    return crystals
  }

  dailyView(): { status: ReturnType<DailyRewards['status']>; rewards: readonly Reward[] } {
    return { status: this.daily.status(), rewards: DAILY_REWARDS }
  }

  progressView(): ProgressData {
    const stats = this.stats()
    const achievements: AchievementView[] = ACHIEVEMENTS.map((definition) => ({
      definition,
      progress: definition.progress(stats),
      unlocked: this.achievements.isUnlocked(definition.id),
      claimed: this.achievements.isClaimed(definition.id),
    }))
    return {
      missions: this.missions.list(),
      hoursLeft: hoursUntilMidnight(this.clock()),
      achievements,
      records: this.leaderboard.top(),
      season: this.season.view(),
    }
  }

  /** Writes counters that are batched during a run. */
  flush(): void {
    this.missions.persist()
  }

  private evaluateAchievements(): MetaNotice[] {
    return this.achievements.evaluate(this.stats()).map((achievement) => ({
      text: t('feedback.achievement', { name: t(`ach.${achievement.id}.name` as StringKey) }),
    }))
  }

  private pay(coins: number, crystals: number): void {
    if (coins > 0) {
      this.progression.creditCoins(coins)
    }
    if (crystals > 0) {
      this.progression.creditCrystals(crystals)
    }
  }

  private stats() {
    const snapshot = this.progression.snapshot
    return {
      totalRuns: snapshot.totalRuns,
      bestDistance: snapshot.bestDistance,
      bestScore: snapshot.bestScore,
      totalCoinsEarned: snapshot.totalCoinsEarned,
      totalCrystals: snapshot.totalCrystals,
      cosmeticsBought: this.achievements.cosmeticsBought,
      bestStreak: this.daily.bestStreak,
      perfectMissionDays: this.missions.perfectDays,
      ...this.worldStats(),
    }
  }
}
