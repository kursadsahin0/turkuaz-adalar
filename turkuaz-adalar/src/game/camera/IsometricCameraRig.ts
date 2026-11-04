import * as THREE from 'three'
import {
  CAMERA_CONFIG,
  type CameraAspectProfile,
  type CameraMode,
} from '../../config/CameraConfig.ts'
import { GAME_CONFIG } from '../../config/GameConfig.ts'
import { clamp, damp, degToRad } from '../../utils/math.ts'
import {
  baseFraming,
  composeFraming,
  dampFraming,
  resolveAspectProfile,
  resolveCameraSection,
  type CameraFramingValues,
  type ResolvedCameraSection,
} from './CameraFraming.ts'
import {
  CameraOcclusion,
  type CameraOccluderSource,
} from './CameraOcclusion.ts'

export interface IsometricCameraOptions {
  /** Override the OS reduced-motion preference (useful for deterministic tests). */
  readonly reduceMotion?: boolean
}

function detectReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Elevated third-person camera with an isometric-style diagonal.
 *
 * Responsibilities:
 * - smooth horizontal/vertical follow with no lag along the running axis, so
 *   the character stays at a stable screen position at any speed;
 * - configurable distance and height, blended between menu and gameplay;
 * - gentle ambient/steering yaw, jump lift and landing dip;
 * - section-aware framing and world bounds;
 * - ray/box occlusion and a hard floor so the boom never clips a platform.
 *
 * The class deliberately owns no game state. `update` receives the target and
 * distance travelled; events are opt-in (`jump`, `land`, `shake`).
 */
export class IsometricCameraRig {
  readonly camera: THREE.PerspectiveCamera

  private readonly occlusion = new CameraOcclusion()
  private readonly reduceMotion: boolean

  private readonly position = new THREE.Vector3()
  private readonly look = new THREE.Vector3()
  private readonly desiredPosition = new THREE.Vector3()
  private readonly desiredLook = new THREE.Vector3()
  private readonly boomOrigin = new THREE.Vector3()

  private aspect = 1
  private profile: CameraAspectProfile = 'landscape'
  private mode: CameraMode = 'follow'
  private section: ResolvedCameraSection = resolveCameraSection(0)
  private framing: CameraFramingValues
  private focusX = 0
  private focusY = 0
  private steerYaw = 0
  private jumpEnergy = 0
  private landingEnergy = 0
  private distanceOverride: number | null = null
  private heightOverride: number | null = null
  private initialized = false

  private shakeTime = 0
  private shakeDuration = 0
  private shakeAmplitude = 0

  constructor(aspect: number, options: IsometricCameraOptions = {}) {
    this.reduceMotion = options.reduceMotion ?? detectReducedMotion()
    const normalizedAspect = Math.max(0.2, aspect)
    this.aspect = normalizedAspect
    this.profile = resolveAspectProfile(normalizedAspect)
    this.framing = this.resolveTargetFraming('follow', this.section)

    this.camera = new THREE.PerspectiveCamera(
      this.framing.fov,
      normalizedAspect,
      CAMERA_CONFIG.projection.near,
      CAMERA_CONFIG.projection.far,
    )
    this.look.set(0, 1.2, -4)
    this.position.set(0, this.framing.height, this.framing.distance)
    this.camera.position.copy(this.position)
    this.camera.lookAt(this.look)
  }

  get aspectProfile(): CameraAspectProfile {
    return this.profile
  }

  get aspectRatio(): number {
    return this.aspect
  }

  /** Effective horizontal distance behind the runner, in metres. */
  get distance(): number {
    return this.framing.distance
  }

  /** Effective height above the runner, in metres. */
  get height(): number {
    return this.framing.height
  }

  get fov(): number {
    return this.camera.fov
  }

  get sectionId(): string {
    return this.section.section.id
  }

  get sectionLabel(): string {
    return this.section.section.label
  }

  /** Snapshot of the current (smoothed) framing values. */
  get currentFraming(): CameraFramingValues {
    return { ...this.framing }
  }

