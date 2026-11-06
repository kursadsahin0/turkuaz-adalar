import * as THREE from 'three'
import { GAME_CONFIG } from '../../../config/GameConfig.ts'
import type { PhysicsWorld } from '../../../systems/physics/PhysicsWorld.ts'
import type { Rng } from '../../../utils/random.ts'
import type { ObstacleContact } from '../Obstacle.ts'
import type { ObstaclePrefab } from '../ObstacleModule.ts'
import { ObstacleBase } from '../ObstacleBase.ts'
import type { ObstacleAssets } from '../ObstacleAssets.ts'

/**
 * Falling object. A crate is suspended above the lane, slams down on a
 * predictable schedule, rests briefly, then rises back up. The body is only
 * enabled during the fall/rest window; an overhead shadow warns of the drop.
 */
export class FallingObjectObstacle extends ObstacleBase {
  readonly kind = 'falling-object' as const
  readonly prefabId = 'falling-object'
  readonly standable = false

  private readonly crate: THREE.Group
  private readonly shadow: THREE.Mesh
  private readonly raisedY: number
  private readonly floorY: number
  private phase = 0
  private falling = false

  constructor(id: number, scene: THREE.Scene, physics: PhysicsWorld, assets: ObstacleAssets) {
    const config = GAME_CONFIG.obstacles.fallingObject
    const group = new THREE.Group()
    group.name = 'FallingObject'

    const shadow = new THREE.Mesh(
      assets.roundedBox(config.size * 1.1, 0.016, config.size * 1.1, 0.12),
      assets.shadowMaterial,
    )
    shadow.position.y = 0.018
    shadow.scale.set(1, 1, 1)
    group.add(shadow)

    const crate = new THREE.Group()
    const bodyMesh = new THREE.Mesh(
      assets.roundedBox(config.size, config.size, config.size, 0.14),
      assets.hazardMaterial,
    )
    bodyMesh.position.y = config.size / 2
    bodyMesh.castShadow = true
    bodyMesh.receiveShadow = true
    crate.add(bodyMesh)

    const strap = new THREE.Mesh(
      assets.roundedBox(config.size * 1.02, 0.09, config.size * 1.02, 0.08),
      assets.barrierTrimMaterial,
    )
    strap.position.y = config.size * 0.32
    crate.add(strap)

    const cap = new THREE.Mesh(
      assets.roundedBox(config.size * 0.72, 0.16, config.size * 0.72, 0.07),
      assets.mechanismMaterial,
    )
    cap.position.y = config.size - 0.12
    crate.add(cap)

    group.add(crate)

    const body = physics.addKinematicBox(
      { x: 0, y: config.fallHeight, z: 0 },
      { x: config.size / 2, y: config.size / 2, z: config.size / 2 },
    )
    super(id, scene, physics, group, body.body, body.collider)
    this.raisedY = GAME_CONFIG.track.topY + config.fallHeight
    this.floorY = GAME_CONFIG.track.topY + config.size / 2 + 0.02
    this.radiusValue = config.radius
    this.shadow = shadow
    this.crate = crate
  }

  contact(): ObstacleContact {
    return this.falling ? { kind: 'hazard' } : { kind: 'hazard' }
  }

  fixedUpdate(delta: number): void {
    this.age += delta
    const config = GAME_CONFIG.obstacles.fallingObject
    const cycle = config.fallTime + config.restTime + config.riseTime
    const t = (this.phase + this.age) % cycle

    if (t < config.fallTime) {
      const p = t / config.fallTime
      const eased = p * p
      this.crate.position.y = (this.raisedY - this.floorY) * (1 - eased)
      this.falling = true
    } else if (t < config.fallTime + config.restTime) {
      this.crate.position.y = 0
      this.falling = true
      const pulse = (Math.sin(this.age * 9) + 1) / 2
      const mat = this.shadow.material as THREE.MeshBasicMaterial
      mat.opacity = 0.3 + pulse * 0.16
    } else {
      const p = (t - config.fallTime - config.restTime) / config.riseTime
      this.crate.position.y = (this.raisedY - this.floorY) * p
      this.falling = false
    }

    if (t < config.fallTime) {
      const warn = t / config.fallTime
      const mat = this.shadow.material as THREE.MeshBasicMaterial
      mat.opacity = 0.18 + warn * 0.18
      this.shadow.scale.set(0.6 + warn * 0.5, 1, 0.6 + warn * 0.5)
    } else if (t >= config.fallTime + config.restTime) {
      const mat = this.shadow.material as THREE.MeshBasicMaterial
      mat.opacity = 0.08
      this.shadow.scale.set(1.08, 1, 1.08)
    } else {
      this.shadow.scale.set(1, 1, 1)
    }

    this.body.setNextKinematicTranslation({
      x: this.baseX,
      y: this.raisedY + this.crate.position.y + config.size / 2,
      z: this.baseZ,
    })
    this.collider.setEnabled(this.falling)
    this.body.setEnabled(this.falling)
    this.crate.visible = true
  }

  protected place(x: number, z: number, rng: Rng): void {
    const config = GAME_CONFIG.obstacles.fallingObject
    this.phase = rng.range(0, config.fallTime + config.restTime + config.riseTime)
    this.root.position.set(x, GAME_CONFIG.track.topY, z)
    this.crate.position.y = this.raisedY - this.floorY
    this.falling = false
    this.body.setTranslation({ x, y: this.raisedY + config.size / 2, z }, true)
    this.collider.setEnabled(false)
    this.body.setEnabled(false)
    const mat = this.shadow.material as THREE.MeshBasicMaterial
    mat.opacity = 0.16
    this.shadow.scale.set(0.7, 1, 0.7)
  }
}

export const FALLING_OBJECT_PREFAB: ObstaclePrefab = {
  id: 'falling-object',
  kind: 'falling-object',
  label: 'Falling crate',
  standable: false,
  weight: GAME_CONFIG.obstacles.fallingObject.weight,
  unlockAt: GAME_CONFIG.obstacles.fallingObject.unlockAt,
  create: (scene, physics, assets, id) => new FallingObjectObstacle(id, scene, physics, assets),
}
