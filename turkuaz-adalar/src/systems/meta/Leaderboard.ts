import type { SaveManager } from '../save/SaveManager.ts'

export interface RunRecord {
  readonly score: number
  readonly distance: number
  /** Epoch milliseconds. */
  readonly at: number
}

/**
 * Where finished runs are reported. The local implementation keeps the
 * player's own top runs; an online service (Google Play Games Services
 * leaderboards via a Capacitor plugin) can implement the same interface and
 * be added next to it without touching gameplay code.
 */
export interface LeaderboardService {
  submit(record: RunRecord): void
  top(): readonly RunRecord[]
}

const SAVE_KEY = 'leaderboard'
export const LEADERBOARD_SIZE = 10

/** The player's ten best runs on this device, by score. */
export class LocalLeaderboard implements LeaderboardService {
  private readonly save: SaveManager
  private records: RunRecord[]

  constructor(save: SaveManager) {
    this.save = save
    const raw = save.load<unknown>(SAVE_KEY, [])
    this.records = Array.isArray(raw)
      ? raw
          .filter(
            (entry): entry is RunRecord =>
              typeof entry === 'object' &&
              entry !== null &&
              Number.isFinite((entry as RunRecord).score) &&
              Number.isFinite((entry as RunRecord).distance) &&
              Number.isFinite((entry as RunRecord).at),
          )
          .slice(0, LEADERBOARD_SIZE)
      : []
  }

  submit(record: RunRecord): void {
    if (record.score <= 0) {
      return
    }
    this.records = [...this.records, record]
      .sort((a, b) => b.score - a.score || b.distance - a.distance)
      .slice(0, LEADERBOARD_SIZE)
    this.save.save(SAVE_KEY, this.records)
  }

  top(): readonly RunRecord[] {
    return this.records
  }
}
