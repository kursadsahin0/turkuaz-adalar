import * as THREE from 'three'
import { WORLD_CONFIG } from '../../../config/WorldConfig.ts'
import type { Rng } from '../../../utils/random.ts'
import type { PlatformAssets } from '../../platforms/PlatformAssets.ts'
import type { FloatingIslandAssets } from './FloatingIsland.ts'

/**
 * A small decorative checker platform drifting between islands. It is scenery
 * only: no collider is created, so it never invites an impossible jump.
 */
export class FloatingPad {
  readonly root = new THREE.Group()

  private readonly mechanism: THREE.Mesh
  private readonly phase: number
  private baseY = 0
  private baseRotation = 0
  private baseScale = 1

  constructor(assets: FloatingIslandAssets, platform: PlatformAssets, phase: number) {
    this.phase = phase
    this.root.name = 'FloatingPad'
    this.root.add(assets.createPadChecker(), assets.createPadDetails())

    this.mechanism = platform.createMechanism()
    this.mechanism.position.y = 0.03
    this.mechanism.scale.setScalar(0.92)
    this.root.add(this.mechanism)
  }

  get centerZ(): number {
    return this.root.position.z
  }

  layout(rng: Rng, x: number, y: number, z: number, size: number): void {
    const scenery = WORLD_CONFIG.scenery
    this.baseY = y
    this.baseScale = size / 3.2
    this.baseRotation = rng.range(0, Math.PI * 2)
    this.root.position.set(x, y, z)
    this.root.rotation.y = this.baseRotation
    this.root.scale.setScalar(this.baseScale)
    this.mechanism.rotation.y = rng.range(0, Math.PI * 2)
    this.root.visible = scenery.padCount > 0
  }

  update(elapsed: number): void {
    this.root.position.y = this.baseY + Math.sin(elapsed * 0.55 + this.phase) * 0.26
    this.root.rotation.y = this.baseRotation + Math.sin(elapsed * 0.22 + this.phase) * 0.06
    this.mechanism.rotation.y = elapsed * 0.55 + this.phase
  }

  dispose(): void {
    this.root.removeFromParent()
    this.root.clear()
  }
}
