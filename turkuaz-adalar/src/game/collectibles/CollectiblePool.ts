import type { Collectible } from './Collectible.ts'
import type { CollectibleKind } from './CollectibleKind.ts'
import { COLLECTIBLE_DEFINITIONS } from './CollectibleKind.ts'
import type { CollectiblePrefabs } from './CollectiblePrefabs.ts'

/**
 * Fixed-size pickup pool for one prefab. Instances are created on demand up to
 * the prewarm count, then recycled. Geometry and materials stay owned by the
 * prefab factory, so dropping a surplus instance never frees GPU resources that
 * other instances still use.
 */
export class CollectiblePool {
  readonly kind: CollectibleKind

  private readonly free: Collectible[] = []
  private readonly prewarm: number
  private readonly maxIdle: number
  private readonly prefabs: CollectiblePrefabs
  private created = 0

  constructor(
    kind: CollectibleKind,
    prefabs: CollectiblePrefabs,
    prewarm: number,
    maxIdle: number,
  ) {
    this.kind = kind
    this.prefabs = prefabs
    this.prewarm = Math.max(0, Math.floor(prewarm))
    this.maxIdle = Math.max(1, Math.floor(maxIdle))

    for (let index = 0; index < this.prewarm; index += 1) {
      this.free.push(this.create())
    }
  }

  /** Total instances built for this prefab, including live ones. */
  get createdCount(): number {
    return this.created
  }

  get idleCount(): number {
    return this.free.length
  }

  acquire(): Collectible {
    const instance = this.free.pop() ?? this.create()
    instance.state = 'active'
    instance.collected = false
    instance.attracted = false
    instance.root.visible = true
    instance.root.scale.setScalar(1)
    return instance
  }

  release(instance: Collectible): void {
    instance.state = 'idle'
    instance.segmentId = -1
    instance.root.removeFromParent()
    instance.root.position.set(0, 0, 0)
    instance.root.rotation.set(0, 0, 0)
    instance.root.scale.setScalar(1)

    if (this.free.length >= this.maxIdle) {
      // Surplus instances are dropped; their prefab meshes share geometry and
      // materials with the rest of the pool, so nothing is leaked.
      this.created -= 1
      return
    }
    this.free.push(instance)
  }

  dispose(): void {
    for (const instance of this.free) {
      instance.root.removeFromParent()
    }
    this.free.length = 0
  }

  private create(): Collectible {
    const definition = COLLECTIBLE_DEFINITIONS[this.kind]
    const prefab = this.prefabs.create(this.kind)
    this.created += 1

    return {
      id: 0,
      kind: this.kind,
      definition,
      root: prefab.root,
      halo: prefab.halo,
      segmentId: -1,
      state: 'idle',
      collected: false,
      attracted: false,
      baseX: 0,
      baseY: 0,
      baseZ: 0,
      phase: 0,
      collectElapsed: 0,
      collectStartY: 0,
      grantedPowerUp: null,
    }
  }
}
