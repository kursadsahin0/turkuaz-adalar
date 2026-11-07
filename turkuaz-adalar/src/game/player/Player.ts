import * as THREE from 'three'
import type { Collider } from '@dimforge/rapier3d-compat'
import { GAME_CONFIG } from '../../config/GameConfig.ts'
import { PALETTE } from '../../config/Palette.ts'
import type { CharacterHandle, PhysicsWorld } from '../../systems/physics/PhysicsWorld.ts'
import { disposeObject3D } from '../../utils/dispose.ts'
import { clamp, damp } from '../../utils/math.ts'
import type { CharacterModel } from './CharacterModel.ts'
import { LaneController } from './LaneController.ts'

export interface PlayerStepInput {
  /** One logical lane step per fixed update: -1 left, +1 right, 0 none. */
  laneChange: number
  jump: boolean
  /**
   * Whether the jump input is still held. Omitted callers get a full jump so
   * direct controller tests stay deterministic.
   */
  jumpHeld?: boolean
  /** Starts one short slide when grounded. */
  slide?: boolean
  forwardSpeed: number
  /** Extra jumps allowed while airborne (Double Jump power-up). */
  airJumps?: number
  /** Temporary-effect multipliers. */
  gravityScale?: number
  jumpScale?: number
  laneControl?: number
}

export interface PlatformMotion {
  readonly x: number
  readonly y: number
  readonly z: number
}

export type PlatformMotionProvider = (colliderHandle: number) => PlatformMotion | null

/**
 * Kinematic runner character. Movement is resolved by Rapier's character
 * controller; visuals are a separate hierarchy so animation never affects the
 * physical capsule.
 */
export class Player {
  readonly root = new THREE.Group()
  readonly position = new THREE.Vector3()

  onCollision: ((colliderHandle: number) => void) | null = null
  onJump: (() => void) | null = null
  onJumpCut: (() => void) | null = null
  onSlide: (() => void) | null = null
  onBounce: ((height: number) => void) | null = null
  /** Fired once per touchdown with the downward speed at contact (m/s). */
  onLand: ((impactSpeed: number) => void) | null = null
  /** Fired on each footstep while running. */
  onFootstep: (() => void) | null = null
  /** Supplies the velocity of a moving platform by collider handle. */
  platformMotionProvider: PlatformMotionProvider | null = null

  private readonly physics: PhysicsWorld
  private readonly character: CharacterHandle
  private readonly lane = new LaneController()
  private readonly visual = new THREE.Group()
  /** Pivot at the runner's feet, so squash/stretch never lifts foot contacts. */
  private readonly feedback = new THREE.Group()
  private readonly bodyVisual = new THREE.Group()
  private readonly bodyMaterial: THREE.MeshStandardMaterial
  private readonly gemMaterial: THREE.MeshStandardMaterial
  private readonly glowMaterial: THREE.MeshBasicMaterial
  private readonly glowRing: THREE.Mesh
  private readonly tail: THREE.Mesh
  private readonly glowLight: THREE.PointLight
  private readonly shieldAura: THREE.Mesh
  private readonly shieldMaterial: THREE.MeshBasicMaterial
  private readonly footOffset: number
  private readonly capsuleRadius: number
  private readonly standingHalfHeight: number

  private characterModel: CharacterModel | null = null
  private verticalVelocity = 0
  private forwardSpeed = 0
  private grounded = false
  private coyoteTimer = 0
  private jumpBufferTimer = 0
  private currentSteer = 0
  private jumpRising = false
  private jumpHeldTime = 0
  private landingTimer = 0
  private capsuleHeightHalf: number
  private slideTimer = 0
  private slideElapsed = 0
  private slideAirTime = 0
  private slideCooldown = 0
  private sliding = false
  private airJumpsUsed = 0
  private shieldActive = false
  private footstepTimer = 0
  private readonly contacts: number[] = []
  private platformContact: number | null = null
  private disposed = false

  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    this.physics = physics
    this.root.name = 'Player'

