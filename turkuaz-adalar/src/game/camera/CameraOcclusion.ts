import * as THREE from 'three'
import { CAMERA_CONFIG } from '../../config/CameraConfig.ts'

export interface CameraOcclusionOptions {
  readonly clearance: number
  readonly minimumDistance: number
  readonly boxPadding: number
}

export type CameraOccluderSource = () => readonly THREE.Box3[]

/**
 * Shortens the camera boom when a solid volume sits between the character and
 * the desired camera position. Track sections expose box proxies instead of
 * meshes, so the test costs a handful of ray/box checks per frame and never
 * touches render geometry.
 */
export class CameraOcclusion {
  private readonly options: CameraOcclusionOptions
  private readonly ray = new THREE.Ray()
  private readonly direction = new THREE.Vector3()
  private readonly intersection = new THREE.Vector3()
  private readonly expanded = new THREE.Box3()

  private source: CameraOccluderSource | null = null

  constructor(options: CameraOcclusionOptions = CAMERA_CONFIG.occlusion) {
    this.options = options
  }

  setSource(source: CameraOccluderSource | null): void {
    this.source = source
  }

  /**
   * Writes the safe camera position into `out`, which may alias `desired`.
   * Returns true when the boom had to be shortened.
   */
  resolve(origin: THREE.Vector3, desired: THREE.Vector3, out: THREE.Vector3): boolean {
    out.copy(desired)
    const boxes = this.source?.()
    if (!boxes || boxes.length === 0) {
      return false
    }

    this.direction.subVectors(desired, origin)
    const boomLength = this.direction.length()
    if (boomLength <= 1e-4) {
      return false
    }
    this.direction.divideScalar(boomLength)
    this.ray.set(origin, this.direction)

    let nearest = boomLength
    for (const box of boxes) {
      this.expanded.copy(box).expandByScalar(this.options.boxPadding)
      this.intersection.set(0, 0, 0)
      const hit = this.ray.intersectBox(this.expanded, this.intersection)
      if (!hit) {
        continue
      }
      const travel = origin.distanceTo(hit)
      if (travel > 0 && travel < nearest) {
        nearest = travel
      }
    }

    if (nearest >= boomLength) {
      return false
    }

    const safeDistance = Math.max(this.options.minimumDistance, nearest - this.options.clearance)
    out.copy(origin).addScaledVector(this.direction, safeDistance)
    return true
  }
}
