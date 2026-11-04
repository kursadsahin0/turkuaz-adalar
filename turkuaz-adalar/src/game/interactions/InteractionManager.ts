import * as THREE from 'three'
import { GAME_CONFIG } from '../../config/GameConfig.ts'
import type { PhysicsWorld, Vector3Like } from '../../systems/physics/PhysicsWorld.ts'
import type { Rng } from '../../utils/random.ts'
import type {
  BouncePad,
  Checkpoint,
  Interaction,
  InteractionKind,
  MovingPlatform,
  SpeedPad,
} from './Interaction.ts'
import { InteractionAssets } from './InteractionAssets.ts'

export interface PadTrigger {
  bounce: BouncePad | null
  speed: SpeedPad | null
}

/**
 * Owns the streamed, non-fatal track interactions: bounce pads, speed pads,
 * moving platforms and checkpoints.
 *
 * Spawns are deterministic per segment seed. Pads and platforms get real
 * colliders so the character controller can stand on platforms and report
 * contacts, while checkpoints stay visual/trigger-only. Gameplay never touches
 * Rapier directly; it asks this manager by collider handle or by proximity.
 */
export class InteractionManager {
  readonly assets = new InteractionAssets()

  private readonly scene: THREE.Scene
  private readonly physics: PhysicsWorld
  private readonly bySegment = new Map<number, Interaction[]>()
  private readonly bounceByCollider = new Map<number, BouncePad>()
  private readonly speedByCollider = new Map<number, SpeedPad>()
  private readonly platformByCollider = new Map<number, MovingPlatform>()
  private readonly cooldowns = new Map<number, number>()
  private nextId = 1
  private elapsed = 0

  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    this.scene = scene
    this.physics = physics
  }

  populateSegment(
    segmentId: number,
    centerZ: number,
    rng: Rng,
    difficulty: number,
    isBlocked: (x: number, z: number, radius: number) => boolean,
  ): void {
    this.clearSegment(segmentId)

    // Register the (still empty) list first so `isBlocked` also protects the
    // objects spawned later in this same segment.
    const interactions: Interaction[] = []
    this.bySegment.set(segmentId, interactions)

    const track = GAME_CONFIG.track
    const distance = Math.max(0, -centerZ)
    const checkpointConfig = GAME_CONFIG.interactions.checkpoint
    const segmentSlot = Math.round(distance / track.segmentLength)

    if (
      distance >= checkpointConfig.minDistance &&
      segmentSlot % checkpointConfig.everySegments === 0
    ) {
      const spot = this.findSpot(centerZ, rng, isBlocked, 0.55)
      if (spot) {
        this.spawnCheckpoint(segmentId, spot.x, spot.z)
      }
    }

    const config = GAME_CONFIG.interactions
    const scale = 0.75 + difficulty * 0.5
    const bounceChance = config.bouncePad.chance * scale
    const speedChance = config.speedPad.chance * scale
    const platformChance = config.movingPlatform.chance * scale
    const roll = rng.next()

    let kind: InteractionKind | null = null
    if (roll < bounceChance) {
      kind = 'bounce'
    } else if (roll < bounceChance + speedChance) {
      kind = 'speed'
    } else if (roll < bounceChance + speedChance + platformChance) {
      kind = 'platform'
    }

    if (kind === null) {
      return
    }

    const radius =
      kind === 'bounce'
        ? config.bouncePad.radius
        : kind === 'speed'
          ? config.speedPad.radius
          : Math.max(config.movingPlatform.width, config.movingPlatform.depth) / 2 + 0.2
    const spot = this.findSpot(centerZ, rng, isBlocked, radius)
    if (!spot) {
      return
    }

    if (kind === 'bounce') {
      this.spawnBounce(segmentId, spot.x, spot.z)
    } else if (kind === 'speed') {
      this.spawnSpeed(segmentId, spot.x, spot.z)
    } else {
      this.spawnPlatform(segmentId, spot.x, spot.z, rng)
    }
  }

  clearSegment(segmentId: number): void {
    const interactions = this.bySegment.get(segmentId)
    if (!interactions) {
      return
    }

    for (const interaction of interactions) {
      interaction.root.removeFromParent()
      this.cooldowns.delete(interaction.id)
      if (interaction.kind === 'bounce') {
        this.bounceByCollider.delete(interaction.collider.handle)
        this.physics.removeBody(interaction.body)
      } else if (interaction.kind === 'speed') {
        this.speedByCollider.delete(interaction.collider.handle)
        this.physics.removeBody(interaction.body)
      } else if (interaction.kind === 'platform') {
        this.platformByCollider.delete(interaction.collider.handle)
        this.physics.removeBody(interaction.body)
      }
    }

    this.bySegment.delete(segmentId)
  }

  clearAll(): void {
    for (const segmentId of [...this.bySegment.keys()]) {
      this.clearSegment(segmentId)
    }
    this.cooldowns.clear()
  }

  /** Advances platform motion and the short pad cooldowns on the fixed step. */
  fixedUpdate(delta: number): void {
    if (delta <= 0) {
      return
    }

    this.elapsed += delta
    for (const [id, remaining] of this.cooldowns) {
      const next = remaining - delta
      if (next <= 0) {
        this.cooldowns.delete(id)
      } else {
        this.cooldowns.set(id, next)
      }
    }

    for (const platform of this.platformByCollider.values()) {
      const halfAmplitude = platform.amplitude * 0.5
      const nextCenterY =
        platform.baseCenterY +
        Math.sin(platform.phase + this.elapsed * platform.speed) * halfAmplitude
      platform.velocity.y = (nextCenterY - platform.centerY) / delta
      platform.velocity.x = 0
      platform.velocity.z = 0
      platform.centerY = nextCenterY

      platform.root.position.y = nextCenterY
      platform.body.setNextKinematicTranslation({
        x: platform.x,
        y: nextCenterY,
        z: platform.z,
      })
    }
  }

  updateVisuals(elapsed: number): void {
    this.assets.update(elapsed)

    for (const interactions of this.bySegment.values()) {
      for (const interaction of interactions) {
        if (!interaction.spin) {
          continue
        }
        if (interaction.kind === 'checkpoint') {
          interaction.spin.rotation.y = elapsed * 1.25 + interaction.id
        } else {
          interaction.spin.rotation.z = elapsed * 2.2 + interaction.id
        }
      }
    }
  }

  findBounce(colliderHandle: number): BouncePad | undefined {
    return this.bounceByCollider.get(colliderHandle)
  }

  findSpeed(colliderHandle: number): SpeedPad | undefined {
    return this.speedByCollider.get(colliderHandle)
  }

  /** Arms a pad by collider handle; returns `null` while it is cooling down. */
  consumeBounce(colliderHandle: number): BouncePad | null {
    const pad = this.bounceByCollider.get(colliderHandle)
    if (!pad || !this.arm(pad.id)) {
      return null
    }
    return pad
  }

  consumeSpeed(colliderHandle: number): SpeedPad | null {
    const pad = this.speedByCollider.get(colliderHandle)
    if (!pad || !this.arm(pad.id)) {
      return null
    }
    return pad
  }

  /**
   * Proximity fallback for pads. A thin pad is often stepped over without a
   * character-controller collision, so gameplay also checks a small volume
   * above the pad top each fixed step.
   */
  triggerPads(position: Vector3Like, playerRadius: number): PadTrigger {
    const result: PadTrigger = { bounce: null, speed: null }
    const triggerHeight = GAME_CONFIG.interactions.padTriggerHeight

    for (const interactions of this.bySegment.values()) {
      for (const interaction of interactions) {
        if (interaction.kind !== 'bounce' && interaction.kind !== 'speed') {
          continue
        }
        if (position.y - interaction.topY > triggerHeight) {
          continue
        }

        const deltaX = interaction.x - position.x
        const deltaZ = interaction.z - position.z
        const range = interaction.radius + playerRadius
        if (deltaX * deltaX + deltaZ * deltaZ > range * range) {
          continue
        }

        if (interaction.kind === 'bounce' && result.bounce === null) {
          if (this.arm(interaction.id)) {
            result.bounce = interaction
          }
        } else if (interaction.kind === 'speed' && result.speed === null) {
          if (this.arm(interaction.id)) {
            result.speed = interaction
          }
        }
      }
    }

    return result
  }

  platformVelocity(colliderHandle: number): { x: number; y: number; z: number } | null {
    const platform = this.platformByCollider.get(colliderHandle)
    return platform ? platform.velocity : null
  }

  /** Newest checkpoint the runner has already passed, or `null`. */
  latestCheckpoint(distanceTravelled: number): Checkpoint | null {
    let latest: Checkpoint | null = null

    for (const interactions of this.bySegment.values()) {
      for (const interaction of interactions) {
        if (interaction.kind !== 'checkpoint') {
          continue
        }
        if (interaction.distance > distanceTravelled + 1e-6) {
          continue
        }
        if (!latest || interaction.distance > latest.distance) {
          latest = interaction
        }
      }
    }

    return latest
  }

  isBlocked(x: number, z: number, radius: number): boolean {
    for (const interactions of this.bySegment.values()) {
      for (const interaction of interactions) {
        const deltaX = interaction.x - x
        const deltaZ = interaction.z - z
        const minimum = interaction.radius + radius + 0.35
        if (deltaX * deltaX + deltaZ * deltaZ < minimum * minimum) {
          return true
        }
      }
    }
    return false
  }

  interactionsIn(segmentId: number): readonly Interaction[] {
    return this.bySegment.get(segmentId) ?? []
  }

  // -------------------------------------------------------------- spawning
  // Explicit spawn helpers are public so validation can place one interaction
  // without relying on the streamer's random rolls.

  spawnBounce(segmentId: number, x: number, z: number): BouncePad {
    const config = GAME_CONFIG.interactions.bouncePad
    const visual = this.assets.createBounce()
    const topY = GAME_CONFIG.track.topY + config.thickness
    visual.group.position.set(x, GAME_CONFIG.track.topY + config.thickness / 2, z)
    visual.group.name = `BouncePad-${this.nextId}`
    this.scene.add(visual.group)

    const body = this.physics.addStaticBox(
      { x, y: GAME_CONFIG.track.topY + config.thickness / 2, z },
      { x: config.radius, y: config.thickness / 2, z: config.radius },
    )

    const pad: BouncePad = {
      id: this.nextId,
      kind: 'bounce',
      segmentId,
      root: visual.group,
      spin: visual.spin,
      body: body.body,
      collider: body.collider,
      x,
      z,
      radius: config.radius,
      height: config.height,
      topY,
    }
    this.nextId += 1
    this.bounceByCollider.set(body.collider.handle, pad)
    this.register(pad)
    return pad
  }

  spawnSpeed(segmentId: number, x: number, z: number): SpeedPad {
    const config = GAME_CONFIG.interactions.speedPad
    const visual = this.assets.createSpeed()
    const topY = GAME_CONFIG.track.topY + config.thickness
    visual.group.position.set(x, GAME_CONFIG.track.topY + config.thickness / 2, z)
    visual.group.name = `SpeedPad-${this.nextId}`
    this.scene.add(visual.group)

    const body = this.physics.addStaticBox(
      { x, y: GAME_CONFIG.track.topY + config.thickness / 2, z },
      { x: config.radius, y: config.thickness / 2, z: config.radius },
    )

    const pad: SpeedPad = {
      id: this.nextId,
      kind: 'speed',
      segmentId,
      root: visual.group,
      spin: visual.spin,
      body: body.body,
      collider: body.collider,
      x,
      z,
      radius: config.radius,
      effect: config.effect,
      topY,
    }
    this.nextId += 1
    this.speedByCollider.set(body.collider.handle, pad)
    this.register(pad)
    return pad
  }

  spawnPlatform(segmentId: number, x: number, z: number, rng: Rng): MovingPlatform {
    const config = GAME_CONFIG.interactions.movingPlatform
    const halfAmplitude = config.amplitude * 0.5
    const phase = rng.range(0, Math.PI * 2)
    const speed = (Math.PI * 2) / config.period
    const baseCenterY =
      GAME_CONFIG.track.topY + config.baseLift + halfAmplitude - config.thickness / 2
    const centerY = baseCenterY + Math.sin(phase + this.elapsed * speed) * halfAmplitude

    const root = this.assets.createPlatform()
    root.position.set(x, centerY, z)
    root.name = `MovingPlatform-${this.nextId}`
    this.scene.add(root)

    const body = this.physics.addKinematicBox(
      { x, y: centerY, z },
      { x: config.width / 2, y: config.thickness / 2, z: config.depth / 2 },
    )

    const platform: MovingPlatform = {
      id: this.nextId,
      kind: 'platform',
      segmentId,
      root,
      spin: null,
      body: body.body,
      collider: body.collider,
      x,
      z,
      radius: Math.max(config.width, config.depth) / 2 + 0.2,
      baseCenterY,
      amplitude: config.amplitude,
      speed,
      phase,
      velocity: { x: 0, y: 0, z: 0 },
      centerY,
    }
    this.nextId += 1
    this.platformByCollider.set(body.collider.handle, platform)
    this.register(platform)
    return platform
  }

  spawnCheckpoint(segmentId: number, x: number, z: number): Checkpoint {
    const visual = this.assets.createCheckpoint()
    visual.group.position.set(x, GAME_CONFIG.track.topY, z)
    visual.group.name = `Checkpoint-${this.nextId}`
    this.scene.add(visual.group)

    const player = GAME_CONFIG.player
    const checkpoint: Checkpoint = {
      id: this.nextId,
      kind: 'checkpoint',
      segmentId,
      root: visual.group,
      spin: visual.spin,
      x,
      z,
      radius: 0.5,
      distance: Math.max(0, -z),
      y: GAME_CONFIG.track.topY + player.halfHeight + player.radius + 0.03,
    }
    this.nextId += 1
    this.register(checkpoint)
    return checkpoint
  }

  dispose(): void {
    this.clearAll()
    this.assets.dispose()
  }

  private register(interaction: Interaction): void {
    const list = this.bySegment.get(interaction.segmentId)
    if (list) {
      list.push(interaction)
    } else {
      this.bySegment.set(interaction.segmentId, [interaction])
    }
  }

  private arm(id: number): boolean {
    if ((this.cooldowns.get(id) ?? 0) > 0) {
      return false
    }
    this.cooldowns.set(id, GAME_CONFIG.interactions.padCooldown)
    return true
  }

  private findSpot(
    centerZ: number,
    rng: Rng,
    isBlocked: (x: number, z: number, radius: number) => boolean,
    radius: number,
  ): { x: number; z: number } | null {
    const track = GAME_CONFIG.track
    const halfLength = track.segmentLength / 2
    const margin = 6

    for (let attempt = 0; attempt < 18; attempt += 1) {
      const x = rng.pick(track.lanePositions) + rng.range(-0.12, 0.12)
      const z = centerZ + rng.range(-halfLength + margin, halfLength - margin)
      if (isBlocked(x, z, radius) || this.isBlocked(x, z, radius)) {
        continue
      }
      return { x, z }
    }

    return null
  }
}
