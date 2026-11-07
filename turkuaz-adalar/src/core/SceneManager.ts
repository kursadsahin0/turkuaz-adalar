import * as THREE from 'three'
import { RENDER_CONFIG } from '../config/RenderConfig.ts'
import { disposeObject3D } from '../utils/dispose.ts'

/**
 * Owns the scene graph. Environment and gameplay systems add their roots here;
 * lifecycle and GPU-resource cleanup are handled in one place.
 */
export class SceneManager {
  readonly scene: THREE.Scene

  constructor() {
    this.scene = new THREE.Scene()
    this.scene.name = 'Tidelark'
    this.scene.background = new THREE.Color(RENDER_CONFIG.clearColor)
    this.scene.fog = new THREE.Fog(
      RENDER_CONFIG.fogColor,
      RENDER_CONFIG.fogNear,
      RENDER_CONFIG.fogFar,
    )
  }

  add(...objects: THREE.Object3D[]): void {
    this.scene.add(...objects)
  }

  remove(...objects: THREE.Object3D[]): void {
    this.scene.remove(...objects)
  }

  dispose(): void {
    disposeObject3D(this.scene)
    this.scene.clear()
    this.scene.fog = null
    this.scene.background = null
  }
}
