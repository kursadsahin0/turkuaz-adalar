import * as THREE from 'three'
import { GAME_CONFIG } from '../../../config/GameConfig.ts'
import type { PhysicsWorld } from '../../../systems/physics/PhysicsWorld.ts'
import type { Rng } from '../../../utils/random.ts'
import type { ObstacleContact } from '../Obstacle.ts'
import type { ObstaclePrefab } from '../ObstacleModule.ts'
import { ObstacleBase } from '../ObstacleBase.ts'
import type { ObstacleAssets } from '../ObstacleAssets.ts'

/**
 * Sliding obstacle. Runs along the lane direction to cut across just as the
 * runner arrives. A short warning strip telegraphs its approach and the block
 * is hidden until a small lead time before it enters the travel corridor.
 */
export class SlidingObstacle extends ObstacleBase {
  readonly kind = 'sliding-obstacle' as const
  readonly prefabId = 'sliding-obstacle'
  readonly standable = false

  private readonly slab: THREE.Group
  private readonly warningStrip: THREE.Mesh
  private readonly centerY: number
  private readonly travel: number
  private readonly speed: number
  private phase = 0

  constructor(
    id: number,
    scene: THREE.Scene,
    physics: PhysicsWorld,
    assets: ObstacleAssets,
  ) {
    const config = GAME_CONFIG.obstacles.slidingObstacle
    const group = new THREE.Group()
    group.name = 'SlidingObstacle'

    const warningStrip = new THREE.Mesh(
      assets.roundedBox(config.width + 0.22, 0.026, config.travel + 1, 0.02),
      assets.warningMaterial,
    )
    warningStrip.position.y = 0.028
    warningStrip.scale.z = 0
    group.add(warningStrip)

    const slab = new THREE.Group()
    const bodyMesh = new THREE.Mesh(
      assets.roundedBox(config.width, config.height, config.depth, 0.14),
      assets.hazardMaterial,
    )
    bodyMesh.position.y = config.height / 2
    bodyMesh.castShadow = true
    bodyMesh.receiveShadow = true
    slab.add(bodyMesh)

    const edge = new THREE.Mesh(
      assets.roundedBox(config.width, 0.12, config.depth, 0.08),
      assets.mechanismGlowMaterial,
    )
    edge.position.y = config.height - 0.08
    slab.add(edge)

    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(
        assets.roundedBox(0.14, config.height * 0.62, 0.22, 0.05),
        assets.barrierTrimMaterial,
      )
      fin.position.set(side * (config.width / 2 - 0.06), config.height * 0.46, config.depth / 2)
      slab.add(fin)
    }
    group.add(slab)

    const body = physics.addKinematicBox(
      { x: 0, y: config.height / 2, z: 0 },
      { x: config.width / 2, y: config.height / 2, z: config.depth / 2 },
    )
    super(id, scene, physics, group, body.body, body.collider)
    this.baseX = 0
    this.baseZ = 0
    this.centerY = GAME_CONFIG.track.topY + config.height / 2
    this.travel = config.travel
    this.speed = (Math.PI * 2) / config.period
    this.radiusValue = config.radius
    this.warningStrip = warningStrip
    this.slab = slab
  }

  contact(): ObstacleContact {
    return { kind: 'hazard' }
  }

  fixedUpdate(delta: number): void {
    this.age += delta
    const t = (Math.sin(this.phase + this.age * this.speed) + 1) / 2
    const offsetZ = (t - 0.5) * this.travel
    this.slab.position.z = offsetZ
    this.body.setNextKinematicTranslation({
      x: this.baseX,
      y: this.centerY,
      z: this.baseZ + offsetZ,
    })

    const warning = GAME_CONFIG.obstacles.warning
    const pulse = (Math.sin(this.age * warning.pulseSpeed) + 1) / 2
    this.warningStrip.scale.z = 0.8 + pulse * 0.4
    const mat = this.warningStrip.material as THREE.MeshBasicMaterial
    mat.opacity = 0.22 + pulse * 0.5
  }

  protected place(x: number, z: number, rng: Rng): void {
    this.phase = rng.range(0, Math.PI)
    const config = GAME_CONFIG.obstacles.slidingObstacle
    const t = (Math.sin(this.phase) + 1) / 2
    const offsetZ = (t - 0.5) * this.travel
    this.root.position.set(x, GAME_CONFIG.track.topY, z)
    this.slab.position.set(0, 0, offsetZ)
    this.baseX = x
    this.baseZ = z
    this.body.setTranslation(
      { x, y: this.centerY, z: z + offsetZ },
      true,
    )
    const mat = this.warningStrip.material as THREE.MeshBasicMaterial
    mat.opacity = 0.36
    this.warningStrip.scale.z = 1
    this.radiusValue = config.radius
  }
}

export const SLIDING_OBSTACLE_PREFAB: ObstaclePrefab = {
  id: 'sliding-obstacle',
  kind: 'sliding-obstacle',
  label: 'Sliding block',
  standable: false,
  weight: GAME_CONFIG.obstacles.slidingObstacle.weight,
  unlockAt: GAME_CONFIG.obstacles.slidingObstacle.unlockAt,
  create: (scene, physics, assets, id) =>
    new SlidingObstacle(id, scene, physics, assets),
}
