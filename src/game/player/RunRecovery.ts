import { GAME_CONFIG } from '../../config/GameConfig.ts'

export interface RecoveryCheckpoint {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface RunRecoveryConfig {
  readonly recoverBelowY: number
  readonly respawnOffsetZ: number
  readonly cooldown: number
  readonly invulnerability: number
}

/**
 * Tracks the last checkpoint and decides when a fall can be recovered.
 *
 * This is deliberately independent of the scene and physics world: gameplay
 * only needs to hand it checkpoint positions and the runner's Y each step.
 */
export class RunRecovery {
  private readonly config: RunRecoveryConfig
  private checkpoint: RecoveryCheckpoint | null = null
  private cooldown = 0
  private recoveries = 0

  constructor(config: RunRecoveryConfig = GAME_CONFIG.player.fall) {
    this.config = config
  }

  get lastCheckpoint(): RecoveryCheckpoint | null {
    return this.checkpoint
  }

  get coolingDown(): boolean {
    return this.cooldown > 0
  }

  get recoveryCount(): number {
    return this.recoveries
  }

  get invulnerability(): number {
    return this.config.invulnerability
  }

  setCheckpoint(checkpoint: RecoveryCheckpoint): void {
    this.checkpoint = { ...checkpoint }
  }

  update(delta: number): void {
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - delta)
    }
  }

  shouldRecover(y: number): boolean {
    return this.checkpoint !== null && this.cooldown <= 0 && y < this.config.recoverBelowY
  }

  /**
   * Returns the respawn position and starts the cooldown, or `null` when a
   * recovery is not currently allowed.
   */
  recover(): RecoveryCheckpoint | null {
    if (!this.checkpoint || this.cooldown > 0) {
      return null
    }

    this.cooldown = this.config.cooldown
    this.recoveries += 1
    return {
      x: this.checkpoint.x,
      y: this.checkpoint.y,
      z: this.checkpoint.z + this.config.respawnOffsetZ,
    }
  }

  reset(): void {
    this.checkpoint = null
    this.cooldown = 0
    this.recoveries = 0
  }
}
