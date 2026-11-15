import type * as THREE from 'three'
import { GAME_CONFIG } from '../../config/GameConfig.ts'
import type { PhysicsWorld } from '../../systems/physics/PhysicsWorld.ts'
import { createSeed, mixSeed, Rng } from '../../utils/random.ts'
import type { WorldAssets } from '../world/WorldAssets.ts'
import { IslandSegment } from './IslandSegment.ts'

/**
 * Endless track streamer. Segment objects (and their physics bodies) are created
 * once and teleported ahead as soon as they leave the camera behind.
 */
export class IslandField {
  private readonly physics: PhysicsWorld
  private readonly assets: WorldAssets
  private readonly segments: IslandSegment[] = []
  private seed = createSeed()

  constructor(scene: THREE.Scene, physics: PhysicsWorld, assets: WorldAssets) {
    this.physics = physics
    this.assets = assets

    for (let index = 0; index < GAME_CONFIG.track.segmentCount; index += 1) {
      this.segments.push(new IslandSegment(index, scene, physics, this.assets))
    }
  }

  get all(): readonly IslandSegment[] {
    return this.segments
  }

  reset(seed = createSeed()): void {
    this.seed = seed
    const length = GAME_CONFIG.track.segmentLength

    for (const segment of this.segments) {
      const centerZ = -segment.id * length
      segment.reset(centerZ, new Rng(mixSeed(seed, segment.id, segment.generation)))
    }
  }

  /** Recycles passed segments and returns those that moved ahead. */
  stream(playerZ: number): IslandSegment[] {
    const length = GAME_CONFIG.track.segmentLength
    const recycled: IslandSegment[] = []
    let guard = 0

    while (guard < this.segments.length) {
      guard += 1
      const candidate = this.segments.find(
        (segment) => segment.centerZ - length / 2 > playerZ + GAME_CONFIG.track.recycleBehind,
      )
      if (!candidate) {
        break
      }

      let farthestCenter = Number.POSITIVE_INFINITY
      for (const segment of this.segments) {
        farthestCenter = Math.min(farthestCenter, segment.centerZ)
      }

      const nextCenter = farthestCenter - length
      candidate.reset(nextCenter, new Rng(mixSeed(this.seed, candidate.id, candidate.generation)))
      recycled.push(candidate)
    }

    return recycled
  }

  update(elapsed: number): void {
    for (const segment of this.segments) {
      segment.update(elapsed)
    }
  }

  dispose(): void {
    for (const segment of this.segments) {
      segment.dispose(this.physics)
    }
    this.segments.length = 0
  }
}
