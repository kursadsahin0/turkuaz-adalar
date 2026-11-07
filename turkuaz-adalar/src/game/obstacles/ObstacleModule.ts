import type * as THREE from 'three'
import type { PhysicsWorld } from '../../systems/physics/PhysicsWorld.ts'
import type { Obstacle, ObstacleKind } from './Obstacle.ts'
import type { ObstacleAssets } from './ObstacleAssets.ts'

/**
 * A reusable obstacle prefab. Prefabs are pure descriptions: they own their
 * weight/unlock tuning and know how to construct a pooled runtime instance.
 * Every obstacle family lives in its own module file and exports one or more
 * prefabs, so adding a new obstacle never touches the scheduler.
 */
export interface ObstaclePrefab {
  readonly id: string
  readonly kind: ObstacleKind
  readonly label: string
  readonly standable: boolean
  /** Weight inside the difficulty-weighted spawn table. */
  readonly weight: number
  /** Level difficulty (0..1) at which this prefab starts spawning. */
  readonly unlockAt: number
  create(scene: THREE.Scene, physics: PhysicsWorld, assets: ObstacleAssets, id: number): Obstacle
}
