import * as THREE from 'three'
import { GAME_CONFIG } from '../../../config/GameConfig.ts'
import type { PhysicsWorld } from '../../../systems/physics/PhysicsWorld.ts'
import type { Rng } from '../../../utils/random.ts'
import type { ObstacleContact } from '../Obstacle.ts'
import type { ObstaclePrefab } from '../ObstacleModule.ts'
import { ObstacleBase } from '../ObstacleBase.ts'
import type { ObstacleAssets } from '../ObstacleAssets.ts'

/**
 * Disappearing platform. Cycles between visible/solid and hidden/passable
 * with a clear warning glow. While hidden the physics collider is disabled
 * so the character cannot stand on air, and while visible it is standable.
 */
export class DisappearingPlatformObstacle extends ObstacleBase {
  readonly kind = 'disappearing-platform' as const
  readonly prefabId = 'disappearing-platform'
  readonly standable = true

  private readonly deck: THREE.Group
  private readonly warningRing: THREE.Mesh
  private readonly glow: THREE.Mesh
  private phase = 0
  private visible = true

  constructor(id: number, scene: THREE.Scene, physics: PhysicsWorld, assets: ObstacleAssets) {
    const config = GAME_CONFIG.obstacles.disappearingPlatform
    const group = new THREE.Group()
    group.name = 'DisappearingPlatform'

    const deck = new THREE.Group()
    const top = new THREE.Mesh(
      assets.roundedBox(config.width, config.thickness, config.depth, 0.16),
      assets.platformMaterial,
    )
    top.position.y = config.thickness / 2
    top.castShadow = true
    top.receiveShadow = true
    deck.add(top)

    const trim = new THREE.Mesh(
      assets.roundedBox(config.width * 0.92, 0.05, config.depth * 0.92, 0.09),
      assets.platformTrimMaterial,
    )
    trim.position.y = config.thickness + 0.012
    deck.add(trim)

    const edge = new THREE.Mesh(
      assets.roundedBox(config.width + 0.08, config.thickness * 0.6, 0.12, 0.06),
      assets.mechanismMaterial,
    )
    edge.position.y = config.thickness / 2
    edge.position.z = config.depth / 2 + 0.08
    deck.add(edge)
    group.add(deck)

    const warningRing = new THREE.Mesh(
      assets.torus(config.width * 0.38, 0.032, 6, 30),
      assets.warningMaterial,
    )
    warningRing.position.y = 0.04
    warningRing.rotation.x = Math.PI / 2
    warningRing.visible = false
    group.add(warningRing)

    const glow = new THREE.Mesh(
      assets.roundedBox(config.width * 0.86, 0.02, config.depth * 0.86, 0.08),
      assets.mechanismGlowMaterial,
    )
    glow.position.y = config.thickness + 0.014
    glow.material = assets.mechanismGlowMaterial.clone()
    glow.visible = false
    deck.add(glow)

    const body = physics.addStaticBox(
      { x: 0, y: config.thickness / 2, z: 0 },
      { x: config.width / 2, y: config.thickness / 2, z: config.depth / 2 },
    )
    super(id, scene, physics, group, body.body, body.collider)
    this.radiusValue = config.radius
    this.deck = deck
    this.warningRing = warningRing
    this.glow = glow
  }

  contact(): ObstacleContact {
    return this.visible ? { kind: 'safe' } : { kind: 'hazard' }
  }

  fixedUpdate(delta: number): void {
    this.age += delta
    const config = GAME_CONFIG.obstacles.disappearingPlatform
    const cycle = config.visibleTime + config.hiddenTime
    const t = (this.phase + this.age) % cycle

    if (t < config.visibleTime - config.warningTime) {
      if (!this.visible) {
        this.setVisible(true)
      }
    } else if (t < config.visibleTime) {
      if (this.visible) {
        const warn = (config.visibleTime - t) / config.warningTime
        this.setVisible(true, warn)
      } else {
        const glow = 1 - (t - config.visibleTime) / config.warningTime
        this.setVisible(false, glow)
      }
    } else {
      if (this.visible) {
        this.setVisible(false)
      }
    }

    if (!this.visible && this.warningRing.visible) {
      const pulse = (Math.sin(this.age * 8.5) + 1) / 2
      const mat = this.warningRing.material as THREE.MeshBasicMaterial
      mat.opacity = 0.24 + pulse * 0.44
    }
  }

  protected place(x: number, z: number, rng: Rng): void {
    const config = GAME_CONFIG.obstacles.disappearingPlatform
    this.phase = rng.range(0, config.visibleTime + config.hiddenTime)
    this.root.position.set(x, GAME_CONFIG.track.topY + config.lift, z)
    this.body.setTranslation(
      { x, y: GAME_CONFIG.track.topY + config.lift + config.thickness / 2, z },
      true,
    )
    this.setVisible(true, 0)
  }

  private setVisible(visible: boolean, intensity = 0): void {
    this.visible = visible
    this.deck.visible = visible
    this.collider.setEnabled(visible)
    this.body.setEnabled(visible)
    this.warningRing.visible = !visible || intensity > 0
    this.glow.visible = !visible || intensity > 0

    if (this.warningRing.visible) {
      const mat = this.warningRing.material as THREE.MeshBasicMaterial
      mat.opacity = !visible ? 0.56 + intensity * 0.24 : 0.16 + intensity * 0.46
    }
    if (this.glow.visible) {
      const mat = this.glow.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = !visible ? 0.42 + intensity * 0.26 : 0.18 + intensity * 0.32
    }
  }
}

export const DISAPPEARING_PLATFORM_PREFAB: ObstaclePrefab = {
  id: 'disappearing-platform',
  kind: 'disappearing-platform',
  label: 'Disappearing platform',
  standable: true,
  weight: GAME_CONFIG.obstacles.disappearingPlatform.weight,
  unlockAt: GAME_CONFIG.obstacles.disappearingPlatform.unlockAt,
  create: (scene, physics, assets, id) =>
    new DisappearingPlatformObstacle(id, scene, physics, assets),
}
