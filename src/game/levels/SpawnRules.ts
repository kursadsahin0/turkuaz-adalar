import { GAME_CONFIG } from '../../config/GameConfig.ts'
import type { LevelDefinition } from './LevelDefinition.ts'

/**
 * Seconds a runner needs to read a row and change lanes (about 0.25 s to
 * react plus 0.21 s to cross a lane). Obstacle rows closer than this in time
 * must leave a lane open that the previous row also left open.
 */
export const MIN_ROW_TIME = 0.45

/**
 * Lanes to block in one obstacle row. `order` is the shuffled lane list,
 * `twoLanes` asks for a double block. When the row comes too soon after the
 * previous one (`tight`), at least one lane that was open before stays open,
 * so the runner can always pass without changing lanes.
 */
export function chooseBlockedLanes(
  order: readonly number[],
  twoLanes: boolean,
  previouslyOpen: readonly number[] | null,
  tight: boolean,
): number[] {
  const blocked = order.slice(0, twoLanes ? 2 : 1)
  if (!tight || !previouslyOpen || previouslyOpen.length === 0) {
    return blocked
  }
  if (previouslyOpen.some((lane) => !blocked.includes(lane))) {
    return blocked
  }
  // Every lane that was open is now blocked: free one of them again.
  const keepOpen = previouslyOpen[0]
  return blocked.filter((lane) => lane !== keepOpen)
}

/**
 * Per-island spawning rules, read by the obstacle, collectible and
 * interaction generators. The endless run uses the global defaults.
 */
export interface SpawnRules {
  /** Metres from the start line that stay free of obstacles. */
  readonly safeStartDistance: number
  /** Minimum gap between obstacle rows, in metres (0 = no limit). */
  readonly minObstacleSpacing: number
  /** Chance that a segment holds a relic token (crystal). */
  readonly tokenChance: number
  /** Chance that a segment holds a power-up. */
  readonly powerUpChance: number
  /** One tide cache every N segments. */
  readonly rewardEverySegments: number
  /** Average coins per trail; null keeps the global trail lengths. */
  readonly coinTrailLength: number | null
  readonly checkpointsEnabled: boolean
  /** One checkpoint every N segments. */
  readonly checkpointEverySegments: number
  /** No checkpoint before this distance, in metres. */
  readonly checkpointMinDistance: number
  /** Seconds the runner needs between rows (longer on slippery ice). */
  readonly reactionTime: number
  /** An obstacle kind this island spawns far more often (ember rain). */
  readonly favouredObstacle: string | null
}

/** Ice makes lane changes this much slower; spawning leaves room for it. */
export const ICE_LANE_CONTROL = 0.65
const EMBER_KIND = 'falling-object'

export const DEFAULT_SPAWN_RULES: SpawnRules = {
  safeStartDistance: 12,
  minObstacleSpacing: 0,
  tokenChance: GAME_CONFIG.collectibles.tokens.chance,
  powerUpChance: GAME_CONFIG.collectibles.powerUps.chance,
  rewardEverySegments: GAME_CONFIG.collectibles.rewards.everySegments,
  coinTrailLength: null,
  checkpointsEnabled: true,
  checkpointEverySegments: GAME_CONFIG.interactions.checkpoint.everySegments,
  checkpointMinDistance: GAME_CONFIG.interactions.checkpoint.minDistance,
  reactionTime: MIN_ROW_TIME,
  favouredObstacle: null,
}

/** The rules an island's definition asks for. */
export function spawnRulesFor(level: LevelDefinition): SpawnRules {
  const segment = GAME_CONFIG.track.segmentLength
  return {
    safeStartDistance: Math.max(0, level.obstacles.safeZoneLength),
    minObstacleSpacing: Math.max(0, level.obstacles.minObstacleSpacing),
    tokenChance: clamp01(level.collectibles.tokenChance),
    powerUpChance: clamp01(level.collectibles.powerUpChance),
    rewardEverySegments: Math.max(1, Math.round(level.collectibles.rewardInterval)),
    coinTrailLength: Math.max(3, Math.round(level.collectibles.clusterSize)),
    checkpointsEnabled: level.checkpoints.enabled,
    checkpointEverySegments: Math.max(1, Math.round(level.checkpoints.interval / segment)),
    checkpointMinDistance: Math.max(0, level.checkpoints.minDistance),
    reactionTime: level.mechanic === 'ice' ? MIN_ROW_TIME / ICE_LANE_CONTROL : MIN_ROW_TIME,
    favouredObstacle: level.mechanic === 'embers' ? EMBER_KIND : null,
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