  setAspect(aspect: number): void {
    this.aspect = Math.max(0.2, aspect)
    this.profile = resolveAspectProfile(this.aspect)
    this.camera.aspect = this.aspect
    this.camera.updateProjectionMatrix()
  }

  setOccluders(source: CameraOccluderSource | null): void {
    this.occlusion.setSource(source)
  }

  /** Absolute distance override; clamped to the configured limits. */
  setDistance(distance: number): void {
    this.distanceOverride = clamp(
      distance,
      CAMERA_CONFIG.bounds.minDistance,
      CAMERA_CONFIG.bounds.maxDistance,
    )
  }

  adjustDistance(delta: number): void {
    this.setDistance(this.framing.distance + delta)
  }

  /** Absolute height override; clamped to the configured limits. */
  setHeight(height: number): void {
    this.heightOverride = clamp(
      height,
      CAMERA_CONFIG.bounds.minHeight,
      CAMERA_CONFIG.bounds.maxHeight,
    )
  }

  adjustHeight(delta: number): void {
    this.setHeight(this.framing.height + delta)
  }

  clearFramingOverrides(): void {
    this.distanceOverride = null
    this.heightOverride = null
  }

  /**
   * Places the camera immediately and adopts the exact target framing for the
   * given mode. Used once at boot and by tests.
   */
  snapTo(target: THREE.Vector3, mode: CameraMode = 'menu', distanceTravelled = 0): void {
    this.mode = mode
    this.section = resolveCameraSection(distanceTravelled)
    this.framing = this.resolveTargetFraming(mode, this.section)
    this.resetImpulses()
    this.focusX = this.clampFocus(target.x * CAMERA_CONFIG.follow.pivotXFollow)
    this.focusY = target.y
    this.look.set(
      this.clampLookX(target.x * CAMERA_CONFIG.follow.lookXFollow),
      target.y + this.framing.lookHeight,
      target.z - this.framing.lookAhead,
    )
    this.computeDesiredPosition(target, 0, 0, 0)
    this.position.copy(this.desiredPosition)
    this.camera.position.copy(this.position)
    this.camera.lookAt(this.look)
    this.camera.fov = this.framing.fov
    this.camera.updateProjectionMatrix()
    this.initialized = true
  }

  /**
   * Moves the camera behind a new target instantly while keeping the current
   * framing. This removes a cross-map glide when a run restarts, yet still lets
   * the menu framing blend in smoothly afterwards.
   */
  recenter(target: THREE.Vector3, distanceTravelled = 0): void {
    if (!this.initialized) {
      this.snapTo(target, this.mode, distanceTravelled)
      return
    }

    this.section = resolveCameraSection(distanceTravelled)
    this.resetImpulses()
    this.focusX = this.clampFocus(target.x * CAMERA_CONFIG.follow.pivotXFollow)
    this.focusY = target.y
    this.look.set(
      this.clampLookX(target.x * CAMERA_CONFIG.follow.lookXFollow),
      target.y + this.framing.lookHeight,
      target.z - this.framing.lookAhead,
    )
    this.computeDesiredPosition(target, 0, 0, 0)
    this.position.copy(this.desiredPosition)
    this.camera.position.copy(this.position)
    this.camera.lookAt(this.look)
  }

