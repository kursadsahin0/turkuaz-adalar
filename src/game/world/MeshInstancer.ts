import * as THREE from 'three'

/**
 * Layer the source meshes move to once they are drawn through an instanced
 * mesh: neither the camera nor the shadow pass renders it, but the objects
 * keep their place in the scene graph (transforms, sway, visibility flags).
 */
const SOURCE_LAYER = 31

interface Batch {
  readonly mesh: THREE.InstancedMesh
  readonly sources: THREE.Mesh[]
}

/**
 * Turns repeated scenery (trees, bushes, rocks, track trims) into instanced
 * draws. Meshes under the given roots that share a geometry and an opaque
 * built-in material become one `InstancedMesh`; every frame `sync()` copies
 * the sources' world matrices, skipping hidden ones. A run shows the same few
 * prop models on seven recycled segments and the floating islands, so this
 * removes most of the per-object draw calls that dominate CPU time on phones.
 *
 * Instanced batches skip frustum culling: drawing a few props behind the
 * camera costs far less than one draw call each.
 */
export class MeshInstancer {
  private readonly scene: THREE.Scene
  private readonly batches: Batch[] = []
  private readonly ancestorCache = new Map<THREE.Object3D, boolean>()

  constructor(
    scene: THREE.Scene,
    roots: readonly THREE.Object3D[],
    exclude: (object: THREE.Object3D) => boolean,
  ) {
    this.scene = scene

    const groups = new Map<string, THREE.Mesh[]>()
    for (const root of roots) {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !this.canInstance(object, exclude)) {
          return
        }
        const material = object.material as THREE.Material
        const key = `${object.geometry.uuid}|${material.uuid}`
        const group = groups.get(key)
        if (group) {
          group.push(object)
        } else {
          groups.set(key, [object])
        }
      })
    }

    for (const sources of groups.values()) {
      // A model used once gains nothing and would lose its frustum culling.
      if (sources.length < 2) {
        continue
      }
      const first = sources[0]
      const mesh = new THREE.InstancedMesh(
        first.geometry,
        first.material as THREE.Material,
        sources.length,
      )
      mesh.name = `Instanced:${first.name || first.parent?.name || 'prop'}`
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.frustumCulled = false
      mesh.castShadow = sources.some((source) => source.castShadow)
      mesh.receiveShadow = sources.some((source) => source.receiveShadow)
      mesh.count = 0
      for (const source of sources) {
        source.layers.set(SOURCE_LAYER)
      }
      scene.add(mesh)
      this.batches.push({ mesh, sources })
    }
  }

  /** Number of instanced draws replacing the individual meshes. */
  get batchCount(): number {
    return this.batches.length
  }

  get instancedMeshCount(): number {
    return this.batches.reduce((sum, batch) => sum + batch.sources.length, 0)
  }

  /**
   * Copies the visible sources' world matrices into the batches. Call after
   * the scene's matrices are up to date for this frame (the game updates them
   * once, right before rendering).
   */
  sync(): void {
    this.ancestorCache.clear()
    for (const batch of this.batches) {
      let count = 0
      for (const source of batch.sources) {
        if (!this.isShown(source)) {
          continue
        }
        batch.mesh.setMatrixAt(count, source.matrixWorld)
        count += 1
      }
      batch.mesh.count = count
      batch.mesh.instanceMatrix.needsUpdate = true
    }
  }

  dispose(): void {
    for (const batch of this.batches) {
      batch.mesh.removeFromParent()
      batch.mesh.dispose()
      for (const source of batch.sources) {
        source.layers.set(0)
      }
    }
    this.batches.length = 0
  }

  private canInstance(mesh: THREE.Mesh, exclude: (object: THREE.Object3D) => boolean): boolean {
    if (
      mesh instanceof THREE.InstancedMesh ||
      mesh instanceof THREE.SkinnedMesh ||
      Array.isArray(mesh.material) ||
      mesh.morphTargetInfluences
    ) {
      return false
    }
    const material = mesh.material
    const builtIn =
      material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshLambertMaterial ||
      material instanceof THREE.MeshPhongMaterial ||
      material instanceof THREE.MeshBasicMaterial ||
      material instanceof THREE.MeshToonMaterial
    // Transparent batches would lose per-object depth sorting.
    if (!builtIn || material.transparent) {
      return false
    }
    for (let node: THREE.Object3D | null = mesh; node; node = node.parent) {
      if (exclude(node)) {
        return false
      }
    }
    return true
  }

  /** Visible itself and through every ancestor, and still in the scene. */
  private isShown(object: THREE.Object3D): boolean {
    let node: THREE.Object3D | null = object
    const path: THREE.Object3D[] = []
    while (node) {
      const cached = this.ancestorCache.get(node)
      if (cached !== undefined) {
        for (const visited of path) this.ancestorCache.set(visited, cached)
        return cached
      }
      if (!node.visible) {
        for (const visited of path) this.ancestorCache.set(visited, false)
        this.ancestorCache.set(node, false)
        return false
      }
      if (node === this.scene) {
        for (const visited of path) this.ancestorCache.set(visited, true)
        return true
      }
      path.push(node)
      node = node.parent
    }
    // Detached from the scene.
    for (const visited of path) this.ancestorCache.set(visited, false)
    return false
  }
}
