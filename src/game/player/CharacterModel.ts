import * as THREE from 'three'
import type { LoadedAsset } from '../../assets/ModelLoader.ts'
import { CharacterDresser, type CharacterAppearance } from '../characters/CharacterAppearance.ts'
import {
  CharacterAnimator,
  type CharacterAnimationState,
  type CharacterAnimatorOptions,
  type CharacterMotion,
} from './CharacterAnimator.ts'

export interface CharacterModelOptions {
  /** Height of the gameplay capsule, in metres. */
  readonly targetHeight: number
  readonly runReferenceSpeed?: number
  readonly animator?: CharacterAnimatorOptions
}

/**
 * A fully self-contained character visual: cloned skeleton, normalised scale,
 * foot pivot at the origin and its own animation controller.
 *
 * The GLB is authored with the origin between the feet. Scaling to the capsule
 * height keeps the visual and collider aligned without changing gameplay code.
 */
export class CharacterModel {
  readonly root = new THREE.Group()
  readonly instance: ReturnType<LoadedAsset['createInstance']>
  readonly animator: CharacterAnimator
  readonly scale: number

  private readonly dresser: CharacterDresser
  private disposed = false

  constructor(asset: LoadedAsset, options: CharacterModelOptions) {
    this.root.name = `Character:${asset.definition.id}`
    this.instance = asset.createInstance({ castShadow: true, receiveShadow: true })

    // Sized by the bodies alone: a wizard's hat or a helmet must not shrink
    // every runner to make room for it.
    const bounds = bodyBounds(this.instance.root) ?? asset.bounds
    const size = bounds.getSize(new THREE.Vector3())
    this.scale = size.y > 0.0001 ? options.targetHeight / size.y : 1

    const center = bounds.getCenter(new THREE.Vector3())
    const min = bounds.min
    const model = this.instance.root
    model.scale.setScalar(this.scale)
    model.position.set(-center.x * this.scale, -min.y * this.scale, -center.z * this.scale)
    this.root.add(model)
    // Must run before the animator so accessories are fitted in the bind pose.
    this.dresser = new CharacterDresser(this.root, model)

    const metadataReference = asset.definition.metadata.runReferenceSpeed
    const reference =
      options.runReferenceSpeed ??
      (typeof metadataReference === 'number' ? metadataReference : 2.8125)

    this.animator = new CharacterAnimator(this.instance, {
      ...options.animator,
      runReferenceSpeed: reference * this.scale,
    })
    this.root.userData.character = true
  }

  get state(): CharacterAnimationState | null {
    return this.animator.state
  }

  get availableStates(): CharacterAnimationState[] {
    return this.animator.availableStates
  }

  update(delta: number, motion: CharacterMotion): void {
    this.animator.update(delta, motion)
  }

  playOutcome(outcome: 'win' | 'lose'): void {
    this.animator.playOutcome(outcome)
  }

  playHit(): void {
    this.animator.playHit()
  }

  /** The runner's own celebration, once, then back to idle. */
  celebrate(): void {
    this.animator.celebrate()
  }

  /** True when the model animates slides itself (no squash needed). */
  get animatesSlide(): boolean {
    return this.animator.hasSlide
  }

  /** Recolours materials and toggles accessories. Purely visual. */
  applyAppearance(appearance: CharacterAppearance): void {
    if (!this.disposed) {
      this.dresser.apply(appearance)
      this.animator.setWinVariant(appearance.model)
      // Scales around the feet (the root's origin), so the runner stays
      // planted on the capsule's base whatever its build.
      this.root.scale.set(appearance.build.width, appearance.build.height, appearance.build.width)
    }
  }

  reset(): void {
    this.animator.reset()
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.animator.dispose()
    this.dresser.dispose()
    this.instance.dispose()
    this.root.removeFromParent()
    this.root.clear()
  }
}

/**
 * Bind-pose bounds of the skinned bodies only (bone-attached props such as
 * hats, helmets and capes are left out), or null when there are none.
 */
function bodyBounds(root: THREE.Object3D): THREE.Box3 | null {
  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3()
  root.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) {
      object.computeBoundingBox()
      if (object.boundingBox) {
        bounds.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld))
      }
    }
  })
  return bounds.isEmpty() ? null : bounds
}
