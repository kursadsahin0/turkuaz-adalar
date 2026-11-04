import * as THREE from 'three'

function disposeMaterial(material: THREE.Material): void {
  const values = Object.values(material as unknown as Record<string, unknown>)
  for (const value of values) {
    if (value instanceof THREE.Texture) {
      value.dispose()
    }
  }
  material.dispose()
}

/**
 * Releases geometries, materials and textures beneath an object graph.
 * Calling dispose twice is harmless in Three.js, which keeps cleanup safe even
 * when systems also dispose their own assets.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      object.geometry.dispose()
      if (Array.isArray(object.material)) {
        for (const material of object.material) {
          disposeMaterial(material)
        }
      } else {
        disposeMaterial(object.material)
      }
    }
  })
}
