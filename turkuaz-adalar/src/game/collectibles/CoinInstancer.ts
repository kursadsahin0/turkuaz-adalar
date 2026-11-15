import * as THREE from 'three'
import type { Collectible } from './Collectible.ts'

/** Shared coin look: one body and one rim geometry for every coin on the track. */
export interface CoinVisuals {
  readonly bodyGeometry: THREE.BufferGeometry
  readonly rimGeometry: THREE.BufferGeometry
  readonly bodyMaterial: THREE.Material
  readonly rimMaterial: THREE.Material
}

const INITIAL_CAPACITY = 256

/**
 * Draws every coin with two instanced draw calls (body and rim) instead of two
 * draw calls per coin. A stretch of track holds ~150 coins, which used to be
 * ~450 draws a frame with their shadows, the single largest cost on phones.
 *
 * Coins keep their pooled `root` group for position, spin and the collection
 * pop; the group itself has no meshes. Each frame `sync()` copies the visible
 * roots' transforms into the instance buffers.
 */
export class CoinInstancer {
  private readonly scene: THREE.Scene
  private readonly visuals: CoinVisuals
  private body: THREE.InstancedMesh
  private rim: THREE.InstancedMesh
  private capacity: number

  constructor(scene: THREE.Scene, visuals: CoinVisuals, capacity = INITIAL_CAPACITY) {
    this.scene = scene
    this.visuals = visuals
    this.capacity = capacity
    this.body = this.createMesh(visuals.bodyGeometry, visuals.bodyMaterial, 'CoinBodies')
    this.rim = this.createMesh(visuals.rimGeometry, visuals.rimMaterial, 'CoinRims')
  }

  /** Copies the transforms of every visible coin into the instance buffers. */
  sync(groups: Iterable<readonly Collectible[]>): void {
    let count = 0
    for (const collectibles of groups) {
      for (const coin of collectibles) {
        if (
          coin.kind !== 'coin' ||
          coin.state === 'idle' ||
          !coin.root.visible ||
          !coin.root.parent
        ) {
          continue
        }
        if (count >= this.capacity) {
          this.grow(count)
        }
        const root = coin.root
        root.updateMatrix()
        if (root.parent === this.scene) {
          this.body.setMatrixAt(count, root.matrix)
          this.rim.setMatrixAt(count, root.matrix)
        } else {
          root.updateWorldMatrix(true, false)
          this.body.setMatrixAt(count, root.matrixWorld)
          this.rim.setMatrixAt(count, root.matrixWorld)
        }
        count += 1
      }
    }
    this.body.count = count
    this.rim.count = count
    if (count > 0) {
      this.body.instanceMatrix.needsUpdate = true
      this.rim.instanceMatrix.needsUpdate = true
    }
  }

  get drawnCount(): number {
    return this.body.count
  }

  dispose(): void {
    this.body.removeFromParent()
    this.rim.removeFromParent()
    this.body.dispose()
    this.rim.dispose()
  }

  private createMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    name: string,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, this.capacity)
    mesh.name = name
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.count = 0
    // Coins are spread along the whole visible track; per-instance bounds
    // would cost more than drawing the few off-screen ones.
    mesh.frustumCulled = false
    // Small and spinning: their shadows were barely visible but doubled the cost.
    mesh.castShadow = false
    mesh.receiveShadow = false
    this.scene.add(mesh)
    return mesh
  }

  /** More coins than buffer slots: double the buffers (rare, never per frame in practice). */
  private grow(filled: number): void {
    const old = [this.body, this.rim]
    this.capacity *= 2
    this.body = this.createMesh(this.visuals.bodyGeometry, this.visuals.bodyMaterial, 'CoinBodies')
    this.rim = this.createMesh(this.visuals.rimGeometry, this.visuals.rimMaterial, 'CoinRims')
    const matrix = new THREE.Matrix4()
    for (let index = 0; index < filled; index += 1) {
      old[0].getMatrixAt(index, matrix)
      this.body.setMatrixAt(index, matrix)
      this.rim.setMatrixAt(index, matrix)
    }
    for (const mesh of old) {
      mesh.removeFromParent()
      mesh.dispose()
    }
  }
}
