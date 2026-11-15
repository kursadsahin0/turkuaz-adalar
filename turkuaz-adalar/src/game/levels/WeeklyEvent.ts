import type { IslandMechanic, LevelDefinition } from './LevelDefinition.ts'

/** The event island's id; it is never part of the unlock chain. */
export const EVENT_LEVEL_ID = 'weekly-event'
/** Paid once per week for finishing the event island. */
export const EVENT_REWARD = { coins: 600, crystals: 15 } as const

/** The rule set of the week, layered on top of a regular island. */
interface EventTwist {
  readonly mechanic?: IslandMechanic
  readonly chase?: boolean
}

const TWISTS: readonly EventTwist[] = [
  { mechanic: 'wind', chase: true },
  { mechanic: 'embers' },
  { mechanic: 'ice', chase: true },
  { chase: true },
  { mechanic: 'embers', chase: true },
  { mechanic: 'ice' },
  { mechanic: 'wind' },
]

export interface WeeklyEvent {
  /** ISO week, e.g. "2026-W45": the event and its reward reset with it. */
  readonly week: string
  /** The playable island: a regular one with this week's twist. */
  readonly level: LevelDefinition
  /** Whole days until the next event (Monday). */
  readonly daysLeft: number
}

/** ISO-8601 week key (weeks start on Monday). */
export function weekKey(date: Date): string {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const weekday = day.getUTCDay() || 7
  day.setUTCDate(day.getUTCDate() + 4 - weekday)
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function hash(text: string): number {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 16777619) >>> 0
  }
  return value
}

/**
 * This week's event: the same for every player. A mid-game island (not a
 * chapter finale) gets one of the twists; reaching its finish line pays
 * EVENT_REWARD once per week.
 */
export function weeklyEvent(date: Date, catalog: readonly LevelDefinition[]): WeeklyEvent {
  const week = weekKey(date)
  const pool = catalog.slice(4, catalog.length - 1).filter((level) => !level.chase)
  const seed = hash(week)
  const base = pool[seed % pool.length]
  const twist = TWISTS[(seed >>> 8) % TWISTS.length]
  const weekday = date.getDay() || 7
  return {
    week,
    daysLeft: 8 - weekday,
    level: {
      ...base,
      id: EVENT_LEVEL_ID,
      eventOf: base.id,
      unlockCost: 0,
      mechanic: twist.mechanic,
      chase: twist.chase,
    },
  }
}
