import * as THREE from 'three'

/**
 * Instanced mesh manager for repeated objects like crates, crystals, and collectibles.
 * Reduces draw calls by rendering many copies of the same geometry in a single draw call.
 */
export class InstancedObjects {
  private readonly scene: THREE.Scene
  private readonly instances = new Map<string, THREE.InstancedMesh>()
  private readonly dummy = new THREE.Object3D()
  private disposed = false

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /**
   * Create an instanced mesh for a geometry type.
   */
  createInstancedMesh(
    id: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    maxCount: number,
  ): THREE.InstancedMesh {
    if (this.disposed) {
      throw new Error('InstancedObjects has been disposed')
    }

    const instancedMesh = new THREE.InstancedMesh(geometry, material, maxCount)
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    instancedMesh.castShadow = true
    instancedMesh.receiveShadow = true
    instancedMesh.count = 0

    this.scene.add(instancedMesh)
    this.instances.set(id, instancedMesh)

    return instancedMesh
  }

  /**
   * Add an instance at a specific position.
   */
  addInstance(id: string, position: THREE.Vector3, rotation: THREE.Euler, scale: THREE.Vector3): void {
    const instancedMesh = this.instances.get(id)
    if (!instancedMesh) {
      return
    }

    const index = instancedMesh.count
    if (index >= instancedMesh.instanceMatrix.count) {
      return
    }

    this.dummy.position.copy(position)
    this.dummy.rotation.copy(rotation)
    this.dummy.scale.copy(scale)
    this.dummy.updateMatrix()

    instancedMesh.setMatrixAt(index, this.dummy.matrix)
    instancedMesh.count = index + 1
    instancedMesh.instanceMatrix.needsUpdate = true
  }

  /**
   * Update an existing instance.
   */
  updateInstance(id: string, index: number, position: THREE.Vector3, rotation: THREE.Euler, scale: THREE.Vector3): void {
    const instancedMesh = this.instances.get(id)
    if (!instancedMesh || index >= instancedMesh.count) {
      return
    }

    this.dummy.position.copy(position)
    this.dummy.rotation.copy(rotation)
    this.dummy.scale.copy(scale)
    this.dummy.updateMatrix()

    instancedMesh.setMatrixAt(index, this.dummy.matrix)
    instancedMesh.instanceMatrix.needsUpdate = true
  }

  /**
   * Remove all instances and reset count.
   */
  clearInstances(id: string): void {
    const instancedMesh = this.instances.get(id)
    if (!instancedMesh) {
      return
    }

    instancedMesh.count = 0
    instancedMesh.instanceMatrix.needsUpdate = true
  }

  /**
   * Get an instanced mesh by ID.
   */
  getInstancedMesh(id: string): THREE.InstancedMesh | undefined {
    return this.instances.get(id)
  }

  /**
   * Dispose all instanced meshes.
   */
  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true

    for (const instancedMesh of this.instances.values()) {
      this.scene.remove(instancedMesh)
      instancedMesh.geometry.dispose()
      if (Array.isArray(instancedMesh.material)) {
        instancedMesh.material.forEach(m => m.dispose())
      } else {
        instancedMesh.material.dispose()
      }
    }

    this.instances.clear()
  }
}
