import * as THREE from 'three'
import { GAME_CONFIG } from '../../../config/GameConfig.ts'
import type { PhysicsWorld } from '../../../systems/physics/PhysicsWorld.ts'
import type { ObstacleContact } from '../Obstacle.ts'
import type { ObstaclePrefab } from '../ObstacleModule.ts'
import { ObstacleBase } from '../ObstacleBase.ts'
import type { ObstacleAssets } from '../ObstacleAssets.ts'

/**
 * Bounce trap. Looks like a spring pad but launches the runner upward when
 * contacted. Uses a low collider plus Game's pad-trigger logic expects the
 * obstacle manager to report a bounce on contact; the module exposes the
 * configured height through contact().
 */
export class BounceTrapObstacle extends ObstacleBase {
  readonly kind = 'bounce-trap' as const
  readonly prefabId = 'bounce-trap'
  readonly standable = false

  private readonly spring: THREE.Group
  private readonly ring: THREE.Mesh
  private readonly glow: THREE.Mesh
  private lastContactTime = -1000

  constructor(
    id: number,
    scene: THREE.Scene,
    physics: PhysicsWorld,
    assets: ObstacleAssets,
  ) {
    const config = GAME_CONFIG.obstacles.bounceTrap
    const group = new THREE.Group()
    group.name = 'BounceTrap'

    const base = new THREE.Mesh(
      assets.roundedBox(config.radius * 2, 0.12, config.radius * 2, 0.16),
      assets.mechanismMaterial,
    )
    base.position.y = 0.06
    base.castShadow = true
    base.receiveShadow = true
    group.add(base)

    const spring = new THREE.Group()
    const coil = new THREE.Mesh(
      assets.torus(config.radius * 0.62, 0.05, 10, 20),
      assets.hazardMaterial,
    )
    coil.position.y = 0.14
    coil.rotation.x = Math.PI / 2
    spring.add(coil)

    const mid = new THREE.Mesh(
      assets.torus(config.radius * 0.48, 0.044, 10, 18),
      assets.barrierTrimMaterial,
    )
    mid.position.y = 0.24
    mid.rotation.x = Math.PI / 2
    spring.add(mid)

    const top = new THREE.Mesh(
      assets.roundedBox(config.radius * 1.12, 0.16, config.radius * 1.12, 0.12),
      assets.mechanismGlowMaterial,
    )
    top.position.y = 0.38
    top.castShadow = true
    top.receiveShadow = true
    spring.add(top)
    group.add(spring)

    const ring = new THREE.Mesh(
      assets.torus(config.radius * 0.9, 0.028, 6, 28),
      assets.warningMaterial,
    )
    ring.position.y = 0.02
    ring.rotation.x = Math.PI / 2
    group.add(ring)

    const glow = new THREE.Mesh(
      assets.roundedBox(config.radius * 0.8, 0.014, config.radius * 0.8, 0.08),
      assets.mechanismGlowMaterial,
    )
    glow.position.y = 0.47
    ;(glow.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8
    group.add(glow)

    const body = physics.addStaticBox(
      { x: 0, y: config.thickness / 2, z: 0 },
      { x: config.radius, y: config.thickness / 2, z: config.radius },
    )
    super(id, scene, physics, group, body.body, body.collider)
    this.spring = spring
    this.ring = ring
    this.glow = glow
    this.radiusValue = config.radius + 0.16
  }

  contact(): ObstacleContact {
    const now = this.age
    if (now - this.lastContactTime < GAME_CONFIG.obstacles.bounceTrap.cooldown) {
      return { kind: 'hazard' }
    }
    this.lastContactTime = now
    return { kind: 'bounce', height: GAME_CONFIG.obstacles.bounceTrap.height }
  }

  fixedUpdate(delta: number): void {
    this.age += delta
    const config = GAME_CONFIG.obstacles.bounceTrap
    const since = this.age - this.lastContactTime
    const cooldown = config.cooldown
    if (since < 0.16) {
      const p = since / 0.16
      this.spring.scale.y = 1 + (1 - p) * 0.42
      this.spring.scale.x = 1 - (1 - p) * 0.12
      this.spring.scale.z = 1 - (1 - p) * 0.12
    } else if (since < cooldown) {
      this.spring.scale.y = 1
      this.spring.scale.x = 1
      this.spring.scale.z = 1
    }
    const pulse = (Math.sin(this.age * 7.5) + 1) / 2
    const mat = this.ring.material as THREE.MeshBasicMaterial
    mat.opacity = 0.28 + pulse * 0.38
    const glow = this.glow.material as THREE.MeshStandardMaterial
    glow.emissiveIntensity = 0.6 + pulse * 0.5
  }

  protected place(x: number, z: number): void {
    const config = GAME_CONFIG.obstacles.bounceTrap
    this.root.position.set(x, GAME_CONFIG.track.topY, z)
    this.body.setTranslation(
      { x, y: GAME_CONFIG.track.topY + config.thickness / 2, z },
      true,
    )
    this.spring.scale.set(1, 1, 1)
    this.lastContactTime = -1000
  }
}

export const BOUNCE_TRAP_PREFAB: ObstaclePrefab = {
  id: 'bounce-trap',
  kind: 'bounce-trap',
  label: 'Bounce trap',
  standable: false,
  weight: GAME_CONFIG.obstacles.bounceTrap.weight,
  unlockAt: GAME_CONFIG.obstacles.bounceTrap.unlockAt,
  create: (scene, physics, assets, id) =>
    new BounceTrapObstacle(id, scene, physics, assets),
}
