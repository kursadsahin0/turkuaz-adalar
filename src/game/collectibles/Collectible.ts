import type * as THREE from 'three'
import type { CollectibleDefinition, CollectibleKind, PowerUpKind } from './CollectibleKind.ts'

export type CollectibleState = 'idle' | 'active' | 'collecting'

/**
 * One pooled pickup. Instances are recycled between segments, so the object is
 * mutable and carries a stable prefab visual. `collected` is set the first time
 * the pickup is touched and never cleared while it is live, which is what
 * guarantees a single award per object.
 */
export interface Collectible {
  id: number
  readonly kind: CollectibleKind
  readonly definition: CollectibleDefinition
  readonly root: THREE.Group
  readonly halo: THREE.Mesh | null
  segmentId: number
  state: CollectibleState
  /** True once this instance has paid out; guards against double awards. */
  collected: boolean
  /** True while a magnet is pulling the pickup toward the runner. */
  attracted: boolean
  baseX: number
  baseY: number
  baseZ: number
  phase: number
  collectElapsed: number
  collectStartY: number
  /** Power-up bundled into a level reward cache. */
  grantedPowerUp: PowerUpKind | null
}
