import * as THREE from 'three'
import { WORLD_CONFIG } from '../../../config/WorldConfig.ts'
import { createSeed, Rng } from '../../../utils/random.ts'
import type { FloatingIslandAssets } from './FloatingIsland.ts'

/**
 * Unlit island silhouettes parked far beyond the streamed scenery. They sit in
 * a group that follows the runner, giving the horizon permanent depth without
 * ever needing collision, vegetation or extra updates.
 */
export class DistantIslands {
  private readonly root = new THREE.Group()
  private readonly meshes: THREE.Mesh[] = []

  constructor(scene: THREE.Scene, assets: FloatingIslandAssets) {
    this.root.name = 'DistantIslands'
    const rng = new Rng(createSeed())
    const distant = WORLD_CONFIG.distant

    for (let index = 0; index < distant.count; index += 1) {
      const mesh = assets.createDistantIsland(index, index % 2 === 0)
      const scale = rng.range(distant.minScale, distant.maxScale)
      mesh.position.set(
        rng.range(distant.minX, distant.maxX),
        rng.range(distant.minY, distant.maxY),
        rng.range(distant.minZ, distant.maxZ),
      )
      mesh.scale.set(scale, scale * rng.range(0.6, 0.9), scale)
      mesh.rotation.y = rng.range(0, Math.PI * 2)
      mesh.renderOrder = -4
      this.meshes.push(mesh)
      this.root.add(mesh)
    }

    scene.add(this.root)
  }

  update(playerPosition: THREE.Vector3): void {
    this.root.position.set(playerPosition.x * 0.12, 0, playerPosition.z)
  }

  dispose(): void {
    this.meshes.length = 0
    this.root.removeFromParent()
    this.root.clear()
  }
}
