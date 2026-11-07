import * as THREE from 'three'
import type { Collider, RigidBody } from '@dimforge/rapier3d-compat'
import { GAME_CONFIG } from '../../config/GameConfig.ts'
import { WORLD_CONFIG } from '../../config/WorldConfig.ts'
import type { PhysicsWorld } from '../../systems/physics/PhysicsWorld.ts'
import type { Rng } from '../../utils/random.ts'
import { Rng as RandomSource } from '../../utils/random.ts'
import type { TreeInstance } from '../world/vegetation/VegetationAssets.ts'
import type { WorldAssets } from '../world/WorldAssets.ts'
import { Waterfall } from '../world/waterfalls/Waterfall.ts'

type PropKind = 'tree' | 'bush' | 'grass' | 'flower' | 'rock'

interface SegmentProp {
  object: THREE.Object3D
  kind: PropKind
  crown: THREE.Group | null
  phase: number
  slot: number
}

/**
 * One recycled piece of island track: the checker platform, its grass and sand
 * banks, a faceted rock keel, lush props and an optional waterfall. Visuals and
 * the static Rapier collider are created once, then repositioned as the runner
 * advances.
 */
export class IslandSegment {
  readonly id: number
  readonly root: THREE.Group

  private readonly body: RigidBody
  private readonly collider: Collider
  private readonly assets: WorldAssets
  private readonly props: SegmentProp[] = []
  private readonly mechanisms: THREE.Mesh[] = []
  private readonly waterfall: Waterfall
  private readonly colliderCenterY: number
  private centerPosition = 0
  private generationIndex = 0

  constructor(id: number, scene: THREE.Scene, physics: PhysicsWorld, assets: WorldAssets) {
    this.id = id
    this.assets = assets

    const track = GAME_CONFIG.track
    const totalHeight = track.baseThickness + track.topThickness
    this.colliderCenterY = track.topY - totalHeight / 2

    this.root = new THREE.Group()
    this.root.name = `IslandSegment-${id}`

    this.root.add(
      assets.island.createRock(),
      assets.island.createSand(),
      assets.island.createGrass(),
      assets.platform.createCheckerTop(),
      assets.platform.createDetails(),
    )

    const mechanismX = WORLD_CONFIG.platform.mechanismOffsetX
    for (let index = 0; index < 2; index += 1) {
      const mechanism = assets.platform.createMechanism()
      mechanism.position.set(
        index === 0 ? -mechanismX : mechanismX,
        track.topY - WORLD_CONFIG.island.grassTopDrop,
        index === 0 ? 5.6 : -5.6,
      )
      this.mechanisms.push(mechanism)
      this.root.add(mechanism)
    }

    this.waterfall = new Waterfall(assets.waterfalls, id * 1.7)
    this.root.add(this.waterfall.root)

    const staticBody = physics.addStaticBox(
      { x: 0, y: this.colliderCenterY, z: 0 },
      { x: track.width / 2, y: totalHeight / 2, z: track.segmentLength / 2 },
    )
    this.body = staticBody.body
    this.collider = staticBody.collider

    this.buildProps()
    scene.add(this.root)
  }

  get centerZ(): number {
    return this.centerPosition
  }

  get generation(): number {
    return this.generationIndex
  }

  get colliderHandle(): number {
    return this.collider.handle
  }

  reset(centerZ: number, rng: Rng): void {
    this.centerPosition = centerZ
    this.generationIndex += 1
    this.root.position.set(0, 0, centerZ)
    this.body.setTranslation({ x: 0, y: this.colliderCenterY, z: centerZ }, true)
    this.layout(rng)
  }

  update(elapsed: number): void {
    for (const prop of this.props) {
      if (prop.kind === 'tree' && prop.crown) {
        prop.crown.rotation.z = Math.sin(elapsed * 1.1 + prop.phase) * 0.04
        prop.crown.rotation.x = Math.cos(elapsed * 0.86 + prop.phase) * 0.02
      }
    }

    for (let index = 0; index < this.mechanisms.length; index += 1) {
      const mechanism = this.mechanisms[index]
      if (mechanism) {
        mechanism.rotation.y = elapsed * (0.42 + index * 0.16) + this.id + index
      }
    }

    this.waterfall.update(elapsed)
  }

  dispose(physics: PhysicsWorld): void {
    this.waterfall.dispose()
    this.root.removeFromParent()
    physics.removeBody(this.body)
  }