    const playerConfig = GAME_CONFIG.player
    const halfHeight = playerConfig.halfHeight
    const radius = playerConfig.radius
    const spawnY = GAME_CONFIG.track.topY + halfHeight + radius + 0.03
    this.footOffset = -(halfHeight + radius)
    this.capsuleRadius = radius
    this.standingHalfHeight = halfHeight
    this.capsuleHeightHalf = halfHeight
    this.feedback.position.y = this.footOffset
    this.bodyVisual.name = 'KapsulFallback'
    this.visual.name = 'PlayerVisual'

    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.player,
      emissive: PALETTE.playerDeep,
      emissiveIntensity: 0.22,
      roughness: 0.24,
      metalness: 0.18,
    })
    this.gemMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.crystal,
      emissive: PALETTE.playerGlow,
      emissiveIntensity: 1.6,
      roughness: 0.12,
      metalness: 0.35,
      flatShading: true,
    })
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.playerGlow,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(radius, halfHeight * 2, 10, 20),
      this.bodyMaterial,
    )
    body.castShadow = true
    body.receiveShadow = true
    this.bodyVisual.add(body)

    const belt = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.01, 0.032, 6, 28),
      new THREE.MeshStandardMaterial({
        color: PALETTE.playerAccent,
        roughness: 0.45,
        metalness: 0.1,
      }),
    )
    belt.rotation.x = Math.PI / 2
    belt.position.y = 0.16
    belt.castShadow = true
    this.bodyVisual.add(belt)

    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.115, 0), this.gemMaterial)
    gem.position.set(0, 0.12, radius * 0.92)
    gem.castShadow = true
    this.bodyVisual.add(gem)

    this.tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.17, 0.72, 4),
      new THREE.MeshStandardMaterial({
        color: PALETTE.playerAccent,
        roughness: 0.58,
        flatShading: true,
      }),
    )
    this.tail.rotation.x = Math.PI / 2
    this.tail.position.set(0, 0.12, radius + 0.3)
    this.tail.scale.x = 0.6
    this.tail.castShadow = true
    this.bodyVisual.add(this.tail)

    // The feedback pivot sits at the feet. Scaling it squashes the character
    // without moving the authored foot contacts off the deck.
    this.bodyVisual.position.y = -this.footOffset
    this.feedback.add(this.bodyVisual)
    this.visual.add(this.feedback)

    this.glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.022, 6, 30), this.glowMaterial)
    this.glowRing.rotation.x = Math.PI / 2
    this.glowRing.position.y = -halfHeight - radius + 0.16
    this.visual.add(this.glowRing)

    this.glowLight = new THREE.PointLight(PALETTE.playerGlow, 12, 6.5, 2)
    this.glowLight.position.set(0, 0.2, 0.2)
    this.visual.add(this.glowLight)

    // Shield bubble. Kept fully transparent and hidden until a shield power-up
    // is active, so it never costs a draw call during normal running.
    this.shieldMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.powerShield,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    this.shieldAura = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.75, 18, 12),
      this.shieldMaterial,
    )
    this.shieldAura.visible = false
    this.shieldAura.name = 'ShieldAura'
    this.visual.add(this.shieldAura)

    this.root.add(this.visual)
    scene.add(this.root)

    this.character = this.physics.createCharacter(
      {
        x: 0,
        y: spawnY,
        z: playerConfig.startZ,
      },
      radius,
      halfHeight,
    )
    this.position.set(0, spawnY, playerConfig.startZ)
    this.root.position.copy(this.position)
  }

  get isGrounded(): boolean {
    return this.grounded
  }

  /** Logical lane the runner is committed to (0 = left, 2 = right). */
  get laneIndex(): number {
    return this.lane.laneIndex
  }

  get laneCount(): number {
    return this.lane.laneCount
  }

  get laneX(): number {
    return this.lane.laneX
  }

  get isChangingLane(): boolean {
    return this.lane.isTransitioning
  }

  get lateralVelocity(): number {
    return this.lane.lateralVelocity
  }

  get hasCharacterModel(): boolean {
    return this.characterModel !== null
  }

  get isSliding(): boolean {
    return this.sliding
  }

  get slideCooldownRemaining(): number {
    return this.slideCooldown
  }

  get verticalSpeed(): number {
    return this.verticalVelocity
  }

  /** Toggles the translucent shield bubble around the physical capsule. */
  setShieldActive(active: boolean): void {
    this.shieldActive = active
  }

  get capsuleHalfHeight(): number {
    return this.capsuleHeightHalf
  }

  /** Forward-speed multiplier contributed by the current movement state. */
  get speedMultiplier(): number {
    return this.sliding ? GAME_CONFIG.player.slide.speedMultiplier : 1
  }

  /**
   * Swaps the capsule placeholder for the loaded GLB. The physical capsule is
   * untouched, so animation can never affect collisions.
   */
  attachCharacter(character: CharacterModel): void {
    if (this.characterModel) {
      return
    }

    this.characterModel = character
    this.bodyVisual.visible = false
    character.root.position.set(0, 0, 0)
    this.feedback.add(character.root)
  }

  playOutcome(outcome: 'win' | 'lose'): void {
    this.characterModel?.playOutcome(outcome)
  }

  /** Stagger when a shield absorbs a hit. */
  playHit(): void {
    this.characterModel?.playHit()
  }

  reset(position: THREE.Vector3): void {
    this.restoreCapsule()
    this.character.body.setTranslation(position, true)
    this.character.body.setNextKinematicTranslation(position)
    // Move the collider now, not at the next physics step: otherwise the first
    // movement query still starts where the last run ended and can "hit" an
    // obstacle there (a crash at 0 m on restart).
    this.physics.world.propagateModifiedBodyPositionsToColliders()
    this.verticalVelocity = 0
    this.forwardSpeed = 0
    this.grounded = false
    this.coyoteTimer = 0
    this.jumpBufferTimer = 0
    this.currentSteer = 0
    this.jumpRising = false
    this.jumpHeldTime = 0
    this.landingTimer = 0
    this.sliding = false
    this.slideTimer = 0
    this.slideElapsed = 0
    this.slideAirTime = 0
    this.slideCooldown = 0
    this.airJumpsUsed = 0
    this.contacts.length = 0
    this.platformContact = null
    this.lane.reset()
    this.root.rotation.set(0, 0, 0)
    this.visual.position.set(0, 0, 0)
    this.feedback.scale.set(1, 1, 1)
    this.characterModel?.reset()
    this.position.copy(position)
    this.root.position.copy(position)
    this.syncTransform()
  }

  /** Recovery respawn: reset the run state at a safe checkpoint position. */
  teleport(position: THREE.Vector3): void {
    this.reset(position)
  }

  /**
   * Launches the runner from a bounce pad. Returns `false` when the capsule is
   * still trapped under a ceiling (for example while sliding under a beam).
   */
  bounce(height: number): boolean {
    if (!Number.isFinite(height) || height <= 0) {
      return false
    }
    if (this.sliding && !this.endSlide()) {
      return false
    }

    const config = GAME_CONFIG.player
    this.verticalVelocity = Math.sqrt(2 * Math.abs(config.gravity) * height)
    this.grounded = false
    this.coyoteTimer = 0
    this.jumpBufferTimer = 0
    this.jumpRising = false
    this.jumpHeldTime = 0
    this.landingTimer = 0
    this.platformContact = null
    this.onBounce?.(height)
    return true
  }

  fixedUpdate(delta: number, input: PlayerStepInput): void {
    const config = GAME_CONFIG.player
    const slideConfig = config.slide
    const jumpHeld = input.jumpHeld ?? true
    const airJumps = Math.max(0, Math.floor(input.airJumps ?? 0))
    const gravityScale = clamp(input.gravityScale ?? 1, 0.25, 3)
    const jumpScale = clamp(input.jumpScale ?? 1, 0.5, 2)
    const laneControl = clamp(input.laneControl ?? 1, 0.25, 2)

    this.updateSlide(delta)
    if (input.slide) {
      this.startSlide()
    }

    this.jumpBufferTimer = input.jump
      ? config.jumpBufferTime
      : Math.max(0, this.jumpBufferTimer - delta)
    this.coyoteTimer = this.grounded ? config.coyoteTime : Math.max(0, this.coyoteTimer - delta)

    if (this.jumpBufferTimer > 0 && (this.grounded || this.coyoteTimer > 0)) {
      // Jumping out of a slide is allowed only when the runner can stand up.
      if (this.sliding && !this.endSlide()) {
        this.jumpBufferTimer = 0
      } else {
        this.verticalVelocity =
          Math.sqrt(2 * Math.abs(config.gravity) * config.jumpHeight) * jumpScale
        this.grounded = false
        this.coyoteTimer = 0
        this.jumpBufferTimer = 0
        this.jumpRising = true
        this.jumpHeldTime = 0
        this.landingTimer = 0
        this.airJumpsUsed = 0
        this.platformContact = null
        this.onJump?.()
      }
    } else if (
      this.jumpBufferTimer > 0 &&
      !this.grounded &&
      this.coyoteTimer <= 0 &&
      this.airJumpsUsed < airJumps
    ) {
      // Double Jump: one honest extra launch per airborne period. Ground and
      // coyote jumps reset the counter, so the charge cannot be stockpiled.
      this.airJumpsUsed += 1
      this.verticalVelocity =
        Math.sqrt(2 * Math.abs(config.gravity) * config.jumpHeight) * jumpScale
      this.jumpBufferTimer = 0
      this.jumpRising = true
      this.jumpHeldTime = 0
      this.landingTimer = 0
      this.platformContact = null
      this.onJump?.()
    }

    if (this.jumpRising) {
      if (this.verticalVelocity <= 0 || this.grounded) {
        this.jumpRising = false
      } else {
        this.jumpHeldTime += delta
        if (config.jumpCut.enabled && !jumpHeld && this.jumpHeldTime >= config.jumpCut.graceTime) {
          const minimumSpeed = Math.sqrt(
            2 * Math.abs(config.gravity) * config.jumpCut.minimumHeight * jumpScale,
          )
          if (this.verticalVelocity > minimumSpeed) {
            this.verticalVelocity = Math.max(
              minimumSpeed,
              this.verticalVelocity * config.jumpCut.velocityMultiplier,
            )
            this.onJumpCut?.()
          }
          this.jumpRising = false
        }
      }
    }

    this.verticalVelocity = Math.max(
      config.maxFallSpeed,
      this.verticalVelocity + config.gravity * gravityScale * delta,
    )
    if (this.grounded && this.verticalVelocity < 0) {
      this.verticalVelocity = 0
    }

    const current = this.character.body.translation()
    if (input.laneChange !== 0) {
      this.lane.requestLane(input.laneChange)
    }
    const forwardSpeed = input.forwardSpeed * (this.sliding ? slideConfig.speedMultiplier : 1)
    this.forwardSpeed = forwardSpeed

    // Footstep sounds while running
    if (this.grounded && forwardSpeed > 5) {
      this.footstepTimer -= delta
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 0.4 / (forwardSpeed / 10)
        this.onFootstep?.()
      }
    }
    const control = laneControl * (this.sliding ? slideConfig.laneControl : 1)
    const lateralMovement = this.lane.step(current.x, this.grounded, delta, control)
    this.currentSteer = this.lane.steer

    const platformMotion =
      this.grounded && this.platformContact !== null && this.platformMotionProvider
        ? this.platformMotionProvider(this.platformContact)
        : null
    const platformX = (platformMotion?.x ?? 0) * delta
    const platformY = (platformMotion?.y ?? 0) * delta
    const platformZ = (platformMotion?.z ?? 0) * delta

    const desired = {
      x: lateralMovement + platformX,
      y: this.verticalVelocity * delta + platformY,
      z: -forwardSpeed * delta + platformZ,
    }

    const controller = this.character.controller
    controller.computeColliderMovement(this.character.collider, desired)
    const movement = controller.computedMovement()

    const maximumX = GAME_CONFIG.track.width / 2 - config.radius - 0.55
    const nextX = clamp(current.x + movement.x, -maximumX, maximumX)
    this.character.body.setNextKinematicTranslation({
      x: nextX,
      y: current.y + movement.y,
      z: current.z + movement.z,
    })

    const wasGrounded = this.grounded
    const impactSpeed = Math.max(0, -this.verticalVelocity)
    this.grounded = controller.computedGrounded()
    if (this.grounded) {
      this.airJumpsUsed = 0
    }
    if (this.grounded && !wasGrounded) {
      this.verticalVelocity = Math.min(this.verticalVelocity, 0)
      this.landingTimer = config.visual.squashDuration
      this.onLand?.(impactSpeed)
    }

    this.contacts.length = 0
    const collisionCount = controller.numComputedCollisions()
    for (let index = 0; index < collisionCount; index += 1) {
      const collision = controller.computedCollision(index)
      const collider: Collider | null = collision?.collider ?? null
      if (collider) {
        this.contacts.push(collider.handle)
        this.onCollision?.(collider.handle)
      }
    }

    this.platformContact = null
    if (this.grounded && this.platformMotionProvider) {
      for (const handle of this.contacts) {
        if (this.platformMotionProvider(handle)) {
          this.platformContact = handle
          break
        }
      }
    }
  }

  syncTransform(): void {
    const translation = this.character.body.translation()
    this.position.set(translation.x, translation.y, translation.z)
    this.root.position.copy(this.position)
  }

  private startSlide(): boolean {
    const slide = GAME_CONFIG.player.slide
    if (this.sliding || !this.grounded || this.slideCooldown > 0) {
      return false
    }

    this.sliding = true
    this.slideTimer = slide.duration
    this.slideElapsed = 0
    this.slideAirTime = 0
    this.verticalVelocity = 0
    this.jumpRising = false
    this.jumpBufferTimer = 0
    this.setCapsuleHalfHeight(slide.halfHeight)
    this.onSlide?.()
    return true
  }

  /**
   * Restores the standing capsule once there is headroom. A blocked restore
   * keeps the runner sliding, so a low beam can never be clipped through.
   */
  private endSlide(force = false): boolean {
    if (!this.sliding) {
      return true
    }

    const slide = GAME_CONFIG.player.slide
    if (!force) {
      const translation = this.character.body.translation()
      const currentTop = translation.y + this.capsuleHeightHalf + this.capsuleRadius
      const desiredTop =
        translation.y + this.standingHalfHeight + this.capsuleRadius + slide.headroomMargin
      const clear = this.physics.hasHeadroom(
        { x: translation.x, y: translation.y, z: translation.z },
        currentTop,
        desiredTop,
        this.character.collider,
      )
      if (!clear) {
        this.slideTimer = Math.max(this.slideTimer, 0.04)
        return false
      }
    }

    this.sliding = false
    this.slideTimer = 0
    this.slideElapsed = 0
    this.slideCooldown = slide.cooldown
    this.setCapsuleHalfHeight(this.standingHalfHeight)
    return true
  }

  private updateSlide(delta: number): void {
    if (this.slideCooldown > 0) {
      this.slideCooldown = Math.max(0, this.slideCooldown - delta)
    }
    if (!this.sliding) {
      return
    }

    const slide = GAME_CONFIG.player.slide
    this.slideTimer -= delta
    this.slideElapsed += delta
    this.slideAirTime = this.grounded ? 0 : this.slideAirTime + delta
    if (
      this.slideTimer <= 0 ||
      this.slideElapsed >= slide.maxDuration ||
      this.slideAirTime >= slide.groundGrace
    ) {
      this.endSlide()
    }
  }

  /**
   * Changes the capsule's cylinder half-height while keeping the feet at the
   * same world Y. The character body is kinematic, so this is a direct,
   * deterministic transform change between fixed steps.
   */
  private setCapsuleHalfHeight(halfHeight: number): void {
    const next = clamp(halfHeight, 0.02, this.standingHalfHeight)
    const delta = next - this.capsuleHeightHalf
    if (Math.abs(delta) < 1e-6) {
      return
    }

    this.character.collider.setHalfHeight(next)
    const translation = this.character.body.translation()
    const position = {
      x: translation.x,
      y: translation.y + delta,
      z: translation.z,
    }
    this.character.body.setTranslation(position, true)
    this.character.body.setNextKinematicTranslation(position)
    this.capsuleHeightHalf = next
    this.position.y = position.y
  }

  private restoreCapsule(): void {
    if (this.capsuleHeightHalf !== this.standingHalfHeight) {
      this.setCapsuleHalfHeight(this.standingHalfHeight)
    }
  }

  updateVisual(
    delta: number,
    elapsed: number,
    dashing: boolean,
    idleOnly = false,
    surging = false,
  ): void {
    this.syncTransform()

    const boost = dashing || surging
    const lean = -this.currentSteer * 0.13
    this.root.rotation.z = damp(this.root.rotation.z, lean, 10, delta)
    this.root.rotation.x = damp(this.root.rotation.x, boost ? -0.12 : 0, 10, delta)

    if (this.characterModel) {
      this.characterModel.update(delta, {
        grounded: this.grounded,
        verticalVelocity: this.verticalVelocity,
        speed: this.forwardSpeed,
        dashing: boost,
        idle: idleOnly,
        sliding: this.sliding,
        slideDuration: GAME_CONFIG.player.slide.duration,
      })
    }

    // Squash/stretch is applied to a feet-pivoted group, so the physical
    // capsule and authored foot contacts stay aligned.
    if (this.landingTimer > 0) {
      this.landingTimer = Math.max(0, this.landingTimer - delta)
    }
    const visual = GAME_CONFIG.player.visual
    let targetY = 1
    let targetXZ = 1
    if (this.sliding && !this.characterModel?.animatesSlide) {
      targetY = GAME_CONFIG.player.slide.visualScaleY
      targetXZ = GAME_CONFIG.player.slide.visualScaleXZ
    } else if (!this.grounded) {
      // Airborne stretch is strongest near the top of the arc.
      targetY = visual.stretchY
      targetXZ = visual.stretchXZ
    } else if (this.landingTimer > 0) {
      targetY = visual.squashY
      targetXZ = visual.squashXZ
    } else if (boost) {
      targetY = 0.98
      targetXZ = 1.02
    }
    this.feedback.scale.x = damp(this.feedback.scale.x, targetXZ, visual.damping, delta)
    this.feedback.scale.y = damp(this.feedback.scale.y, targetY, visual.damping, delta)
    this.feedback.scale.z = damp(this.feedback.scale.z, targetXZ, visual.damping, delta)

    // The GLB animations already carry hip bob. Adding the placeholder bob on
    // top would lift the authored foot contacts off the track.
    const bob = this.characterModel ? 0 : this.grounded ? Math.sin(elapsed * 11.5) * 0.022 : 0.012
    this.visual.position.y = damp(this.visual.position.y, bob, 18, delta)

    this.glowRing.rotation.z = elapsed * (boost ? 6 : 2.2)
    const pulse = 1 + Math.sin(elapsed * (boost ? 9 : 4)) * 0.06
    this.glowRing.scale.setScalar(pulse)

    const auraTarget = this.shieldActive ? 0.22 + Math.sin(elapsed * 5.5) * 0.05 : 0
    this.shieldMaterial.opacity = damp(this.shieldMaterial.opacity, auraTarget, 12, delta)
    this.shieldAura.visible = this.shieldMaterial.opacity > 0.01
    this.shieldAura.rotation.y = elapsed * 1.6
    this.shieldAura.rotation.x = elapsed * 0.7
    this.glowMaterial.opacity = boost ? 0.9 : 0.55

    this.gemMaterial.emissiveIntensity = boost ? 2.8 : 1.5 + Math.sin(elapsed * 3.4) * 0.25
    this.bodyMaterial.emissiveIntensity = boost ? 0.55 : 0.22
    this.glowLight.intensity = boost ? 24 : 12

    this.tail.rotation.x = Math.PI / 2 + Math.sin(elapsed * 7) * 0.1
    this.tail.scale.z = boost ? 1.35 : 1
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.characterModel?.dispose()
    this.characterModel = null
    this.root.removeFromParent()
    this.glowLight.removeFromParent()
    disposeObject3D(this.root)
  }
}
