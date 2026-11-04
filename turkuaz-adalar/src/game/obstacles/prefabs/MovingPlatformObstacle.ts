import * as THREE from 'three'
import { GAME_CONFIG } from '../../../config/GameConfig.ts'
import type { PhysicsWorld, Vector3Like } from '../../../systems/physics/PhysicsWorld.ts'
import type { Rng } from '../../../utils/random.ts'
import type { ObstacleContact } from '../Obstacle.ts'
import type { ObstaclePrefab } from '../ObstacleModule.ts'
import { ObstacleBase } from '../ObstacleBase.ts'
import type { ObstacleAssets } from '../ObstacleAssets.ts'

/**
 * Moving platform. A kinematic platform that travels in an oval path above
 * the deck. It is standable: Game/Player reads its velocity through
 * platformMotionProvider.
 */
export class MovingPlatformObstacle extends ObstacleBase {
  readonly kind = 'moving-platform' as const
  readonly prefabId = 'moving-platform'
  readonly standable = true

  private readonly platform: THREE.Group
  private readonly baseCenterY: number
  private readonly travelX: number
  private readonly travelY: number
  private readonly speed: number
  private phase = 0
  private currentCenterY = 0
  private velocity = { x: 0, y: 0, z: 0 }

  constructor(
    id: number,
    scene: THREE.Scene,
    physics: PhysicsWorld,
    assets: ObstacleAssets,
  ) {
    const config = GAME_CONFIG.obstacles.movingPlatform
    const group = new THREE.Group()
    group.name = 'ObstacleMovingPlatform'

    const platform = new THREE.Group()
    const top = new THREE.Mesh(
      assets.roundedBox(config.width, config.thickness, config.depth, 0.18),
      assets.platformMaterial,
    )
    top.position.y = config.thickness / 2
    top.castShadow = true
    top.receiveShadow = true
    platform.add(top)

    const trim = new THREE.Mesh(
      assets.roundedBox(config.width * 0.9, 0.06, config.depth * 0.9, 0.1),
      assets.platformTrimMaterial,
    )
    trim.position.y = config.thickness + 0.016
    platform.add(trim)

    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(
        assets.cylinder(0.14, 0.18, config.baseLift + 0.4, 10),
        assets.mechanismMaterial,
      )
      strut.position.set(side * (config.width / 2 - 0.16), (config.baseLift + 0.4) / 2, 0)
      platform.add(strut)
    }

    const glow = new THREE.Mesh(
      assets.torus(config.width * 0.28, 0.03, 6, 26),
      assets.mechanismGlowMaterial,
    )
    glow.position.y = config.thickness + 0.02
    glow.rotation.x = Math.PI / 2
    platform.add(glow)
    group.add(platform)

    const body = physics.addKinematicBox(
      { x: 0, y: config.baseLift, z: 0 },
      { x: config.width / 2, y: config.thickness / 2, z: config.depth / 2 },
    )
    super(id, scene, physics, group, body.body, body.collider)
    this.platform = platform
    this.baseCenterY = GAME_CONFIG.track.topY + config.baseLift
    this.travelX = config.travelX
    this.travelY = config.travelY
    this.speed = (Math.PI * 2) / config.period
    this.radiusValue = config.radius
  }

  contact(): ObstacleContact {
    return { kind: 'safe' }
  }

  platformVelocity(): Vector3Like {
    return this.velocity
  }

  fixedUpdate(delta: number): void {
    this.age += delta
    const offsetX = Math.sin(this.phase + this.age * this.speed) * (this.travelX / 2)
    const offsetY = Math.cos(this.phase + this.age * this.speed * 0.5) * (this.travelY / 2)
    const nextCenterY = this.baseCenterY + offsetY
    this.velocity.x = 0
    this.velocity.y = delta > 0 ? (nextCenterY - this.currentCenterY) / delta : 0
    this.velocity.z = 0
    this.currentCenterY = nextCenterY
    this.platform.position.x = offsetX
    this.platform.position.y = offsetY
    this.body.setNextKinematicTranslation({
      x: this.baseX + offsetX,
      y: nextCenterY,
      z: this.baseZ,
    })
  }

  protected place(x: number, z: number, rng: Rng): void {
    const config = GAME_CONFIG.obstacles.movingPlatform
    this.phase = rng.range(0, Math.PI * 2)
    const offsetX = Math.sin(this.phase) * (this.travelX / 2)
    const offsetY = Math.cos(this.phase * 0.5) * (this.travelY / 2)
    this.root.position.set(x, GAME_CONFIG.track.topY, z)
    this.platform.position.set(offsetX, offsetY, 0)
    this.baseX = x
    this.baseZ = z
    this.currentCenterY = this.baseCenterY + offsetY
    this.velocity = { x: 0, y: 0, z: 0 }
    this.body.setTranslation(
      { x: x + offsetX, y: this.currentCenterY, z },
      true,
    )
    this.radiusValue = config.radius
  }
}

export const MOVING_PLATFORM_OBSTACLE_PREFAB: ObstaclePrefab = {
  id: 'moving-platform-obs',
  kind: 'moving-platform',
  label: 'Moving platform',
  standable: true,
  weight: GAME_CONFIG.obstacles.movingPlatform.weight,
  unlockAt: GAME_CONFIG.obstacles.movingPlatform.unlockAt,
  create: (scene, physics, assets, id) =>
    new MovingPlatformObstacle(id, scene, physics, assets),
}
