import type { SaveManager } from '../save/SaveManager.ts'

interface WeeklyEventState {
  week: string
  claimed: boolean
}

const SAVE_KEY = 'weekly_event'

/** Remembers whether this week's event reward has been paid. */
export class WeeklyEventTracker {
  private readonly save: SaveManager
  private state: WeeklyEventState

  constructor(save: SaveManager) {
    this.save = save
    const raw = save.load<Partial<WeeklyEventState> | null>(SAVE_KEY, null)
    this.state = {
      week: typeof raw?.week === 'string' ? raw.week : '',
      claimed: raw?.claimed === true,
    }
  }

  isClaimed(week: string): boolean {
    return this.state.week === week && this.state.claimed
  }

  /** Marks the week as paid; returns false when it already was. */
  claim(week: string): boolean {
    if (this.isClaimed(week)) {
      return false
    }
    this.state = { week, claimed: true }
    this.save.save(SAVE_KEY, this.state)
    return true
  }
}
