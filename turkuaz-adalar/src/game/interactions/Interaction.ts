import type { Group, Object3D } from 'three'
import type { Collider, RigidBody } from '@dimforge/rapier3d-compat'
import type { MovementEffectKind } from '../player/MovementEffects.ts'

export type InteractionKind = 'bounce' | 'speed' | 'platform' | 'checkpoint'

export interface InteractionBase {
  readonly id: number
  readonly kind: InteractionKind
  readonly segmentId: number
  readonly root: Group
  readonly spin: Object3D | null
  readonly x: number
  readonly z: number
  readonly radius: number
}

export interface BouncePad extends InteractionBase {
  readonly kind: 'bounce'
  readonly body: RigidBody
  readonly collider: Collider
  readonly height: number
  /** World-space top of the pad; used by the proximity trigger. */
  readonly topY: number
}

export interface SpeedPad extends InteractionBase {
  readonly kind: 'speed'
  readonly body: RigidBody
  readonly collider: Collider
  readonly effect: MovementEffectKind
  readonly topY: number
}

export interface MovingPlatform extends InteractionBase {
  readonly kind: 'platform'
  readonly body: RigidBody
  readonly collider: Collider
  readonly baseCenterY: number
  readonly amplitude: number
  readonly speed: number
  readonly phase: number
  readonly velocity: { x: number; y: number; z: number }
  centerY: number
}

export interface Checkpoint extends InteractionBase {
  readonly kind: 'checkpoint'
  /** Distance from the start line where the marker sits (metres). */
  readonly distance: number
  /** Safe capsule-centre spawn height at the marker. */
  readonly y: number
}

export type Interaction = BouncePad | SpeedPad | MovingPlatform | Checkpoint
