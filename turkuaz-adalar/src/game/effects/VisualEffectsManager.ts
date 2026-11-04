import * as THREE from 'three'
import { ParticleSystem } from './ParticleSystem.ts'

/**
 * Central visual effects manager for game events.
 * Handles all particle effects and visual feedback.
 */
export class VisualEffectsManager {
  private readonly particleSystem: ParticleSystem
  private readonly scene: THREE.Scene
  private disposed = false

  constructor(scene: THREE.Scene, maxParticles = 256, qualityMultiplier = 1.0) {
    this.scene = scene
    this.particleSystem = new ParticleSystem(maxParticles, qualityMultiplier)
    this.scene.add(this.particleSystem.points)
  }

  emitJumpDust(position: THREE.Vector3): void {
    this.particleSystem.emit(
      position.x,
      position.y,
      position.z,
      0xd9cba3,
      16,
      { speed: 2, lifetime: 0.4, size: 0.12, spread: 0.6, upward: 0.3 },
    )
  }

  emitLandingDust(position: THREE.Vector3): void {
    this.particleSystem.emit(
      position.x,
      position.y,
      position.z,
      0xd9cba3,
      24,
      { speed: 3, lifetime: 0.5, size: 0.15, spread: 0.8, upward: 0.6 },
    )
  }

  emitCoinCollection(position: THREE.Vector3): void {
    this.particleSystem.emit(
      position.x,
      position.y + 0.5,
      position.z,
      0xffd700,
      12,
      { speed: 2.5, lifetime: 0.35, size: 0.1, spread: 0.4, upward: 0.8 },
    )
  }

  emitTokenCollection(position: THREE.Vector3): void {
    this.particleSystem.emit(
      position.x,
      position.y + 0.5,
      position.z,
      0x9c27b0,
      18,
      { speed: 3, lifetime: 0.45, size: 0.12, spread: 0.5, upward: 1.0 },
    )
  }

  emitPowerUp(position: THREE.Vector3, kind: 'shield' | 'magnet' | 'speed' | 'doubleJump'): void {
    const colors = {
      shield: 0x2196f3,
      magnet: 0x00bcd4,
      speed: 0xff5722,
      doubleJump: 0x4caf50,
    }
    this.particleSystem.emit(
      position.x,
      position.y + 0.5,
      position.z,
      colors[kind],
      32,
      { speed: 4, lifetime: 0.6, size: 0.15, spread: 0.8, upward: 1.2 },
    )
  }

  emitShieldBreak(position: THREE.Vector3): void {
    this.particleSystem.emit(
      position.x,
      position.y,
      position.z,
      0xff3d00,
      48,
      { speed: 5, lifetime: 0.5, size: 0.18, spread: 1.2, upward: 0.4 },
    )
  }

  emitSpeedTrail(position: THREE.Vector3, direction: THREE.Vector3): void {
    this.particleSystem.emitCone(
      position.x,
      position.y,
      position.z,
      direction,
      0xff9800,
      4,
      { speed: 2, lifetime: 0.25, size: 0.08, spread: 0.3 },
    )
  }

  emitWaterfall(position: THREE.Vector3, direction: THREE.Vector3): void {
    this.particleSystem.emitCone(
      position.x,
      position.y,
      position.z,
      direction,
      0x4fc3f7,
      8,
      { speed: 3, lifetime: 0.8, size: 0.1, spread: 0.4 },
    )
  }

  emitLevelComplete(position: THREE.Vector3): void {
    const colors = [0xffd700, 0xff6b6b, 0x4ecdc4, 0x45b7d1]
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        this.particleSystem.emit(
          position.x,
          position.y + 1 + i * 0.5,
          position.z,
          colors[i],
          64,
          { speed: 6, lifetime: 1.2, size: 0.2, spread: 1.5, upward: 2 },
        )
      }, i * 100)
    }
  }

  update(delta: number): void {
    this.particleSystem.update(delta)
  }

  clear(): void {
    this.particleSystem.clear()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.particleSystem.dispose()
  }
}
