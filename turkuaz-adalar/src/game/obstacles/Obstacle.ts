import type { Group } from 'three'
import type { Collider, RigidBody } from '@dimforge/rapier3d-compat'
import type { Vector3Like } from '../../systems/physics/PhysicsWorld.ts'

/**
 * The ten modular obstacle families. Each family has its own prefab module;
 * the manager schedules them by difficulty and pools their runtime instances.
 */
export type ObstacleKind =
  | 'static-barrier'
  | 'rotating-bar'
  | 'moving-block'
  | 'sliding-obstacle'
  | 'disappearing-platform'
  | 'timed-gate'
  | 'moving-platform'
  | 'falling-object'
  | 'bounce-trap'
  | 'lane-blocker'

/**
 * What a character-controller contact with an obstacle means. This is the only
 * contract gameplay needs: hazards end the run, bounce traps launch the runner,
 * and safe contacts are standable/platform-like.
 */
export type ObstacleContact =
  | { readonly kind: 'hazard' }
  | { readonly kind: 'bounce'; readonly height: number }
  | { readonly kind: 'safe' }

/** Runtime instance shared by every obstacle module. */
export interface Obstacle {
  readonly id: number
  readonly kind: ObstacleKind
  readonly prefabId: string
  readonly segmentId: number
  readonly root: Group
  readonly body: RigidBody
  readonly collider: Collider
  readonly x: number
  readonly z: number
  readonly radius: number
  readonly active: boolean
  readonly standable: boolean

  spawn(
    segmentId: number,
    x: number,
    z: number,
    rng: import('../../utils/random.ts').Rng,
    difficulty: number,
  ): void
  fixedUpdate(delta: number): void
  contact(): ObstacleContact
  /** Non-null only for standable moving platforms. */
  platformVelocity(): Vector3Like | null
  release(): void
  dispose(): void
}
