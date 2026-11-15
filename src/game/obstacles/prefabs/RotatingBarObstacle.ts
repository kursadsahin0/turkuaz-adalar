import * as THREE from 'three'
import { GAME_CONFIG } from '../../../config/GameConfig.ts'
import type { PhysicsWorld } from '../../../systems/physics/PhysicsWorld.ts'
import type { Rng } from '../../../utils/random.ts'
import type { ObstacleContact } from '../Obstacle.ts'
import type { ObstaclePrefab } from '../ObstacleModule.ts'
import { ObstacleBase } from '../ObstacleBase.ts'
import type { ObstacleAssets } from '../ObstacleAssets.ts'

/**
 * Rotating bar. The Rapier body is a kinematic box that rotates around its
 * centre; the visual root rotates around the same vertical axis so the swept
 * volume always matches what the player sees. The bar sits low enough to jump.
 */
export class RotatingBarObstacle extends ObstacleBase {
  readonly kind = 'rotating-bar' as const
  readonly prefabId = 'rotating-bar'
  readonly standable = false

  private readonly barY: number
  private angle = 0
  private readonly speed: number

  constructor(id: number, scene: THREE.Scene, physics: PhysicsWorld, assets: ObstacleAssets) {
    const config = GAME_CONFIG.obstacles.rotatingBar
    const group = new THREE.Group()
    group.name = 'RotatingBar'

    const base = new THREE.Mesh(assets.cylinder(0.42, 0.5, 0.24, 14), assets.mechanismMaterial)
    base.position.y = 0.12
    base.castShadow = true
    base.receiveShadow = true
    group.add(base)

    const collar = new THREE.Mesh(
      assets.cylinder(0.28, 0.32, 0.18, 12),
      assets.mechanismGlowMaterial,
    )
    collar.position.y = 0.31
    group.add(collar)

    const bar = new THREE.Mesh(
      assets.roundedBox(config.barLength, config.barThickness, config.barThickness, 0.08),
      assets.hazardMaterial,
    )
    bar.position.y = config.barY
    bar.castShadow = true
    bar.receiveShadow = true
    group.add(bar)

    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(
        assets.roundedBox(0.28, 0.32, 0.32, 0.08),
        assets.barrierTrimMaterial,
      )
      cap.position.set(side * (config.barLength / 2 - 0.08), config.barY, 0)
      cap.castShadow = true
      group.add(cap)

      const lamp = new THREE.Mesh(assets.cone(0.14, 0.24, 10), assets.mechanismGlowMaterial)
      lamp.position.set(side * (config.barLength / 2 - 0.08), config.barY + 0.24, 0)
      lamp.rotation.z = Math.PI
      group.add(lamp)
    }

    const warning = new THREE.Mesh(
      assets.torus(config.radius * 0.92, 0.035, 6, 28),
      assets.warningMaterial,
    )
    warning.position.y = 0.03
    warning.rotation.x = Math.PI / 2
    group.add(warning)

    const body = physics.addKinematicBox(
      { x: 0, y: config.barY, z: 0 },
      {
        x: config.barLength / 2,
        y: config.barThickness / 2,
        z: config.barThickness / 2,
      },
    )
    super(id, scene, physics, group, body.body, body.collider)
    this.barY = config.barY
    this.speed = config.angularSpeed
    this.radiusValue = config.radius
  }

  contact(): ObstacleContact {
    return { kind: 'hazard' }
  }

  fixedUpdate(delta: number): void {
    this.age += delta
    this.angle += this.speed * delta
    this.root.rotation.y = this.angle
    this.body.setNextKinematicRotation({
      x: 0,
      y: Math.sin(this.angle / 2),
      z: 0,
      w: Math.cos(this.angle / 2),
    })
  }

  protected place(x: number, z: number, rng: Rng): void {
    const topY = GAME_CONFIG.track.topY
    this.angle = rng.range(0, Math.PI * 2)
    this.root.position.set(x, topY, z)
    this.root.rotation.y = this.angle
    this.body.setTranslation({ x, y: topY + this.barY, z }, true)
    this.body.setRotation(
      {
        x: 0,
        y: Math.sin(this.angle / 2),
        z: 0,
        w: Math.cos(this.angle / 2),
      },
      true,
    )
  }
}

export const ROTATING_BAR_PREFAB: ObstaclePrefab = {
  id: 'rotating-bar',
  kind: 'rotating-bar',
  label: 'Rotating bar',
  standable: false,
  weight: GAME_CONFIG.obstacles.rotatingBar.weight,
  unlockAt: GAME_CONFIG.obstacles.rotatingBar.unlockAt,
  create: (scene, physics, assets, id) => new RotatingBarObstacle(id, scene, physics, assets),
}
