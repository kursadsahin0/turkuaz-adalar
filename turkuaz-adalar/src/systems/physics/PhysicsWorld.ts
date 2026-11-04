import RAPIER from '@dimforge/rapier3d-compat'
import type {
  Collider,
  KinematicCharacterController,
  RigidBody,
  World as RapierWorld,
} from '@dimforge/rapier3d-compat'
import { GameError, toError } from '../../utils/errors.ts'
import { degToRad } from '../../utils/math.ts'

export interface StaticBodyHandle {
  body: RigidBody
  collider: Collider
}

export interface CharacterHandle {
  body: RigidBody
  collider: Collider
  controller: KinematicCharacterController
}

export interface Vector3Like {
  x: number
  y: number
  z: number
}

/**
 * Thin, explicit wrapper around Rapier. Gameplay systems never manipulate the
 * raw world directly, which keeps physics setup and teardown predictable.
 */
export class PhysicsWorld {
  readonly world: RapierWorld

  private disposed = false

  private constructor(world: RapierWorld) {
    this.world = world
  }

  static async create(): Promise<PhysicsWorld> {
    try {
      await RAPIER.init()
      const world = new RAPIER.World({ x: 0, y: -34, z: 0 })
      world.timestep = 1 / 60
      return new PhysicsWorld(world)
    } catch (error) {
      throw new GameError('The physics engine failed to initialise.', 'PHYSICS_INIT_FAILED', {
        cause: toError(error),
      })
    }
  }

  step(delta: number): void {
    if (this.disposed) {
      return
    }
    this.world.timestep = delta
    this.world.step()
  }

  addStaticBox(center: Vector3Like, halfExtents: Vector3Like, rotationY = 0): StaticBodyHandle {
    const bodyDescription = RAPIER.RigidBodyDesc.fixed().setTranslation(
      center.x,
      center.y,
      center.z,
    )

    if (rotationY !== 0) {
      bodyDescription.setRotation({
        x: 0,
        y: Math.sin(rotationY * 0.5),
        z: 0,
        w: Math.cos(rotationY * 0.5),
      })
    }

    const body = this.world.createRigidBody(bodyDescription)
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setFriction(0.9)
        .setRestitution(0),
      body,
    )

    return { body, collider }
  }

  /**
   * Kinematic box for moving platforms. The caller owns the next translation;
   * the body is position-based so it never reacts to the character.
   */
  addKinematicBox(center: Vector3Like, halfExtents: Vector3Like): StaticBodyHandle {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        center.x,
        center.y,
        center.z,
      ),
    )
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setFriction(0.9)
        .setRestitution(0),
      body,
    )

    return { body, collider }
  }

  /**
   * Upward clearance query used when a sliding capsule wants to stand back up.
   * The runner's own collider is excluded, so only ceilings/obstacles matter.
   */
  hasHeadroom(
    position: Vector3Like,
    currentTopY: number,
    desiredTopY: number,
    exclude: Collider | null = null,
  ): boolean {
    const maxToi = desiredTopY - currentTopY
    if (this.disposed || maxToi <= 0) {
      return true
    }

    const ray = new RAPIER.Ray(
      { x: position.x, y: currentTopY, z: position.z },
      { x: 0, y: 1, z: 0 },
    )
    const hit = this.world.castRay(
      ray,
      maxToi,
      true,
      undefined,
      undefined,
      exclude ?? undefined,
    )
    return hit === null
  }

  createCharacter(position: Vector3Like, radius: number, halfHeight: number): CharacterHandle {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        position.x,
        position.y,
        position.z,
      ),
    )

    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, radius)
        .setFriction(0.7)
        .setRestitution(0),
      body,
    )

    const controller = this.world.createCharacterController(0.04)
    controller.setUp({ x: 0, y: 1, z: 0 })
    controller.enableAutostep(0.35, 0.2, false)
    controller.enableSnapToGround(0.3)
    controller.setMaxSlopeClimbAngle(degToRad(50))
    controller.setMinSlopeSlideAngle(degToRad(32))
    controller.setApplyImpulsesToDynamicBodies(true)

    return { body, collider, controller }
  }

  removeBody(body: RigidBody): void {
    if (this.disposed || !body.isValid()) {
      return
    }
    this.world.removeRigidBody(body)
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.world.free()
  }
}