  /**
   * @param distanceTravelled metres down the track; drives section framing.
   */
  update(
    delta: number,
    target: THREE.Vector3,
    mode: CameraMode,
    elapsed: number,
    distanceTravelled = 0,
  ): void {
    const frameDelta = clamp(delta, 0, 0.1)
    if (!this.initialized) {
      this.snapTo(target, mode, distanceTravelled)
      return
    }

    this.mode = mode
    this.section = resolveCameraSection(distanceTravelled)

    const follow = CAMERA_CONFIG.follow
    const framingLambda = mode === 'menu' ? follow.menuLambda : follow.framingLambda
    this.framing = dampFraming(
      this.framing,
      this.resolveTargetFraming(mode, this.section),
      framingLambda,
      frameDelta,
    )

    const motionScale = this.reduceMotion ? CAMERA_CONFIG.reducedMotionScale : 1
    const jump = CAMERA_CONFIG.jump
    const landing = CAMERA_CONFIG.landing
    this.jumpEnergy *= Math.exp(-jump.decayLambda * frameDelta)
    this.landingEnergy *= Math.exp(-landing.recoverLambda * frameDelta)

    const rotation = CAMERA_CONFIG.rotation
    const bound = Math.max(0.001, this.section.bounds.lateral)
    const steerTarget =
      clamp(target.x / bound, -1, 1) *
      degToRad(rotation.steerYawDegrees) *
      motionScale
    this.steerYaw = damp(this.steerYaw, steerTarget, rotation.steerLambda, frameDelta)

    // Ambient yaw keeps the isometric view alive, but it is exactly the kind
    // of slow full-frame motion reduced-motion users ask to switch off.
    const ambientScale = this.reduceMotion ? 0 : 1
    const ambient =
      ambientScale *
      Math.sin((elapsed / rotation.periodSeconds) * Math.PI * 2) *
      degToRad(
        mode === 'menu' ? rotation.menuYawDegrees : rotation.gameplayYawDegrees,
      )
    const yaw = degToRad(this.framing.yawDegrees) + ambient + this.steerYaw

    this.focusX = damp(
      this.focusX,
      this.clampFocus(target.x * follow.pivotXFollow),
      follow.positionLambda,
      frameDelta,
    )
    this.focusY = damp(
      this.focusY,
      target.y,
      target.y > this.focusY ? follow.verticalRiseLambda : follow.verticalLambda,
      frameDelta,
    )

    const jumpRise = jump.rise * motionScale * this.jumpEnergy
    const landingDrop = landing.dip * motionScale * this.landingEnergy

    this.desiredLook.set(
      this.clampLookX(target.x * follow.lookXFollow),
      this.focusY +
        this.framing.lookHeight +
        jump.lookRise * motionScale * this.jumpEnergy -
        landing.lookDip * motionScale * this.landingEnergy,
      target.z - this.framing.lookAhead,
    )
    this.look.x = damp(this.look.x, this.desiredLook.x, follow.lookLambda, frameDelta)
    this.look.y = damp(this.look.y, this.desiredLook.y, follow.lookLambda, frameDelta)
    this.look.z = this.desiredLook.z

    this.computeDesiredPosition(target, yaw, jumpRise, landingDrop)

    this.boomOrigin.set(
      this.focusX,
      this.focusY + this.framing.lookHeight,
      target.z,
    )
    this.occlusion.resolve(this.boomOrigin, this.desiredPosition, this.desiredPosition)
    this.clampToBounds(this.desiredPosition)

    this.position.x = damp(
      this.position.x,
      this.desiredPosition.x,
      follow.positionLambda,
      frameDelta,
    )
    this.position.y = damp(
      this.position.y,
      this.desiredPosition.y,
      follow.verticalLambda,
      frameDelta,
    )
    // The running axis follows the runner exactly: an exponential trail here
    // would make the framing breathe with speed and look like jitter.
    this.position.z = this.desiredPosition.z

    this.camera.position.copy(this.position)
    this.camera.lookAt(this.look)

    const roll =
      degToRad(
        jump.rollDegrees * this.jumpEnergy + landing.rollDegrees * this.landingEnergy,
      ) * motionScale
    this.camera.rotation.z += roll
    this.applyShake(frameDelta)

    const targetFov = this.framing.fov
    if (Math.abs(this.camera.fov - targetFov) > 0.0001) {
      this.camera.fov = targetFov
      this.camera.updateProjectionMatrix()
    }
  }

  /** Small upward response when the runner leaves the ground. */
  jump(): void {
    this.jumpEnergy = Math.max(this.jumpEnergy, 1)
  }

