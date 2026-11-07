import type { PlayerSaveManager } from '../../systems/save/PlayerSaveManager.ts'

export type TutorialStep = 'lane' | 'jump' | 'slide' | 'dash'
export type TutorialAction = TutorialStep

export const TUTORIAL_STEPS: readonly TutorialStep[] = ['lane', 'jump', 'slide', 'dash']

export interface TutorialView {
  readonly step: TutorialStep
  /** 1-based position, for "2 / 4". */
  readonly index: number
  readonly total: number
}

/**
 * First-run tutorial. Each step waits for the player to actually perform the
 * move, so it teaches by doing. State lives in the player save's `tutorial`
 * section, so it shows once and can be replayed from Settings.
 */
export class Tutorial {
  private readonly save: PlayerSaveManager
  private active = false
  private stepIndex = 0

  constructor(save: PlayerSaveManager) {
    this.save = save
  }

  get isActive(): boolean {
    return this.active
  }

  get isCompleted(): boolean {
    return this.save.tutorial.completed
  }

  get view(): TutorialView | null {
    if (!this.active) {
      return null
    }
    return {
      step: TUTORIAL_STEPS[this.stepIndex],
      index: this.stepIndex + 1,
      total: TUTORIAL_STEPS.length,
    }
  }

  /** Starts the tutorial if it has not been completed. Returns whether it did. */
  beginIfNeeded(): boolean {
    this.active = !this.isCompleted
    this.stepIndex = 0
    return this.active
  }

  /**
   * Reports a move. Returns 'advanced' when it finished the current step,
   * 'completed' when it finished the last one, and 'ignored' otherwise.
   */
  notify(action: TutorialAction): 'advanced' | 'completed' | 'ignored' {
    if (!this.active || TUTORIAL_STEPS[this.stepIndex] !== action) {
      return 'ignored'
    }
    const done = TUTORIAL_STEPS.slice(0, this.stepIndex + 1)
    this.stepIndex += 1
    if (this.stepIndex >= TUTORIAL_STEPS.length) {
      this.finish(done)
      return 'completed'
    }
    this.save.updateTutorial({ stepsCompleted: [...done] })
    return 'advanced'
  }

  /** "Skip": counts as done so it is not shown again. */
  skip(): void {
    if (this.active) {
      this.finish(TUTORIAL_STEPS.slice(0, this.stepIndex))
    }
  }

  /** Ends the tutorial for this run only (the run ended mid-tutorial). */
  suspend(): void {
    this.active = false
  }

  /** From Settings: show the tutorial again on the next run. */
  reset(): void {
    this.active = false
    this.stepIndex = 0
    this.save.updateTutorial({ completed: false, completedAt: 0, stepsCompleted: [] })
    this.save.saveNow()
  }

  private finish(done: readonly TutorialStep[]): void {
    this.active = false
    this.save.updateTutorial({
      completed: true,
      completedAt: Date.now(),
      stepsCompleted: [...done],
    })
    this.save.saveNow()
  }
}
