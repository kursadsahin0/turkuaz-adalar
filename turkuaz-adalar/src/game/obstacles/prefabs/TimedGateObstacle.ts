import * as THREE from 'three'
import { GAME_CONFIG } from '../../../config/GameConfig.ts'
import type { PhysicsWorld } from '../../../systems/physics/PhysicsWorld.ts'
import type { Rng } from '../../../utils/random.ts'
import type { ObstacleContact } from '../Obstacle.ts'
import type { ObstaclePrefab } from '../ObstacleModule.ts'
import { ObstacleBase } from '../ObstacleBase.ts'
import type { ObstacleAssets } from '../ObstacleAssets.ts'

/**
 * Timed gate. A heavy barrier drops across both posts until it lifts back up,
 * leaving a window for the runner. While closed the collider is a solid
 * blocker; while open it is disabled. Warning beacons pulse before it opens.
 */
export class TimedGateObstacle extends ObstacleBase {
  readonly kind = 'timed-gate' as const
  readonly prefabId = 'timed-gate'
  readonly standable = false

  private readonly gate: THREE.Group
  private readonly beaconMaterial: THREE.MeshStandardMaterial
  private readonly gateMaterial: THREE.MeshStandardMaterial
  private readonly topY: number
  private phase = 0
  private open = false

  constructor(id: number, scene: THREE.Scene, physics: PhysicsWorld, assets: ObstacleAssets) {
    const config = GAME_CONFIG.obstacles.timedGate
    const group = new THREE.Group()
    group.name = 'TimedGate'

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        assets.cylinder(0.16, 0.2, config.height, 10),
        assets.mechanismMaterial,
      )
      post.position.set(side * 1.08, config.height / 2, 0)
      post.castShadow = true
      post.receiveShadow = true
      group.add(post)

      const base = new THREE.Mesh(
        assets.roundedBox(0.38, 0.16, 0.38, 0.08),
        assets.barrierTrimMaterial,
      )
      base.position.set(side * 1.08, 0.08, 0)
      group.add(base)

      const beacon = new THREE.Mesh(assets.cone(0.16, 0.28, 10), assets.mechanismGlowMaterial)
      beacon.position.set(side * 1.08, config.height + 0.08, 0)
      beacon.rotation.z = Math.PI
      group.add(beacon)
    }

    const gate = new THREE.Group()
    const gateMaterial = assets.hazardMaterial.clone()
    const panel = new THREE.Mesh(
      assets.roundedBox(config.width - 0.18, config.height - 0.12, config.depth, 0.12),
      gateMaterial,
    )
    panel.position.y = (config.height - 0.12) / 2
    panel.castShadow = true
    panel.receiveShadow = true
    gate.add(panel)

    for (let index = 0; index < 3; index += 1) {
      const bar = new THREE.Mesh(
        assets.roundedBox(config.width - 0.26, 0.12, config.depth + 0.08, 0.06),
        assets.barrierTrimMaterial,
      )
      bar.position.y = 0.26 + index * 0.52
      bar.position.z = 0.05
      gate.add(bar)
    }

    const emblem = new THREE.Mesh(
      assets.roundedBox(0.44, 0.44, config.depth + 0.1, 0.1),
      assets.mechanismGlowMaterial,
    )
    emblem.position.y = config.height * 0.36
    gate.add(emblem)
    group.add(gate)

    const body = physics.addKinematicBox(
      { x: 0, y: config.height / 2, z: 0 },
      {
        x: (config.width - 0.2) / 2,
        y: (config.height - 0.12) / 2,
        z: config.depth / 2,
      },
    )
    super(id, scene, physics, group, body.body, body.collider)
    this.baseX = 0
    this.baseZ = 0
    this.topY = GAME_CONFIG.track.topY
    this.radiusValue = config.radius
    this.gate = gate
    this.gateMaterial = gateMaterial
    this.beaconMaterial = assets.mechanismGlowMaterial
  }

  contact(): ObstacleContact {
    return this.open ? { kind: 'hazard' } : { kind: 'hazard' }
  }

  fixedUpdate(delta: number): void {
    this.age += delta
    const config = GAME_CONFIG.obstacles.timedGate
    const cycle = config.openTime + config.closedTime
    const t = (this.phase + this.age) % cycle
    const closed = t < config.closedTime
    this.open = !closed

    if (!closed && t < config.closedTime + config.warningTime) {
      const warn = 1 - (t - config.closedTime) / config.warningTime
      const pulse = 0.6 + warn * 0.4 * ((Math.sin(this.age * 10) + 1) / 2)
      ;(this.gateMaterial as THREE.MeshStandardMaterial).emissiveIntensity = 0.08 + warn * 0.24
      ;(this.beaconMaterial as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + pulse * 0.5
    } else if (closed) {
      ;(this.gateMaterial as THREE.MeshStandardMaterial).emissiveIntensity = 0.16
      ;(this.beaconMaterial as THREE.MeshStandardMaterial).emissiveIntensity =
        0.5 + ((Math.sin(this.age * 6.5) + 1) / 2) * 0.36
    } else {
      ;(this.gateMaterial as THREE.MeshStandardMaterial).emissiveIntensity = 0.06
      ;(this.beaconMaterial as THREE.MeshStandardMaterial).emissiveIntensity = 0.32
    }

    const lift = closed ? 0 : config.lift
    const gateY = GAME_CONFIG.track.topY + lift + config.height / 2 - 0.06
    this.gate.position.y = lift
    this.body.setNextKinematicTranslation({
      x: this.baseX,
      y: gateY,
      z: this.baseZ,
    })
    this.collider.setEnabled(closed)
    this.body.setEnabled(closed)
    this.gate.visible = closed
  }

  protected place(x: number, z: number, rng: Rng): void {
    const config = GAME_CONFIG.obstacles.timedGate
    this.phase = rng.range(0, config.openTime + config.closedTime)
    this.root.position.set(x, this.topY, z)
    this.baseX = x
    this.baseZ = z
    const t = this.phase % (config.openTime + config.closedTime)
    const closed = t < config.closedTime
    this.open = !closed
    this.gate.position.y = closed ? 0 : config.lift
    this.body.setTranslation(
      {
        x,
        y: this.topY + (closed ? 0 : config.lift) + config.height / 2 - 0.06,
        z,
      },
      true,
    )
    this.collider.setEnabled(closed)
    this.body.setEnabled(closed)
    this.gate.visible = closed
    ;(this.gateMaterial as THREE.MeshStandardMaterial).emissiveIntensity = 0.12
    ;(this.beaconMaterial as THREE.MeshStandardMaterial).emissiveIntensity = 0.5
  }
}

export const TIMED_GATE_PREFAB: ObstaclePrefab = {
  id: 'timed-gate',
  kind: 'timed-gate',
  label: 'Timed gate',
  standable: false,
  weight: GAME_CONFIG.obstacles.timedGate.weight,
  unlockAt: GAME_CONFIG.obstacles.timedGate.unlockAt,
  create: (scene, physics, assets, id) => new TimedGateObstacle(id, scene, physics, assets),
}
