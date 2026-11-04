import * as THREE from 'three'
import { GAME_CONFIG } from '../../config/GameConfig.ts'
import type { PhysicsWorld } from '../../systems/physics/PhysicsWorld.ts'
import { clamp } from '../../utils/math.ts'
import type { Rng } from '../../utils/random.ts'
import type { Obstacle } from './Obstacle.ts'
import { ObstacleAssets, type ObstacleModels } from './ObstacleAssets.ts'
import type { ObstaclePrefab } from './ObstacleModule.ts'
import { pickObstaclePrefab } from './ObstacleRegistry.ts'
import { ObstaclePool } from './ObstaclePool.ts'

/**
 * Rebuilt obstacle streamer. Every obstacle lives in its own module and is
 * reused through a pool with Rapier bodies disabled on release. The scheduler
 * is configuration-driven: weights and unlocks come from `GAME_CONFIG.obstacles`,
 * prefabs are chosen by difficulty, and at most one open lane is preserved
 * (with priority to keep a safe path) so runs stay readable.
 */
export class ObstacleManager {
  private readonly scene: THREE.Scene
  private readonly physics: PhysicsWorld
  readonly assets: ObstacleAssets
  private readonly bySegment = new Map<number, Obstacle[]>()
  private readonly byColliderHandle = new Map<number, Obstacle>()
  private readonly pools = new Map<string, ObstaclePool>()
  private nextId = 1

  constructor(scene: THREE.Scene, physics: PhysicsWorld, models: ObstacleModels = {}) {
    this.scene = scene
    this.physics = physics
    this.assets = new ObstacleAssets(models)
  }

  populateSegment(
    segmentId: number,
    centerZ: number,
    rng: Rng,
    difficulty: number,
    density: number,
  ): void {
    this.clearSegment(segmentId)

    const track = GAME_CONFIG.track
    const spawn = GAME_CONFIG.obstacles.spawn
    const nearZ = centerZ + track.segmentLength / 2 - spawn.edgeMargin
    const farZ = centerZ - track.segmentLength / 2 + spawn.edgeMargin
    const baseRows = Math.round(1 + difficulty * 1.6 + (density - 0.5))
    const rowCount = clamp(baseRows, 1, 3)
    const rowSpacing = (nearZ - farZ) / rowCount
    const obstacles: Obstacle[] = []

    for (let row = 0; row < rowCount; row += 1) {
      const rowZ = nearZ - rowSpacing * (row + 0.5) + rng.range(-spawn.zJitter, spawn.zJitter)
      const useTwo =
        rng.chance(spawn.twoLaneChance + difficulty * spawn.twoLaneDifficulty) &&
        track.lanePositions.length >= 3
      const laneOrder = rng.shuffled([...track.lanePositions])
      const blockedLanes = useTwo ? laneOrder.slice(0, 2) : laneOrder.slice(0, 1)

      for (const lane of blockedLanes) {
        const prefab = pickObstaclePrefab(difficulty, rng)
        if (!prefab) {
          continue
        }
        const x = lane + rng.range(-spawn.laneJitter, spawn.laneJitter)
        if (this.wouldBlockAllLanes(blockedLanes, lane, track.lanePositions.length)) {
          continue
        }
        obstacles.push(
          this.spawnObstacle(segmentId, prefab, x, rowZ, rng, difficulty),
        )
      }
    }

    if (obstacles.length > 0) {
      this.bySegment.set(segmentId, obstacles)
    }
  }

  clearSegment(segmentId: number): void {
    const obstacles = this.bySegment.get(segmentId)
    if (!obstacles) {
      return
    }

    for (const obstacle of obstacles) {
      this.byColliderHandle.delete(obstacle.collider.handle)
      const pool = this.pools.get(obstacle.prefabId)
      if (pool) {
        pool.release(obstacle)
      } else {
        obstacle.release()
        obstacle.dispose()
      }
    }

    this.bySegment.delete(segmentId)
  }

  clearAll(): void {
    for (const segmentId of [...this.bySegment.keys()]) {
      this.clearSegment(segmentId)
    }
    this.byColliderHandle.clear()
  }

  findByCollider(handle: number): Obstacle | undefined {
    return this.byColliderHandle.get(handle)
  }

  platformVelocity(handle: number): { x: number; y: number; z: number } | null {
    const obstacle = this.byColliderHandle.get(handle)
    return obstacle?.platformVelocity() ?? null
  }

  isBlocked(x: number, z: number, radius: number): boolean {
    for (const obstacles of this.bySegment.values()) {
      for (const obstacle of obstacles) {
        if (!obstacle.active) {
          continue
        }
        const deltaX = obstacle.x - x
        const deltaZ = obstacle.z - z
        const minimum = obstacle.radius + radius + 0.42
        if (deltaX * deltaX + deltaZ * deltaZ < minimum * minimum) {
          return true
        }
      }
    }
    return false
  }

  fixedUpdate(delta: number): void {
    if (delta <= 0) {
      return
    }
    for (const obstacles of this.bySegment.values()) {
      for (const obstacle of obstacles) {
        if (obstacle.active) {
          obstacle.fixedUpdate(delta)
        }
      }
    }
  }

  update(elapsed: number): void {
    this.assets.update(elapsed)
  }

  dispose(): void {
    this.clearAll()
    for (const pool of this.pools.values()) {
      pool.dispose()
    }
    this.pools.clear()
    this.assets.dispose()
  }

  private spawnObstacle(
    segmentId: number,
    prefab: ObstaclePrefab,
    x: number,
    z: number,
    rng: Rng,
    difficulty: number,
  ): Obstacle {
    let pool = this.pools.get(prefab.id)
    if (!pool) {
      pool = new ObstaclePool(() =>
        prefab.create(this.scene, this.physics, this.assets, this.nextId),
      )
      this.pools.set(prefab.id, pool)
    }

    const obstacle = pool.acquire()
    // Re-id pooled instances so collision->obstacle lookups remain unique per
    // logical spawn when debugging; the pool can recycle objects.
    ;(obstacle as { id: number }).id = this.nextId
    this.nextId += 1

    obstacle.spawn(segmentId, x, z, rng, difficulty)
    this.byColliderHandle.set(obstacle.collider.handle, obstacle)
    return obstacle
  }

  private wouldBlockAllLanes(
    blockedLanes: readonly number[],
    currentLane: number,
    laneCount: number,
  ): boolean {
    // laneBlocker is intentionally wide; prefer not blocking every lane in
    // the same row. The registry/prefab selection can still choose it, but we
    // avoid creating an impossible corridor here.
    if (blockedLanes.length >= laneCount - 1 && currentLane === blockedLanes[blockedLanes.length - 1]) {
      // If we'd cover all but maybe one, allow unless it truly covers all.
    }
    if (blockedLanes.length >= laneCount) {
      return true
    }
    return false
  }
}
