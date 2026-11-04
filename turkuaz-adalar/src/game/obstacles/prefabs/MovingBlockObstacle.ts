import * as THREE from 'three'
import { GAME_CONFIG } from '../../../config/GameConfig.ts'
import type { PhysicsWorld } from '../../../systems/physics/PhysicsWorld.ts'
import type { Rng } from '../../../utils/random.ts'
import type { ObstacleContact } from '../Obstacle.ts'
import type { ObstaclePrefab } from '../ObstacleModule.ts'
import { ObstacleBase } from '../ObstacleBase.ts'
import type { ObstacleAssets } from '../ObstacleAssets.ts'

/**
 * Moving block. The block slides side-to-side within its lane while the
 * warning rails stay anchored to the deck, so the patrol route is readable
 * before the block reaches the runner. Body motion is kinematic and sinusoidal.
 */
export class MovingBlockObstacle extends ObstacleBase {
  readonly kind = 'moving-block' as const
  readonly prefabId = 'moving-block'
  readonly standable = false

  private readonly block: THREE.Group
  private readonly centerY: number
  private readonly travel: number
  private readonly speed: number
  private phase = 0
  private moved = false

  constructor(
    id: number,
    scene: THREE.Scene,
    physics: PhysicsWorld,
    assets: ObstacleAssets,
  ) {
    const config = GAME_CONFIG.obstacles.movingBlock
    const group = new THREE.Group()
    group.name = 'MovingBlock'

    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(
        assets.roundedBox(config.travel + 0.5, 0.035, 0.1, 0.03),
        assets.warningMaterial,
      )
      rail.position.set(0, 0.03, side * (config.depth / 2 + 0.17))
      group.add(rail)
    }

    const block = new THREE.Group()
    const bodyMesh = new THREE.Mesh(
      assets.roundedBox(config.width, config.height, config.depth, 0.18),
      assets.hazardMaterial,
    )
    bodyMesh.position.y = config.height / 2
    bodyMesh.castShadow = true
    bodyMesh.receiveShadow = true
    block.add(bodyMesh)

    const trim = new THREE.Mesh(
      assets.roundedBox(config.width * 0.78, 0.16, config.depth * 0.78, 0.07),
      assets.barrierTrimMaterial,
    )
    trim.position.y = config.height - 0.12
    block.add(trim)

    const core = new THREE.Mesh(
      assets.roundedBox(config.width * 0.3, config.height * 0.28, config.depth * 0.3, 0.08),
      assets.mechanismGlowMaterial,
    )
    core.position.y = config.height * 0.52
    block.add(core)
    group.add(block)

    const body = physics.addKinematicBox(
      { x: 0, y: config.height / 2, z: 0 },
      { x: config.width / 2, y: config.height / 2, z: config.depth / 2 },
    )
    super(id, scene, physics, group, body.body, body.collider)
    this.block = block
    this.centerY = GAME_CONFIG.track.topY + config.height / 2
    this.travel = config.travel
    this.speed = (Math.PI * 2) / config.period
    this.radiusValue = config.radius
  }

  contact(): ObstacleContact {
    return { kind: 'hazard' }
  }

  fixedUpdate(delta: number): void {
    this.age += delta
    const offset = Math.sin(this.phase + this.age * this.speed) * (this.travel / 2)
    this.block.position.x = offset
    this.body.setNextKinematicTranslation({
      x: this.baseX + offset,
      y: this.centerY,
      z: this.baseZ,
    })
  }

  protected place(x: number, z: number, rng: Rng): void {
    this.phase = rng.range(0, Math.PI * 2)
    const config = GAME_CONFIG.obstacles.movingBlock
    const offset = Math.sin(this.phase) * (this.travel / 2)
    this.root.position.set(x, GAME_CONFIG.track.topY, z)
    this.block.position.x = offset
    this.baseX = x
    this.baseZ = z
    this.body.setTranslation(
      { x: x + offset, y: this.centerY, z },
      true,
    )
    this.moved = false
    this.radiusValue = config.radius
  }

  /** Current world-space centre, useful for warning/overlay consumers. */
  get worldX(): number {
    return this.baseX + this.block.position.x
  }

  get hasMoved(): boolean {
    return this.moved || this.age > 0
  }
}

export const MOVING_BLOCK_PREFAB: ObstaclePrefab = {
  id: 'moving-block',
  kind: 'moving-block',
  label: 'Moving block',
  standable: false,
  weight: GAME_CONFIG.obstacles.movingBlock.weight,
  unlockAt: GAME_CONFIG.obstacles.movingBlock.unlockAt,
  create: (scene, physics, assets, id) =>
    new MovingBlockObstacle(id, scene, physics, assets),
}
