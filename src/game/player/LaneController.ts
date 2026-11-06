import { GAME_CONFIG } from '../../config/GameConfig.ts'
import { clamp, moveTowards } from '../../utils/math.ts'

export interface LaneTuning {
  readonly changeSpeed: number
  readonly acceleration: number
  readonly airControl: number
  readonly arrivalGain: number
  readonly snapDistance: number
}

/**
 * Logical three-lane controller.
 *
 * Input only ever requests a single lane step; this class owns the runner's
 * committed lane, lateral velocity and the acceleration curve used to reach
 * the lane centre. It is deliberately independent of Three.js and Rapier so
 * movement rules can be tested without a scene or a physics world.
 *
 * All timing is expressed in seconds and the caller supplies the fixed delta,
 * so results are frame-rate independent.
 */
export class LaneController {
  private readonly config: LaneTuning
  private readonly positions: readonly number[]
  private readonly centerLane: number

  private lane: number
  private velocity = 0
  private lastX = 0

  constructor(
    config: LaneTuning = GAME_CONFIG.player.lane,
    positions: readonly number[] = GAME_CONFIG.track.lanePositions,
  ) {
    if (positions.length < 1) {
      throw new Error('LaneController requires at least one lane position.')
    }
    this.config = config
    this.positions = positions
    this.centerLane = Math.floor(positions.length / 2)
    this.lane = this.centerLane
    this.lastX = positions[this.lane]
  }

  /** Logical lane the runner is committed to (0 = left). */
  get laneIndex(): number {
    return this.lane
  }

  get laneCount(): number {
    return this.positions.length
  }

  /** World-space X of the committed lane. */
  get laneX(): number {
    return this.positions[this.lane]
  }

  get lateralVelocity(): number {
    return this.velocity
  }

  /** -1..1 lateral input equivalent, used for visual banking. */
  get steer(): number {
    return clamp(this.velocity / Math.max(0.001, this.config.changeSpeed), -1, 1)
  }

  get isTransitioning(): boolean {
    return (
      Math.abs(this.laneX - this.lastX) > this.config.snapDistance ||
      Math.abs(this.velocity) > 0.001
    )
  }

  /**
   * Requests one lane step. Repeated calls move one lane each, and the target
   * never leaves the lane range, so a single swipe or repeat held key can
   * never push the runner off the track.
   */
  requestLane(change: number): number {
    if (change === 0 || !Number.isFinite(change)) {
      return this.lane
    }
    this.lane = clamp(this.lane + Math.sign(change), 0, this.positions.length - 1)
    return this.lane
  }

  /**
   * Advances lateral movement and returns the displacement for this step.
   * `currentX` is read back from the physics body, so collisions can never
   * desynchronise the controller from the visible character. `controlScale`
   * lets temporary effects and slides tune authority without duplicating the
   * lane rules.
   */
  step(currentX: number, grounded: boolean, delta: number, controlScale = 1): number {
    this.lastX = currentX
    const remaining = this.laneX - currentX
    const scale = clamp(controlScale, 0.1, 2)
    const control = (grounded ? 1 : this.config.airControl) * scale
    const maxSpeed = this.config.changeSpeed * control
    const acceleration = this.config.acceleration * control

    if (Math.abs(remaining) <= this.config.snapDistance) {
      this.velocity = 0
      return remaining
    }

    const desiredSpeed = clamp(remaining * this.config.arrivalGain, -maxSpeed, maxSpeed)
    this.velocity = moveTowards(this.velocity, desiredSpeed, acceleration * Math.max(0, delta))

    const maxStep = Math.abs(remaining)
    const movement = clamp(this.velocity * Math.max(0, delta), -maxStep, maxStep)
    if (Math.abs(movement) >= maxStep) {
      this.velocity = 0
    }
    return movement
  }

  reset(laneIndex: number = this.centerLane): void {
    this.lane = clamp(Math.round(laneIndex), 0, this.positions.length - 1)
    this.velocity = 0
    this.lastX = this.positions[this.lane]
  }
}
