import * as THREE from 'three'
import { WORLD_CONFIG } from '../../../config/WorldConfig.ts'
import { createSeed, Rng } from '../../../utils/random.ts'
import type { WorldAssets } from '../WorldAssets.ts'
import { FloatingIsland } from './FloatingIsland.ts'
import { FloatingPad } from './FloatingPad.ts'

/**
 * Streams the decorative archipelago around the runner. Islands and pads are
 * built once, then recycled behind the camera exactly like the playable track,
 * so the horizon never runs out of scenery and no garbage is produced.
 */
export class IslandScenery {
  private readonly root = new THREE.Group()

  /** The scenery's scene-graph root (for instanced drawing). */
  get object(): THREE.Object3D {
    return this.root
  }
  private readonly islands: FloatingIsland[] = []
  private readonly pads: FloatingPad[] = []
  private rng = new Rng(createSeed())
  private recycleCursor = 0
  private padCursor = 0

  constructor(scene: THREE.Scene, assets: WorldAssets) {
    this.root.name = 'IslandScenery'

    const scenery = WORLD_CONFIG.scenery
    for (let index = 0; index < scenery.count; index += 1) {
      const island = new FloatingIsland(
        assets.floating,
        assets.vegetation,
        assets.waterfalls,
        index % 3,
        (index / scenery.count) * Math.PI * 2,
      )
      this.islands.push(island)
      this.root.add(island.root)
    }

    for (let index = 0; index < scenery.padCount; index += 1) {
      const pad = new FloatingPad(
        assets.floating,
        assets.platform,
        (index / scenery.padCount) * Math.PI * 2,
      )
      this.pads.push(pad)
      this.root.add(pad.root)
    }

    scene.add(this.root)
  }

  reset(seed = createSeed()): void {
    this.rng = new Rng(seed)
    this.recycleCursor = 0
    this.padCursor = 0

    const scenery = WORLD_CONFIG.scenery
    this.islands.forEach((island, index) => {
      const ratio = (index + this.rng.range(0.15, 0.75)) / scenery.count
      const z = scenery.maxZ + (scenery.minZ - scenery.maxZ) * ratio
      this.placeIsland(island, index, z)
      island.update(0)
    })

    this.pads.forEach((pad, index) => {
      const ratio = (index + this.rng.range(0.2, 0.8)) / scenery.padCount
      const z = scenery.padMinZ + (scenery.padMaxZ - scenery.padMinZ) * ratio
      this.placePad(pad, index, z)
      pad.update(0)
    })
  }

  update(playerPosition: THREE.Vector3, elapsed: number): void {
    const scenery = WORLD_CONFIG.scenery
    const playerZ = playerPosition.z
    let guard = 0

    while (guard < this.islands.length) {
      guard += 1
      const candidate = this.islands.find(
        (island) => island.centerZ > playerZ + scenery.recycleBehind,
      )
      if (!candidate) {
        break
      }

      let farthest = Number.POSITIVE_INFINITY
      for (const island of this.islands) {
        farthest = Math.min(farthest, island.centerZ)
      }

      const z = farthest - this.rng.range(scenery.aheadGapMin, scenery.aheadGapMax)
      this.recycleCursor += 1
      this.placeIsland(candidate, this.recycleCursor, z)
    }

    guard = 0
    while (guard < this.pads.length) {
      guard += 1
      const candidate = this.pads.find((pad) => pad.centerZ > playerZ + scenery.recycleBehind + 12)
      if (!candidate) {
        break
      }

      let farthest = Number.POSITIVE_INFINITY
      for (const pad of this.pads) {
        farthest = Math.min(farthest, pad.centerZ)
      }

      const z = farthest - this.rng.range(22, 36)
      this.padCursor += 1
      this.placePad(candidate, this.padCursor, z)
    }

    for (const island of this.islands) {
      island.update(elapsed)
    }
    for (const pad of this.pads) {
      pad.update(elapsed)
    }
  }

  dispose(): void {
    for (const island of this.islands) {
      island.dispose()
    }
    for (const pad of this.pads) {
      pad.dispose()
    }
    this.islands.length = 0
    this.pads.length = 0
    this.root.removeFromParent()
    this.root.clear()
  }

  private placeIsland(island: FloatingIsland, index: number, z: number): void {
    const scenery = WORLD_CONFIG.scenery
    const side = index % 2 === 0 ? -1 : 1
    const x = side * this.rng.range(scenery.minX, scenery.maxX)
    const y = this.rng.range(scenery.minY, scenery.maxY)
    const radius = this.rng.range(scenery.minRadius, scenery.maxRadius)
    island.layout(this.rng, x, y, z, radius)
  }

  private placePad(pad: FloatingPad, index: number, z: number): void {
    const scenery = WORLD_CONFIG.scenery
    const side = index % 2 === 0 ? -1 : 1
    const x = side * this.rng.range(scenery.padMinX, scenery.padMaxX)
    const y = this.rng.range(scenery.padMinY, scenery.padMaxY)
    const size = this.rng.range(scenery.padSizeMin, scenery.padSizeMax)
    pad.layout(this.rng, x, y, z, size)
  }
}
