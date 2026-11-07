import * as THREE from 'three'
import type { ModelInstance } from '../../assets/ModelLoader.ts'
import { Logger } from '../../utils/logger.ts'
import { clamp } from '../../utils/math.ts'

export type CharacterAnimationState =
  'idle' | 'run' | 'jump' | 'fall' | 'land' | 'slide' | 'hit' | 'win' | 'lose'

export interface CharacterMotion {
  readonly grounded: boolean
  readonly verticalVelocity: number
  /** Forward speed in metres per second. */
  readonly speed: number
  readonly dashing?: boolean
  /** Menu / spectator mode: always idle unless an outcome is locked. */
  readonly idle?: boolean
  /** True while the runner slides under an obstacle. */
  readonly sliding?: boolean
  /** Length of the current slide, so the roll fits it. */
  readonly slideDuration?: number
}

export interface CharacterAnimatorOptions {
  /**
   * Ground speed at which the authored Run cycle covers exactly one stride.
   * The character model is scaled to the gameplay capsule, so this follows the
   * GLB metadata and the measured 2.8125 m/s reference.
   */
  readonly runReferenceSpeed?: number
  readonly fades?: Partial<Record<CharacterAnimationState, number>>
}

const CLIP_NAMES: Record<CharacterAnimationState, readonly string[]> = {
  idle: ['Idle'],
  run: ['Run'],
  jump: ['Jump', 'Airborne'],
  fall: ['Fall', 'Airborne'],
  land: ['Land'],
  slide: ['Slide'],
  hit: ['Hit'],
  win: ['Win'],
  lose: ['Lose'],
}

const DEFAULT_FADES: Record<CharacterAnimationState, number> = {
  idle: 0.25,
  run: 0.18,
  jump: 0.12,
  fall: 0.2,
  land: 0.08,
  slide: 0.06,
  hit: 0.06,
  win: 0.22,
  lose: 0.22,
}

const LOOPING = new Set<CharacterAnimationState>(['idle', 'run', 'fall'])

const FALLBACKS: Partial<Record<CharacterAnimationState, CharacterAnimationState>> = {
  jump: 'fall',
  fall: 'idle',
  land: 'run',
  slide: 'run',
  hit: 'run',
  run: 'idle',
  win: 'idle',
  lose: 'idle',
}

/**
 * Drives a cloned character through Idle / Run / Jump / Fall / Land / Win /
 * Lose. All transitions use AnimationAction cross-fades, and every clone gets
 * its own mixer, so two runners never share playback state.
 */
export class CharacterAnimator {
  private readonly instance: ModelInstance
  private readonly mixer: THREE.AnimationMixer
  private readonly actions = new Map<CharacterAnimationState, THREE.AnimationAction>()
  private readonly fades: Record<CharacterAnimationState, number>
  private readonly runReferenceSpeed: number
  private readonly logger = new Logger('CharacterAnimator')
  private readonly warned = new Set<CharacterAnimationState>()

  private currentState: CharacterAnimationState | null = null
  private currentAction: THREE.AnimationAction | null = null
  private locked: 'win' | 'lose' | null = null
  private landTimer = 0
  /** Remaining time of a one-shot stagger (shield absorbed a hit). */
  private hitTimer = 0
  /** Per-runner celebrations ("Win_<model>" clips); the shared Win is the default. */
  private readonly winVariants = new Map<string, THREE.AnimationAction>()
  private defaultWin: THREE.AnimationAction | null = null
  /** A showcase celebration returns to idle once it has played. */
  private celebrateTimer = 0
  private wasGrounded = true
  private disposed = false

  constructor(instance: ModelInstance, options: CharacterAnimatorOptions = {}) {
    this.instance = instance
    this.mixer = instance.createMixer()
    this.fades = { ...DEFAULT_FADES, ...options.fades }
    this.runReferenceSpeed = Math.max(0.1, options.runReferenceSpeed ?? 2.8125)

    const clips = new Map(instance.animations.map((clip) => [clip.name, clip]))
    for (const state of Object.keys(CLIP_NAMES) as CharacterAnimationState[]) {
      const clip = this.findClip(clips, state)
      if (!clip) {
        this.logger.warn(
          `Missing clip for state "${state}" (looked for ${CLIP_NAMES[state].join(', ')}). ` +
            'That state will fall back to a safe clip.',
        )
        continue
      }

      const action = this.mixer.clipAction(clip)
      action.enabled = true
      if (LOOPING.has(state)) {
        action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY)
      } else {
        action.setLoop(THREE.LoopOnce, 1)
        action.clampWhenFinished = true
      }
      this.actions.set(state, action)
    }

    this.defaultWin = this.actions.get('win') ?? null
    for (const [name, clip] of clips) {
      if (name.startsWith('Win_')) {
        const action = this.mixer.clipAction(clip)
        action.setLoop(THREE.LoopOnce, 1)
        action.clampWhenFinished = true
        this.winVariants.set(name.slice(4), action)
      }
    }

