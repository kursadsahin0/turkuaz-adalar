import * as THREE from 'three'
import { GAME_CONFIG } from '../../../config/GameConfig.ts'
import type { PhysicsWorld } from '../../../systems/physics/PhysicsWorld.ts'
import type { Rng } from '../../../utils/random.ts'
import type { ObstacleContact } from '../Obstacle.ts'
import type { ObstaclePrefab } from '../ObstacleModule.ts'
import { ObstacleBase } from '../ObstacleBase.ts'
import type { ObstacleAssets } from '../ObstacleAssets.ts'

export type StaticBarrierVariant = 'crate' | 'spire' | 'beam'

/**
 * Static barrier prefab. Crate/spire are solid blockers; the beam is an
 * overhead bar that stays passable with the slide mechanic.
 */
export class StaticBarrierObstacle extends ObstacleBase {
  readonly kind = 'static-barrier' as const
  readonly prefabId: string
  readonly standable = false

  private readonly variant: StaticBarrierVariant
  private readonly colliderCenterY: number
  private readonly halfWidth: number
  private readonly halfHeight: number
  private readonly halfDepth: number

  constructor(
    id: number,
    scene: THREE.Scene,
    physics: PhysicsWorld,
    assets: ObstacleAssets,
    variant: StaticBarrierVariant,
  ) {
    const visual = assets.create(variant)
    const body = physics.addStaticBox(
      { x: 0, y: visual.collider.centerY, z: 0 },
      {
        x: visual.collider.halfWidth,
        y: visual.collider.halfHeight,
        z: visual.collider.halfDepth,
      },
    )
    super(id, scene, physics, visual.group, body.body, body.collider)
    this.variant = variant
    this.prefabId = `static-barrier-${variant}`
    this.colliderCenterY = visual.collider.centerY
    this.halfWidth = visual.collider.halfWidth
    this.halfHeight = visual.collider.halfHeight
    this.halfDepth = visual.collider.halfDepth
    this.radiusValue = visual.radius
  }

  contact(): ObstacleContact {
    return { kind: 'hazard' }
  }

  fixedUpdate(): void {
    // Static barriers never move; keeping the collision predictable is the
    // whole point of this prefab.
  }

  protected place(x: number, z: number, rng: Rng): void {
    const topY = GAME_CONFIG.track.topY
    this.root.position.set(x, topY, z)
    this.root.rotation.y =
      this.variant === 'crate'
        ? rng.range(-0.18, 0.18)
        : this.variant === 'spire'
          ? rng.range(0, Math.PI * 2)
          : 0
    this.body.setTranslation(
      { x, y: topY + this.colliderCenterY, z },
      true,
    )
  }

  /** Kept for one-off validation rigs and debugging overlays. */
  get colliderSize(): {
    halfWidth: number
    halfHeight: number
    halfDepth: number
  } {
    return {
      halfWidth: this.halfWidth,
      halfHeight: this.halfHeight,
      halfDepth: this.halfDepth,
    }
  }
}

const staticConfig = GAME_CONFIG.obstacles.staticBarrier

function definePrefab(variant: StaticBarrierVariant): ObstaclePrefab {
  const variantConfig = staticConfig.variants[variant]
  return {
    id: `static-barrier-${variant}`,
    kind: 'static-barrier',
    label: `Static ${variant}`,
    standable: false,
    weight: variantConfig.weight,
    unlockAt: variantConfig.unlockAt,
    create: (scene, physics, assets, id) =>
      new StaticBarrierObstacle(id, scene, physics, assets, variant),
  }
}

export const STATIC_BARRIER_PREFABS: readonly ObstaclePrefab[] = [
  definePrefab('crate'),
  definePrefab('spire'),
  definePrefab('beam'),
]
