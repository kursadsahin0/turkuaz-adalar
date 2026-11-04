import type * as THREE from 'three'
import type { Collider, RigidBody } from '@dimforge/rapier3d-compat'
import type { PhysicsWorld, Vector3Like } from '../../systems/physics/PhysicsWorld.ts'
import type { Rng } from '../../utils/random.ts'
import type { Obstacle, ObstacleContact, ObstacleKind } from './Obstacle.ts'

/**
 * Shared lifecycle for pooled obstacles.
 *
 * The base class owns scene/pool bookkeeping and guarantees the same release
 * contract for every module: detach the visual, disable the existing Rapier
 * body and collider, and leave the physics world allocation untouched. Modules
 * only implement placement and their own deterministic motion/contact rules.
 */
export abstract class ObstacleBase implements Obstacle {
  abstract readonly kind: ObstacleKind
  abstract readonly prefabId: string
  abstract readonly standable: boolean

  readonly id: number
  readonly root: THREE.Group
  readonly body: RigidBody
  readonly collider: Collider

  protected readonly scene: THREE.Scene
  protected readonly physics: PhysicsWorld
  protected age = 0
  protected radiusValue = 0.8
  protected baseX = 0
  protected baseZ = 0

  private segmentValue = -1
  private xValue = 0
  private zValue = 0
  private activeValue = false

  constructor(
    id: number,
    scene: THREE.Scene,
    physics: PhysicsWorld,
    root: THREE.Group,
    body: RigidBody,
    collider: Collider,
  ) {
    this.id = id
    this.scene = scene
    this.physics = physics
    this.root = root
    this.body = body
    this.collider = collider
  }

  get segmentId(): number {
    return this.segmentValue
  }

  get x(): number {
    return this.xValue
  }

  get z(): number {
    return this.zValue
  }

  get radius(): number {
    return this.radiusValue
  }

  get active(): boolean {
    return this.activeValue
  }

  spawn(
    segmentId: number,
    x: number,
    z: number,
    rng: Rng,
    difficulty: number,
  ): void {
    this.segmentValue = segmentId
    this.xValue = x
    this.zValue = z
    this.baseX = x
    this.baseZ = z
    this.age = 0
    this.activeValue = true
    this.root.visible = true
    this.scene.add(this.root)
    this.body.setEnabled(true)
    this.collider.setEnabled(true)
    this.place(x, z, rng, difficulty)
  }

  release(): void {
    if (!this.activeValue) {
      return
    }
    this.activeValue = false
    this.segmentValue = -1
    this.root.removeFromParent()
    this.root.visible = false
    this.body.setEnabled(false)
    this.collider.setEnabled(false)
    this.onRelease()
  }

  dispose(): void {
    this.root.removeFromParent()
    this.physics.removeBody(this.body)
  }

  contact(): ObstacleContact {
    return { kind: 'hazard' }
  }

  platformVelocity(): Vector3Like | null {
    return null
  }

  abstract fixedUpdate(delta: number): void

  /** Position the visual and existing physics body for a fresh spawn. */
  protected abstract place(
    x: number,
    z: number,
    rng: Rng,
    difficulty: number,
  ): void

  protected onRelease(): void {
    // Modules can reset their local animation state here.
  }
}