    this.playState('idle', 0, true)
  }

  /** Picks the celebration of the runner being shown (falls back to Win). */
  setWinVariant(model: string): void {
    const action = this.winVariants.get(model) ?? this.defaultWin
    if (action) {
      this.actions.set('win', action)
    }
  }

  /** Plays the celebration once (character screen), then returns to idle. */
  celebrate(): void {
    const win = this.actions.get('win')
    if (this.disposed || !win) {
      return
    }
    this.playOutcome('win')
    this.celebrateTimer = win.getClip().duration + 0.15
  }

  get state(): CharacterAnimationState | null {
    return this.currentState
  }

  get lockedOutcome(): 'win' | 'lose' | null {
    return this.locked
  }

  get availableStates(): CharacterAnimationState[] {
    return [...this.actions.keys()]
  }

  update(delta: number, motion: CharacterMotion): void {
    if (this.disposed) {
      return
    }

    if (this.locked) {
      this.mixer.update(delta)
      if (this.celebrateTimer > 0) {
        this.celebrateTimer -= delta
        if (this.celebrateTimer <= 0) {
          this.releaseOutcome()
        }
      }
      return
    }

    if (this.landTimer > 0) {
      this.landTimer = Math.max(0, this.landTimer - delta)
    }
    if (this.hitTimer > 0) {
      this.hitTimer = Math.max(0, this.hitTimer - delta)
    }

    const grounded = motion.idle ? true : motion.grounded
    const justLanded = !motion.idle && grounded && !this.wasGrounded
    this.wasGrounded = grounded

    if (justLanded) {
      const land = this.actions.get('land')
      if (land) {
        this.landTimer = Math.max(0.18, land.getClip().duration * 0.85)
        this.playState('land', this.fades.land, true)
      }
    }

    const next = this.chooseState(motion)
    const entering = next !== this.currentState
    this.playState(next, this.fades[next])
    if (entering && next === 'slide') {
      // Fit the roll to the slide so the runner stands up as the slide ends.
      const slide = this.actions.get('slide')
      const duration = motion.slideDuration ?? 0
      if (slide && duration > 0) {
        slide.setEffectiveTimeScale(clamp(slide.getClip().duration / duration, 0.4, 2))
      }
    }

    const run = this.actions.get('run')
    if (run) {
      const rate = motion.dashing ? 1.25 : 1
      run.setEffectiveTimeScale(clamp((motion.speed / this.runReferenceSpeed) * rate, 0.7, 2.5))
    }

    this.mixer.update(delta)
  }

  /** A short stagger that does not end the run (e.g. a shield absorbed a hit). */
  playHit(): void {
    const hit = this.actions.get('hit')
    if (this.disposed || this.locked || !hit) {
      return
    }
    this.hitTimer = hit.getClip().duration * 0.8
    this.playState('hit', this.fades.hit, true)
  }

  /** Whether a dedicated slide clip exists (the model then animates the slide itself). */
  get hasSlide(): boolean {
    return this.actions.has('slide')
  }

  /** Locks the character in a one-shot celebration or defeat pose. */
  playOutcome(outcome: 'win' | 'lose'): void {
    if (this.disposed) {
      return
    }
    this.locked = outcome
    this.landTimer = 0
    this.celebrateTimer = 0
    this.playState(outcome, this.fades[outcome], true)
  }

  /** Clears Win/Lose and returns to the locomotion state. */
  releaseOutcome(): void {
    if (!this.locked) {
      return
    }
    this.locked = null
    this.currentState = null
    this.playState('idle', this.fades.idle, true)
  }

  reset(): void {
    if (this.disposed) {
      return
    }
    this.mixer.stopAllAction()
    this.locked = null
    this.landTimer = 0
    this.hitTimer = 0
    this.celebrateTimer = 0
    this.wasGrounded = true
    this.currentState = null
    this.currentAction = null
    this.playState('idle', 0, true)
    this.mixer.update(0)
  }

  getActionWeight(state: CharacterAnimationState): number {
    return this.actions.get(state)?.getEffectiveWeight() ?? 0
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.instance.root)
    this.actions.clear()
  }

  private chooseState(motion: CharacterMotion): CharacterAnimationState {
    if (motion.idle) {
      return 'idle'
    }
    if (motion.sliding && motion.grounded) {
      return 'slide'
    }
    if (this.hitTimer > 0) {
      return 'hit'
    }
    if (this.landTimer > 0) {
      return 'land'
    }
    if (!motion.grounded) {
      return motion.verticalVelocity > 0.75 ? 'jump' : 'fall'
    }
    return motion.speed > 0.2 ? 'run' : 'idle'
  }

  private playState(requested: CharacterAnimationState, fade: number, restart = false): void {
    const state = this.resolveState(requested)
    if (!state) {
      return
    }
    if (state === this.currentState && !restart) {
      return
    }

    const action = this.actions.get(state)
    if (!action) {
      return
    }

    const previous = this.currentAction
    action.reset()
    action.enabled = true
    action.setEffectiveWeight(1)
    action.setEffectiveTimeScale(1)
    action.play()

    if (previous && previous !== action) {
      previous.crossFadeTo(action, Math.max(0.01, fade), false)
    } else if (fade > 0) {
      action.fadeIn(fade)
    }

    this.currentState = state
    this.currentAction = action
  }

  private resolveState(state: CharacterAnimationState, depth = 0): CharacterAnimationState | null {
    if (this.actions.has(state)) {
      return state
    }
    const fallback = FALLBACKS[state]
    if (!fallback || depth > 4) {
      if (!this.warned.has(state)) {
        this.warned.add(state)
        this.logger.warn(`No playable action for state "${state}" and no fallback exists.`)
      }
      return null
    }
    return this.resolveState(fallback, depth + 1)
  }

  private findClip(
    clips: Map<string, THREE.AnimationClip>,
    state: CharacterAnimationState,
  ): THREE.AnimationClip | null {
    for (const name of CLIP_NAMES[state]) {
      const clip = clips.get(name)
      if (clip) {
        return clip
      }
    }
    return null
  }
}
