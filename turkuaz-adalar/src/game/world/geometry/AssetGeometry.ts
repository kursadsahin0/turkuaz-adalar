import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export interface GeometryPart {
  geometry: THREE.BufferGeometry
  color?: THREE.ColorRepresentation
  position?: THREE.Vector3
  rotation?: THREE.Euler
  scale?: THREE.Vector3
}

const scratchColor = new THREE.Color()

function preparePart(part: GeometryPart, vertexColors: boolean): THREE.BufferGeometry {
  const source = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone()

  const matrix = new THREE.Matrix4().compose(
    part.position ?? new THREE.Vector3(),
    new THREE.Quaternion().setFromEuler(part.rotation ?? new THREE.Euler()),
    part.scale ?? new THREE.Vector3(1, 1, 1),
  )
  source.applyMatrix4(matrix)

  if (vertexColors) {
    scratchColor.set(part.color ?? 0xffffff)
    const count = source.attributes.position?.count ?? 0
    const colors = new Float32Array(count * 3)
    for (let index = 0; index < count; index += 1) {
      colors[index * 3] = scratchColor.r
      colors[index * 3 + 1] = scratchColor.g
      colors[index * 3 + 2] = scratchColor.b
    }
    source.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  } else {
    source.deleteAttribute('color')
  }

  source.clearGroups()
  return source
}

/**
 * Merges loose procedural parts into one geometry. When `vertexColors` is true,
 * each part receives its own baked colour, so a whole decorated platform or
 * gear can be rendered with a single draw call.
 */
export function buildGeometry(
  parts: readonly GeometryPart[],
  vertexColors: boolean,
): THREE.BufferGeometry {
  if (parts.length === 0) {
    throw new Error('Cannot build geometry from zero parts.')
  }

  const prepared = parts.map((part) => preparePart(part, vertexColors))
  const merged = mergeGeometries(prepared, false)

  for (const geometry of prepared) {
    geometry.dispose()
  }
  for (const part of parts) {
    part.geometry.dispose()
  }

  if (!merged) {
    throw new Error('Procedural geometry could not be merged.')
  }

  merged.computeBoundingSphere()
  merged.computeBoundingBox()
  return merged
}
