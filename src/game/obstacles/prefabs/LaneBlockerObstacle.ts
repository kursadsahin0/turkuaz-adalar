import * as THREE from 'three'
import { GAME_CONFIG } from '../../../config/GameConfig.ts'
import type { PhysicsWorld } from '../../../systems/physics/PhysicsWorld.ts'
import type { Rng } from '../../../utils/random.ts'
import type { ObstacleContact } from '../Obstacle.ts'
import type { ObstaclePrefab } from '../ObstacleModule.ts'
import { ObstacleBase } from '../ObstacleBase.ts'
import type { ObstacleAssets } from '../ObstacleAssets.ts'

/**
 * Lane-blocking obstacle. A wide, readably-coloured barrier that can cover
 * the runner's lane entirely; it is telegraphed by warning posts and is
 * typically spawned so that another lane remains open (the manager enforces
 * one open lane).
 */
export class LaneBlockerObstacle extends ObstacleBase {
  readonly kind = 'lane-blocker' as const
  readonly prefabId = 'lane-blocker'
  readonly standable = false

  private readonly slab: THREE.Group
  private readonly warningLights: THREE.Mesh[] = []

  constructor(id: number, scene: THREE.Scene, physics: PhysicsWorld, assets: ObstacleAssets) {
    const config = GAME_CONFIG.obstacles.laneBlocker
    const group = new THREE.Group()
    group.name = 'LaneBlocker'

    const lights: THREE.Mesh[] = []

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        assets.cylinder(0.18, 0.22, config.height + 0.4, 10),
        assets.mechanismMaterial,
      )
      post.position.set(side * (config.width / 2 + 0.26), (config.height + 0.4) / 2, 0)
      post.castShadow = true
      post.receiveShadow = true
      group.add(post)

      const light = new THREE.Mesh(assets.cone(0.16, 0.26, 10), assets.mechanismGlowMaterial)
      light.position.set(side * (config.width / 2 + 0.26), config.height + 0.46, 0)
      light.rotation.z = Math.PI
      lights.push(light)
      group.add(light)
    }

    const slab = new THREE.Group()
    const panel = new THREE.Mesh(
      assets.roundedBox(config.width, config.height, config.depth, 0.16),
      assets.hazardMaterial,
    )
    panel.position.y = config.height / 2
    panel.castShadow = true
    panel.receiveShadow = true
    slab.add(panel)

    for (let index = 0; index < 4; index += 1) {
      const stripe = new THREE.Mesh(
        assets.roundedBox(config.width * 0.92, 0.16, config.depth + 0.08, 0.08),
        assets.barrierTrimMaterial,
      )
      stripe.position.y = 0.38 + index * 0.36
      stripe.position.z = 0.04
      slab.add(stripe)
    }

    const emblem = new THREE.Mesh(
      assets.roundedBox(0.52, 0.52, config.depth + 0.12, 0.12),
      assets.mechanismGlowMaterial,
    )
    emblem.position.y = config.height * 0.4
    slab.add(emblem)
    group.add(slab)

    const body = physics.addStaticBox(
      { x: 0, y: config.height / 2, z: 0 },
      { x: config.width / 2, y: config.height / 2, z: config.depth / 2 },
    )
    super(id, scene, physics, group, body.body, body.collider)
    this.radiusValue = config.radius
    this.slab = slab
    this.warningLights.push(...lights)
  }

  contact(): ObstacleContact {
    return { kind: 'hazard' }
  }

  fixedUpdate(delta: number): void {
    this.age += delta
    const pulse = (Math.sin(this.age * 7.2) + 1) / 2
    for (const light of this.warningLights) {
      ;(light.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + pulse * 0.6
    }
  }

  protected place(x: number, z: number, rng: Rng): void {
    const config = GAME_CONFIG.obstacles.laneBlocker
    this.root.position.set(x, GAME_CONFIG.track.topY, z)
    this.slab.rotation.y = rng.range(-0.08, 0.08)
    this.body.setTranslation({ x, y: GAME_CONFIG.track.topY + config.height / 2, z }, true)
  }
}

export const LANE_BLOCKER_PREFAB: ObstaclePrefab = {
  id: 'lane-blocker',
  kind: 'lane-blocker',
  label: 'Lane blocker',
  standable: false,
  weight: GAME_CONFIG.obstacles.laneBlocker.weight,
  unlockAt: GAME_CONFIG.obstacles.laneBlocker.unlockAt,
  create: (scene, physics, assets, id) => new LaneBlockerObstacle(id, scene, physics, assets),
}