  private buildProps(): void {
    const vegetation = this.assets.vegetation
    const trees: TreeInstance[] = [
      vegetation.createPalm(0),
      vegetation.createPalm(1),
      vegetation.createRoundTree(0),
      vegetation.createPine(1),
    ]
    for (const tree of trees) {
      this.addProp(tree.group, 'tree', tree.crown)
    }

    this.addProp(vegetation.createBush(0), 'bush', null)
    this.addProp(vegetation.createBush(1), 'bush', null)
    this.addProp(vegetation.createGrass(), 'grass', null)
    this.addProp(vegetation.createGrass(), 'grass', null)
    this.addProp(vegetation.createGrass(), 'grass', null)
    this.addProp(vegetation.createFlowerCluster(0), 'flower', null)
    this.addProp(vegetation.createFlowerCluster(1), 'flower', null)
    this.addProp(vegetation.createFlowerCluster(2), 'flower', null)
    this.addProp(vegetation.createRock(0), 'rock', null)
    this.addProp(vegetation.createRock(1), 'rock', null)
    this.addProp(vegetation.createRock(2), 'rock', null)

    // Give the very first frame a complete layout; the field immediately
    // applies the run seed afterwards.
    this.layout(new RandomSource(this.id * 0x9e3779b1 + 1))
  }

  private addProp(object: THREE.Object3D, kind: PropKind, crown: THREE.Group | null): void {
    const prop: SegmentProp = {
      object,
      kind,
      crown,
      phase: Math.random() * Math.PI * 2,
      slot: this.props.length,
    }
    this.props.push(prop)
    this.root.add(object)
  }

  private layout(rng: Rng): void {
    const track = GAME_CONFIG.track
    const island = WORLD_CONFIG.island
    const waterfallConfig = WORLD_CONFIG.waterfall
    const halfLength = track.segmentLength / 2
    const grassTop = track.topY - island.grassTopDrop
    const count = this.props.length

    for (const prop of this.props) {
      const side = rng.chance(0.5) ? 1 : -1
      const ratio = (prop.slot + 0.5) / count
      const z = -halfLength + 2.4 + ratio * (track.segmentLength - 4.8) + rng.range(-0.8, 0.8)

      prop.phase = rng.range(0, Math.PI * 2)
      prop.object.rotation.set(0, rng.range(0, Math.PI * 2), 0)

      if (prop.kind === 'tree') {
        const scale = rng.range(0.84, 1.14)
        prop.object.position.set(side * rng.range(4.95, 5.55), grassTop, z)
        prop.object.scale.setScalar(scale)
      } else if (prop.kind === 'rock') {
        const scale = rng.range(0.6, 1.12)
        prop.object.position.set(side * rng.range(4.9, 5.6), grassTop + 0.16 * scale, z)
        prop.object.rotation.set(rng.range(-0.3, 0.3), rng.range(0, Math.PI), rng.range(-0.3, 0.3))
        prop.object.scale.set(scale, scale * rng.range(0.6, 0.95), scale * rng.range(0.85, 1.15))
      } else if (prop.kind === 'bush') {
        const scale = rng.range(0.72, 1.12)
        prop.object.position.set(side * rng.range(4.9, 5.5), grassTop, z)
        prop.object.scale.setScalar(scale)
      } else if (prop.kind === 'flower') {
        prop.object.position.set(side * rng.range(4.86, 5.6), grassTop, z)
        prop.object.scale.setScalar(rng.range(0.85, 1.2))
      } else {
        prop.object.position.set(side * rng.range(4.86, 5.62), grassTop, z)
        prop.object.scale.setScalar(rng.range(0.9, 1.4))
      }
    }

    const showFall = rng.chance(waterfallConfig.trackChance)
    this.waterfall.setVisible(showFall)
    if (showFall) {
      const side = rng.chance(0.5) ? 1 : -1
      const width = rng.range(waterfallConfig.trackWidthMin, waterfallConfig.trackWidthMax)
      const height = Math.max(0.9, grassTop - waterfallConfig.trackBottomY)

      this.waterfall.configure(width, height)
      this.waterfall.root.position.set(
        side * (island.bankWidth / 2 + 0.045),
        waterfallConfig.trackBottomY,
        rng.range(-halfLength + 3, halfLength - 3),
      )
      this.waterfall.root.rotation.y = side * (Math.PI / 2)
    }
  }
}
