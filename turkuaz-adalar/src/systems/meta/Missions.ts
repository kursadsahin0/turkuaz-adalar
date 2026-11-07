import type { SaveManager } from '../save/SaveManager.ts'
import { dayKey, hashString, systemClock, type Clock } from './dayKey.ts'

export type MissionKind =
  | 'coins'
  | 'distance'
  | 'crystals'
  | 'dash'
  | 'jump'
  | 'runs'
  | 'powerups'
  | 'score'
  | 'islands'
  | 'stars'

/** Counters add up over the day; "best" missions need one run to reach the target. */
const BEST_IN_RUN: ReadonlySet<MissionKind> = new Set(['distance', 'score'])

interface MissionTemplate {
  readonly kind: MissionKind
  /** Candidate targets; one is chosen per day. */
  readonly targets: readonly number[]
  /** Coin reward per unit of target. */
  readonly rewardPerUnit: number
  readonly minReward: number
}

const POOL: readonly MissionTemplate[] = [
  { kind: 'coins', targets: [100, 150, 250], rewardPerUnit: 0.5, minReward: 50 },
  { kind: 'distance', targets: [400, 700, 1000], rewardPerUnit: 0.15, minReward: 60 },
  { kind: 'crystals', targets: [3, 5, 8], rewardPerUnit: 20, minReward: 60 },
  { kind: 'dash', targets: [10, 20, 30], rewardPerUnit: 4, minReward: 40 },
  { kind: 'jump', targets: [40, 70, 100], rewardPerUnit: 1, minReward: 40 },
  { kind: 'runs', targets: [3, 5], rewardPerUnit: 20, minReward: 60 },
  { kind: 'powerups', targets: [3, 5, 8], rewardPerUnit: 15, minReward: 45 },
  { kind: 'score', targets: [2500, 5000, 8000], rewardPerUnit: 0.02, minReward: 50 },
  // Island runs: finish islands, earn stars on them.
  { kind: 'islands', targets: [1, 2, 3], rewardPerUnit: 40, minReward: 60 },
  { kind: 'stars', targets: [3, 6, 9], rewardPerUnit: 12, minReward: 50 },
]

export const MISSIONS_PER_DAY = 3

export interface Mission {
  readonly id: string
  readonly kind: MissionKind
  readonly target: number
  readonly reward: number
  progress: number
  completed: boolean
  claimed: boolean
}

interface MissionState {
  day: string
  missions: Mission[]
  /** Days on which every mission was claimed (feeds an achievement). */
  perfectDays: number
}

const SAVE_KEY = 'missions'

export type MissionEvent =
  | {
      readonly kind: 'coins' | 'crystals' | 'dash' | 'jump' | 'powerups' | 'islands' | 'stars'
      readonly amount: number
    }
  | { readonly kind: 'runEnd'; readonly distance: number; readonly score: number }

/**
 * Three daily missions, the same for every player on a given day. Progress is
 * fed with gameplay events; completed missions are claimed for coins.
 */
export class Missions {
  private readonly save: SaveManager
  private readonly clock: Clock
  private state: MissionState

  constructor(save: SaveManager, clock: Clock = systemClock) {
    this.save = save
    this.clock = clock
    const raw = save.load<MissionState | null>(SAVE_KEY, null)
    this.state =
      raw && typeof raw.day === 'string' && Array.isArray(raw.missions)
        ? {
            day: raw.day,
            missions: raw.missions,
            perfectDays: Math.max(0, Number(raw.perfectDays) || 0),
          }
        : { day: '', missions: [], perfectDays: 0 }
    this.ensureToday()
  }

  get perfectDays(): number {
    return this.state.perfectDays
  }

  list(): readonly Mission[] {
    this.ensureToday()
    return this.state.missions
  }

  get claimable(): number {
    return this.list().filter((mission) => mission.completed && !mission.claimed).length
  }

  /** Applies an event and returns missions that became complete because of it. */
  record(event: MissionEvent): Mission[] {
    this.ensureToday()
    const finished: Mission[] = []
    for (const mission of this.state.missions) {
      if (mission.completed) {
        continue
      }
      const before = mission.progress
      if (event.kind === 'runEnd') {
        if (mission.kind === 'runs') {
          mission.progress += 1
        } else if (mission.kind === 'distance') {
          mission.progress = Math.max(mission.progress, Math.floor(event.distance))
        } else if (mission.kind === 'score') {
          mission.progress = Math.max(mission.progress, Math.floor(event.score))
        }
      } else if (event.kind === mission.kind && !BEST_IN_RUN.has(mission.kind)) {
        mission.progress += Math.max(0, Math.floor(event.amount))
      }
      if (mission.progress !== before && mission.progress >= mission.target) {
        mission.progress = mission.target
        mission.completed = true
        finished.push(mission)
      }
    }
    // Run-end events are rare; per-pickup events are frequent and cheap to batch.
    if (finished.length > 0 || event.kind === 'runEnd') {
      this.persist()
    }
    return finished
  }

  /** Flushes counters accumulated by frequent events. */
  persist(): void {
    this.save.save(SAVE_KEY, this.state)
  }

  /** Returns the coin reward, or 0 when the mission is not claimable. */
  claim(id: string): number {
    this.ensureToday()
    const mission = this.state.missions.find((entry) => entry.id === id)
    if (!mission || !mission.completed || mission.claimed) {
      return 0
    }
    mission.claimed = true
    if (this.state.missions.every((entry) => entry.claimed)) {
      this.state.perfectDays += 1
    }
    this.persist()
    return mission.reward
  }

  private ensureToday(): void {
    const today = dayKey(this.clock())
    if (this.state.day === today && this.state.missions.length === MISSIONS_PER_DAY) {
      return
    }
    this.state = {
      day: today,
      missions: generateMissions(today),
      perfectDays: this.state.perfectDays,
    }
    this.persist()
  }
}

/** Deterministic selection of distinct mission kinds for a day. */
export function generateMissions(day: string): Mission[] {
  let seed = hashString(day)
  const next = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed
  }
  const pool = [...POOL]
  const missions: Mission[] = []
  while (missions.length < MISSIONS_PER_DAY && pool.length > 0) {
    const template = pool.splice(next() % pool.length, 1)[0]
    const target = template.targets[next() % template.targets.length]
    const reward = Math.max(
      template.minReward,
      Math.round((target * template.rewardPerUnit) / 5) * 5,
    )
    missions.push({
      id: `${day}:${template.kind}`,
      kind: template.kind,
      target,
      reward,
      progress: 0,
      completed: false,
      claimed: false,
    })
  }
  return missions
}
