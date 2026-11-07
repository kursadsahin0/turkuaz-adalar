import * as THREE from 'three'
import { GAME_CONFIG } from '../../config/GameConfig.ts'

/** Real gaps within this range are drawn in the strip below the runner. */
const VISIBLE_GAP = 20
/** Closest the swell is drawn (just behind the runner), and the screen edge. */
const NEAREST = 2.4
const EDGE = 4.8

/**
 * The tidal wave that chases the runner on chase islands: a rolling swell of
 * water across the track with a foam crest. Purely visual; the chase rules
 * live in ChaseController.
 */
export class ChaseWave {
  readonly root = new THREE.Group()
  private readonly water: THREE.MeshStandardMaterial
  private readonly foam: THREE.MeshStandardMaterial
  private readonly crest: THREE.Mesh

  constructor(scene: THREE.Scene) {
    this.root.name = 'ChaseWave'
    const width = GAME_CONFIG.track.width + 10
    this.water = new THREE.MeshStandardMaterial({
      color: 0x1fb5c9,
      emissive: 0x0a5866,
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.05,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
    })
    this.foam = new THREE.MeshStandardMaterial({ color: 0xf2fffd, roughness: 0.6 })

    // A low rolling swell across the track (axis along X), so it reads at the
    // bottom of the screen without hiding the runner from the chase camera.
    const swell = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.7, width, 24, 1, true, 0, Math.PI),
      this.water,
    )
    swell.rotation.z = Math.PI / 2
    swell.position.set(0, 0, 0.8)
    this.crest = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, width, 10), this.foam)
    this.crest.rotation.z = Math.PI / 2
    this.crest.position.set(0, 1.65, 0.4)
    const spray = new THREE.Mesh(new THREE.BoxGeometry(width, 0.35, 1.6), this.foam)
    spray.position.set(0, 0.18, -0.4)
    this.root.add(swell, this.crest, spray)
    this.root.visible = false
    scene.add(this.root)
  }

  /** Places the wave `gap` metres behind the runner (+Z is behind). */
  update(visible: boolean, runnerZ: number, gap: number, elapsed: number): void {
    this.root.visible = visible
    if (!visible) {
      return
    }
    // The chase camera sits ~12 m behind, so the screen's bottom edge is only
    // ~5 m behind the runner. Within 20 m the swell is drawn in that strip,
    // rising from the edge towards the runner as the real gap closes (the HUD
    // shows the exact distance); further away it is off screen anyway.
    const drawn = gap > VISIBLE_GAP ? gap : NEAREST + (gap / VISIBLE_GAP) * (EDGE - NEAREST)
    this.root.position.set(0, GAME_CONFIG.track.topY - 0.2, runnerZ + Math.max(NEAREST, drawn))
    // A slow surge so the swell feels alive.
    this.root.scale.y = 1 + Math.sin(elapsed * 2.1) * 0.08
    this.crest.position.y = 1.65 + Math.sin(elapsed * 3.3) * 0.08
  }

  dispose(): void {
    this.root.removeFromParent()
    this.root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
      }
    })
    this.water.dispose()
    this.foam.dispose()
  }
}
