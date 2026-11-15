import type { SaveManager } from '../save/SaveManager.ts'
import { dayKey, previousDayKey, systemClock, type Clock } from './dayKey.ts'

export interface Reward {
  readonly coins: number
  readonly crystals: number
}

/** A seven-day cycle; day 7 is the big one. */
export const DAILY_REWARDS: readonly Reward[] = [
  { coins: 50, crystals: 0 },
  { coins: 75, crystals: 0 },
  { coins: 100, crystals: 0 },
  { coins: 150, crystals: 1 },
  { coins: 200, crystals: 0 },
  { coins: 250, crystals: 0 },
  { coins: 300, crystals: 5 },
]

interface DailyState {
  lastClaimDay: string | null
  streak: number
  bestStreak: number
}

const SAVE_KEY = 'daily'

export interface DailyStatus {
  readonly canClaim: boolean
  /** 0-6: the tile that is (or was today) claimed. */
  readonly dayIndex: number
  /** Streak including today's claim if it was made. */
  readonly streak: number
}

/**
 * Login streak rewards. Claiming on consecutive local days grows the streak;
 * skipping a day restarts it at day 1.
 */
export class DailyRewards {
  private readonly save: SaveManager
  private readonly clock: Clock
  private state: DailyState

  constructor(save: SaveManager, clock: Clock = systemClock) {
    this.save = save
    this.clock = clock
    const raw = save.load<Partial<DailyState> | null>(SAVE_KEY, null)
    this.state = {
      lastClaimDay: typeof raw?.lastClaimDay === 'string' ? raw.lastClaimDay : null,
      streak: Math.max(0, Math.floor(Number(raw?.streak) || 0)),
      bestStreak: Math.max(0, Math.floor(Number(raw?.bestStreak) || 0)),
    }
  }

  get bestStreak(): number {
    return this.state.bestStreak
  }

  status(): DailyStatus {
    const now = this.clock()
    const today = dayKey(now)
    if (this.state.lastClaimDay === today) {
      return {
        canClaim: false,
        dayIndex: (this.state.streak - 1) % DAILY_REWARDS.length,
        streak: this.state.streak,
      }
    }
    const continues = this.state.lastClaimDay === previousDayKey(now)
    const streak = continues ? this.state.streak : 0
    return { canClaim: true, dayIndex: streak % DAILY_REWARDS.length, streak }
  }

  /** Returns the reward granted, or null when today's reward was already taken. */
  claim(): Reward | null {
    const status = this.status()
    if (!status.canClaim) {
      return null
    }
    const reward = DAILY_REWARDS[status.dayIndex]
    const streak = status.streak + 1
    this.state = {
      lastClaimDay: dayKey(this.clock()),
      streak,
      bestStreak: Math.max(this.state.bestStreak, streak),
    }
    this.save.save(SAVE_KEY, this.state)
    return reward
  }
}