  /** Subtle touchdown dip scaled by impact speed. */
  land(impactSpeed: number): void {
    if (impactSpeed < CAMERA_CONFIG.landing.minImpactSpeed) {
      return
    }
    const range = Math.max(
      0.001,
      CAMERA_CONFIG.landing.referenceImpactSpeed - CAMERA_CONFIG.landing.minImpactSpeed,
    )
    const normalized = clamp(
      (impactSpeed - CAMERA_CONFIG.landing.minImpactSpeed) / range,
      0,
      1,
    )
    this.landingEnergy = Math.max(this.landingEnergy, 0.35 + normalized * 0.65)
  }

  shake(amplitude = 0.42, duration = 0.45): void {
    if (this.reduceMotion) {
      return
    }
    this.shakeAmplitude = Math.max(this.shakeAmplitude, amplitude)
    this.shakeDuration = Math.max(this.shakeDuration, duration)
    this.shakeTime = Math.max(this.shakeTime, duration)
  }

  dispose(): void {
    this.occlusion.setSource(null)
    this.initialized = false
  }

  private resolveTargetFraming(
    mode: CameraMode,
    section: ResolvedCameraSection,
  ): CameraFramingValues {
    const composed = composeFraming(baseFraming(this.profile), section, mode)
    return {
      distance: clamp(
        this.distanceOverride ?? composed.distance,
        CAMERA_CONFIG.bounds.minDistance,
        CAMERA_CONFIG.bounds.maxDistance,
      ),
      height: clamp(
        this.heightOverride ?? composed.height,
        CAMERA_CONFIG.bounds.minHeight,
        CAMERA_CONFIG.bounds.maxHeight,
      ),
      lookAhead: composed.lookAhead,
      lookHeight: composed.lookHeight,
      yawDegrees: composed.yawDegrees,
      fov: composed.fov,
    }
  }

  private computeDesiredPosition(
    target: THREE.Vector3,
    yaw: number,
    jumpRise: number,
    landingDrop: number,
  ): void {
    this.desiredPosition.set(
      this.focusX + Math.sin(yaw) * this.framing.distance,
      this.focusY + this.framing.height + jumpRise - landingDrop,
      target.z + Math.cos(yaw) * this.framing.distance,
    )
    this.clampToBounds(this.desiredPosition)
  }

  /** Section bounds plus global safety limits: no underground/cliff cameras. */
  private clampToBounds(position: THREE.Vector3): void {
    const bounds = CAMERA_CONFIG.bounds
    const floor = GAME_CONFIG.track.topY + bounds.floorClearance
    const ceiling = GAME_CONFIG.track.topY + this.section.bounds.maxHeight
    const lateral = this.section.bounds.lateral + bounds.cameraLateralPadding

    position.x = clamp(position.x, -lateral, lateral)
    position.y = clamp(position.y, floor, ceiling)

    const lookFloor = floor + bounds.lookFloorClearance
    if (this.look.y < lookFloor) {
      this.look.y = lookFloor
    }
  }

  private clampFocus(x: number): number {
    return clamp(x, -this.section.bounds.lateral, this.section.bounds.lateral)
  }

  private clampLookX(x: number): number {
    const lateral = this.section.bounds.lateral + 0.8
    return clamp(x, -lateral, lateral)
  }

  private resetImpulses(): void {
    this.jumpEnergy = 0
    this.landingEnergy = 0
    this.steerYaw = 0
    this.shakeTime = 0
    this.shakeDuration = 0
    this.shakeAmplitude = 0
  }

  private applyShake(delta: number): void {
    if (this.shakeTime <= 0) {
      this.shakeAmplitude = 0
      return
    }

    this.shakeTime = Math.max(0, this.shakeTime - delta)
    const duration = Math.max(0.001, this.shakeDuration)
    const decay = clamp(this.shakeTime / duration, 0, 1)
    const amount = this.shakeAmplitude * decay * decay

    this.camera.position.x += (Math.random() * 2 - 1) * amount
    this.camera.position.y += (Math.random() * 2 - 1) * amount * 0.6
    this.camera.rotation.z += (Math.random() * 2 - 1) * amount * 0.035

    if (this.shakeTime <= 0) {
      this.shakeDuration = 0
    }
  }
}
