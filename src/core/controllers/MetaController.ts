import { LEVEL_CATALOG } from '../../game/levels/LevelCatalog.ts'
import { EVENT_LEVEL_ID, EVENT_REWARD, weeklyEvent } from '../../game/levels/WeeklyEvent.ts'
import { WeeklyEventTracker } from '../../systems/meta/WeeklyEventTracker.ts'
import type { EventCardData } from '../../ui/screens/LevelSelectionScreen.ts'
import type { LevelDefinition } from '../../game/levels/LevelDefinition.ts'
import type { AchievementId } from '../../systems/meta/Achievements.ts'
import type { MetaNotice } from '../../systems/meta/MetaProgress.ts'
import { celebrate, type GameServices } from './GameServices.ts'

const ENDLESS_BEST_KEY = 'endless_best'

/**
 * Everything between runs: island selection and early unlocks, the endless
 * best, daily rewards, missions and achievements, plus the run's notices
 * (completed missions etc.) shown as toasts and on the summary.
 */
export class MetaController {
  private notices: string[] = []
  private readonly eventTracker: WeeklyEventTracker

  private readonly services: GameServices
  /** Toasts only appear while a run is being played. */
  private readonly isPlaying: () => boolean

  constructor(services: GameServices, isPlaying: () => boolean) {
    this.services = services
    this.isPlaying = isPlaying
    this.eventTracker = new WeeklyEventTracker(services.save)
  }

  private eventView(): EventCardData {
    const event = weeklyEvent(new Date(), LEVEL_CATALOG)
    return {
      level: event.level,
      daysLeft: event.daysLeft,
      claimed: this.eventTracker.isClaimed(event.week),
      reward: EVENT_REWARD,
    }
  }

  findLevel(id: string | null): LevelDefinition | null {
    if (id === EVENT_LEVEL_ID) {
      return weeklyEvent(new Date(), LEVEL_CATALOG).level
    }
    return id ? (LEVEL_CATALOG.find((level) => level.id === id) ?? null) : null
  }

  get eventClaimedThisWeek(): boolean {
    return this.eventTracker.isClaimed(weeklyEvent(new Date(), LEVEL_CATALOG).week)
  }

  /** Pays this week's event reward once; returns false if it was already paid. */
  claimEventReward(): boolean {
    const event = weeklyEvent(new Date(), LEVEL_CATALOG)
    if (!this.eventTracker.claim(event.week)) {
      return false
    }
    this.services.progression.creditCoins(EVENT_REWARD.coins)
    this.services.progression.creditCrystals(EVENT_REWARD.crystals)
    this.services.telemetry.track('event_reward', { week: event.week })
    celebrate(this.services)
    return true
  }

  showLevelSelection(): void {
    const { ui, levels, progression, save } = this.services
    ui.showLevelSelection({
      levels: LEVEL_CATALOG,
      unlockedLevels: levels.unlockedLevels,
      levelProgress: levels.allProgress,
      currentCoins: progression.snapshot.coins,
      endlessBest: save.load<number>(ENDLESS_BEST_KEY, 0),
      event: this.eventView(),
    })
  }

  /** Opens a locked island early by paying its coin price. */
  unlockLevel(id: string): void {
    const { levels, progression, telemetry } = this.services
    const level = this.findLevel(id)
    if (!level || levels.isUnlocked(id) || level.unlockCost <= 0) {
      return
    }
    if (!progression.trySpend('coins', level.unlockCost)) {
      return
    }
    levels.unlock(id)
    telemetry.track('level_unlock', { level: id, cost: level.unlockCost })
    celebrate(this.services)
    this.showLevelSelection()
  }

  recordEndlessBest(distance: number): void {
    const { save } = this.services
    if (distance > save.load<number>(ENDLESS_BEST_KEY, 0)) {
      save.save(ENDLESS_BEST_KEY, Math.floor(distance))
    }
  }

  refreshBadges(): void {
    this.services.ui.setMenuBadges(this.services.meta.badges)
  }

  showProgress(): void {
    this.services.ui.showProgress(this.services.meta.progressView())
  }

  showDaily(): void {
    const view = this.services.meta.dailyView()
    this.services.ui.showDaily(view.status, view.rewards)
  }

  claimDaily(): void {
    const { meta, telemetry } = this.services
    if (meta.claimDaily()) {
      telemetry.track('daily_claim', { streak: meta.daily.status().streak })
      this.rewarded()
      // A good moment to offer "tell me when tomorrow's reward is ready".
      void this.services.reminders.askOnce()
    }
    this.showDaily()
  }

  claimMission(id: string): void {
    if (this.services.meta.claimMission(id) > 0) {
      this.services.telemetry.track('mission_claim', { id })
      this.rewarded()
    }
    this.showProgress()
  }

  claimAchievement(id: AchievementId): void {
    if (this.services.meta.claimAchievement(id) > 0) {
      this.services.telemetry.track('achievement_claim', { id })
      this.rewarded()
    }
    this.showProgress()
  }

  claimSeason(tier: number): void {
    const payout = this.services.meta.claimSeason(tier)
    if (payout) {
      this.services.telemetry.track('season_claim', {
        tier,
        season: this.services.meta.season.view().season,
        cosmetic: payout.cosmetic ?? '',
      })
      this.rewarded()
    }
    this.showProgress()
  }

  /** Clears the notices at the start of a run. */
  beginRun(): void {
    this.notices = []
  }

  /** Adds a summary-only line (e.g. "next island unlocked"). */
  addNotice(text: string): void {
    this.notices.push(text)
  }

  /** Shows HUD toasts for completed missions/achievements and keeps them for the summary. */
  notify(notices: readonly MetaNotice[]): void {
    for (const notice of notices) {
      this.notices.push(notice.text)
      if (this.isPlaying()) {
        this.services.ui.pushFeedback(notice.text, 'reward')
      }
    }
  }

  get runNotices(): readonly string[] {
    return this.notices
  }

  private rewarded(): void {
    celebrate(this.services)
    this.refreshBadges()
  }
}
