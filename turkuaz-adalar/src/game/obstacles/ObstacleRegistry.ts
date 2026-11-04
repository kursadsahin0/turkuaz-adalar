import { GAME_CONFIG } from '../../config/GameConfig.ts'
import type { ObstaclePrefab } from './ObstacleModule.ts'
import { BOUNCE_TRAP_PREFAB } from './prefabs/BounceTrapObstacle.ts'
import { DISAPPEARING_PLATFORM_PREFAB } from './prefabs/DisappearingPlatformObstacle.ts'
import { FALLING_OBJECT_PREFAB } from './prefabs/FallingObjectObstacle.ts'
import { LANE_BLOCKER_PREFAB } from './prefabs/LaneBlockerObstacle.ts'
import { MOVING_BLOCK_PREFAB } from './prefabs/MovingBlockObstacle.ts'
import { MOVING_PLATFORM_OBSTACLE_PREFAB } from './prefabs/MovingPlatformObstacle.ts'
import { ROTATING_BAR_PREFAB } from './prefabs/RotatingBarObstacle.ts'
import { SLIDING_OBSTACLE_PREFAB } from './prefabs/SlidingObstacle.ts'
import { STATIC_BARRIER_PREFABS } from './prefabs/StaticBarrierObstacle.ts'
import { TIMED_GATE_PREFAB } from './prefabs/TimedGateObstacle.ts'

/**
 * All modular obstacle prefabs, registered in one place. The manager builds
 * a difficulty-weighted table from this list so new families can be added by
 * dropping a module into `prefabs/` and appending it here.
 */
export const OBSTACLE_PREFABS: readonly ObstaclePrefab[] = [
  ...STATIC_BARRIER_PREFABS,
  ROTATING_BAR_PREFAB,
  MOVING_BLOCK_PREFAB,
  SLIDING_OBSTACLE_PREFAB,
  DISAPPEARING_PLATFORM_PREFAB,
  TIMED_GATE_PREFAB,
  MOVING_PLATFORM_OBSTACLE_PREFAB,
  FALLING_OBJECT_PREFAB,
  BOUNCE_TRAP_PREFAB,
  LANE_BLOCKER_PREFAB,
]

/** Pick a prefab that is unlocked at or below the given difficulty (0..1). */
export function pickObstaclePrefab(
  difficulty: number,
  rng: import('../../utils/random.ts').Rng,
): ObstaclePrefab | null {
  const candidates = OBSTACLE_PREFABS.filter(
    (prefab) => difficulty >= prefab.unlockAt - 1e-6,
  )
  if (candidates.length === 0) {
    return null
  }

  const totalWeight = candidates.reduce(
    (sum, prefab) => sum + Math.max(0, prefab.weight),
    0,
  )
  if (totalWeight <= 0) {
    return rng.pick(candidates)
  }

  let roll = rng.next() * totalWeight
  for (const prefab of candidates) {
    roll -= Math.max(0, prefab.weight)
    if (roll <= 0) {
      return prefab
    }
  }
  return candidates[candidates.length - 1]
}

/**
 * Static-barrier mix weights are driven by config. The manager uses this to
 * bias which simple barrier appears on early segments while still keeping the
 * spawn pool reusable.
 */
export function staticBarrierWeight(variant: 'crate' | 'spire' | 'beam'): number {
  return GAME_CONFIG.obstacles.staticBarrier.variants[variant].weight
}
