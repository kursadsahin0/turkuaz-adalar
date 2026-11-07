import * as THREE from 'three'

/**
 * Close-up "dressing room" camera for the character screen. It orbits the
 * runner's face, turns slowly on its own, and follows drag input. A view
 * offset keeps the runner clear of the docked panel: to the left of it in
 * landscape, above it in portrait.
 */
export class ShowcaseCamera {
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400)

  private angle = 0
  private idle = 0
  private readonly target = new THREE.Vector3()

  /** Character faces -Z, so angle 0 looks at its face. */
  reset(): void {
    this.angle = 0.35
    this.idle = 0
  }

  rotate(deltaPixels: number): void {
    this.angle -= deltaPixels * 0.012
    this.idle = 0
  }

  update(
    delta: number,
    focus: THREE.Vector3,
    width: number,
    height: number,
    reducedMotion: boolean,
  ): void {
    this.idle += delta
    // Resume a gentle turntable a moment after the last drag.
    if (this.idle > 1.5 && !reducedMotion) {
      this.angle += delta * 0.35
    }

    const aspect = Math.max(0.2, width / Math.max(1, height))
    const portrait = aspect < 1
    // Portrait only has the top ~44% of the screen free above the panel.
    const distance = portrait ? 7.6 : 4.3
    this.target.set(focus.x, focus.y + 0.05, focus.z)
    this.camera.position.set(
      focus.x + Math.sin(this.angle) * distance,
      focus.y + 0.45,
      focus.z - Math.cos(this.angle) * distance,
    )
    this.camera.lookAt(this.target)

    this.camera.aspect = aspect
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    if (portrait) {
      this.camera.setViewOffset(w, h, 0, Math.round(h * 0.29), w, h)
    } else {
      this.camera.setViewOffset(w, h, Math.round(w * 0.24), 0, w, h)
    }
    this.camera.updateProjectionMatrix()
  }
}
