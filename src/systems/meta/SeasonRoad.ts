import type { CosmeticType } from '../../game/characters/CharacterData.ts'
import type { SaveManager } from '../save/SaveManager.ts'
import { systemClock, type Clock } from './dayKey.ts'

/** XP for one tier; constant so the road is easy to read. */
export const SEASON_TIER_XP = 100
export const SEASON_TIERS = 30

export interface SeasonReward {
  readonly coins: number
  readonly crystals: number
  /** A cosmetic granted at the milestone tiers (crystals instead if owned). */
  readonly cosmetic?: {
    readonly type: CosmeticType
    readonly id: string
    readonly fallback: number
  }
}

/** The free reward line, tier 1..30. */
export const SEASON_REWARDS: readonly SeasonReward[] = Array.from(
  { length: SEASON_TIERS },
  (_, index) => {
    const tier = index + 1
    if (tier === 15) {
      return {
        coins: 0,
        crystals: 0,
        cosmetic: { type: 'color', id: 'color-lavender', fallback: 15 },
      } as const
    }
    if (tier === SEASON_TIERS) {
      return {
        coins: 0,
        crystals: 0,
        cosmetic: { type: 'accessory', id: 'acc-wings', fallback: 30 },
      } as const
    }
    if (tier % 10 === 0) {
      return { coins: 0, crystals: 10 }
    }
    if (tier % 5 === 0) {
      return { coins: 0, crystals: 3 }
    }
    return { coins: 60 + tier * 10, crystals: 0 }
  },
)

/** What a run is worth on the road. */
export function seasonXpFor(run: {
  readonly distance: number
  readonly completed: boolean
  readonly stars: number
}): number {
  return (
    Math.floor(Math.max(0, run.distance) / 25) +
    (run.completed ? 40 : 0) +
    Math.max(0, run.stars) * 10
  )
}

/** Seasons last a calendar month ("2026-11"). */
export function seasonKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function daysLeftInMonth(date: Date): number {
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return Math.max(1, Math.ceil((end.getTime() - date.getTime()) / 86_400_000))
}

interface SeasonState {
  season: string
  xp: number
  claimed: number[]
}

export interface SeasonView {
  readonly season: string
  readonly xp: number
  /** Tiers reached (0..30). */
  readonly tier: number
  /** XP into the next tier, 0..SEASON_TIER_XP. */
  readonly tierXp: number
  readonly daysLeft: number
  readonly tiers: readonly {
    readonly tier: number
    readonly reward: SeasonReward
    readonly reached: boolean
    readonly claimed: boolean
  }[]
}

const SAVE_KEY = 'season_road'

/**
 * A free monthly reward road: runs earn XP, every 100 XP reaches a tier, and
 * each tier pays coins, crystals or (at 15 and 30) a cosmetic. It keeps a
 * reason to play once all islands are done; it resets every month.
 */
export class SeasonRoad {
  private readonly save: SaveManager
  private readonly clock: Clock
  private state: SeasonState

  constructor(save: SaveManager, clock: Clock = systemClock) {
    this.save = save
    this.clock = clock
    const raw = save.load<Partial<SeasonState> | null>(SAVE_KEY, null)
    this.state = {
      season: typeof raw?.season === 'string' ? raw.season : seasonKey(clock()),
      xp: Math.max(0, Math.floor(Number(raw?.xp) || 0)),
      claimed: Array.isArray(raw?.claimed)
        ? raw.claimed.filter((tier): tier is number => Number.isInteger(tier))
        : [],
    }
    this.rollOver()
  }

  /** Adds XP; returns the tiers newly reached. */
  addXp(amount: number): number[] {
    this.rollOver()
    const before = this.tierOf(this.state.xp)
    this.state.xp += Math.max(0, Math.floor(amount))
    this.persist()
    const after = this.tierOf(this.state.xp)
    return Array.from({ length: after - before }, (_, index) => before + index + 1)
  }

  get claimable(): number {
    this.rollOver()
    const reached = this.tierOf(this.state.xp)
    let count = 0
    for (let tier = 1; tier <= reached; tier += 1) {
      if (!this.state.claimed.includes(tier)) {
        count += 1
      }
    }
    return count
  }

  /** Marks a reached tier claimed; returns its reward, or null. */
  claim(tier: number): SeasonReward | null {
    this.rollOver()
    if (
      !Number.isInteger(tier) ||
      tier < 1 ||
      tier > this.tierOf(this.state.xp) ||
      this.state.claimed.includes(tier)
    ) {
      return null
    }
    this.state.claimed = [...this.state.claimed, tier]
    this.persist()
    return SEASON_REWARDS[tier - 1]
  }

  view(): SeasonView {
    this.rollOver()
    const tier = this.tierOf(this.state.xp)
    return {
      season: this.state.season,
      xp: this.state.xp,
      tier,
      tierXp: tier >= SEASON_TIERS ? SEASON_TIER_XP : this.state.xp % SEASON_TIER_XP,
      daysLeft: daysLeftInMonth(this.clock()),
      tiers: SEASON_REWARDS.map((reward, index) => ({
        tier: index + 1,
        reward,
        reached: index + 1 <= tier,
        claimed: this.state.claimed.includes(index + 1),
      })),
    }
  }

  private tierOf(xp: number): number {
    return Math.min(SEASON_TIERS, Math.floor(xp / SEASON_TIER_XP))
  }

  /** A new month starts a new road (unclaimed rewards of the old one lapse). */
  private rollOver(): void {
    const current = seasonKey(this.clock())
    if (this.state.season !== current) {
      this.state = { season: current, xp: 0, claimed: [] }
      this.persist()
    }
  }

  private persist(): void {
    this.save.save(SAVE_KEY, this.state)
  }
}
