import type { Tutorial, TutorialAction } from '../../game/tutorial/Tutorial.ts'
import { t, type StringKey } from '../../i18n/i18n.ts'
import { celebrate, type GameServices } from './GameServices.ts'

/**
 * Drives the first-run tutorial: starts it, advances it from player actions,
 * keeps the on-screen prompt current and switches obstacles back on when it
 * ends.
 */
export class TutorialController {
  /** Lane at the last frame, to notice the lane-change step. */
  private lane = 0
  private readonly coarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches

  private readonly services: GameServices
  private readonly tutorial: Tutorial
  private readonly setObstaclesEnabled: (enabled: boolean) => void

  constructor(
    services: GameServices,
    tutorial: Tutorial,
    setObstaclesEnabled: (enabled: boolean) => void,
  ) {
    this.services = services
    this.tutorial = tutorial
    this.setObstaclesEnabled = setObstaclesEnabled
  }

  get isActive(): boolean {
    return this.tutorial.isActive
  }

  /** Called as a run starts; returns true when this run is a tutorial run. */
  beginRun(): boolean {
    // First run: a calm, obstacle-free tutorial stretch.
    const tutorialRun = this.tutorial.beginIfNeeded()
    this.setObstaclesEnabled(!tutorialRun)
    return tutorialRun
  }

  /** Called once the runner is placed, so the prompt and lane are current. */
  runStarted(laneIndex: number, tutorialRun: boolean): void {
    this.lane = laneIndex
    this.refresh()
    if (tutorialRun) {
      this.services.telemetry.track('tutorial_start')
    }
  }

  /** Per-frame lane tracking for the "change lane" step. */
  trackLane(laneIndex: number): void {
    if (this.tutorial.isActive && laneIndex !== this.lane) {
      this.action('lane')
    }
    this.lane = laneIndex
  }

  action(action: TutorialAction): void {
    const result = this.tutorial.notify(action)
    if (result === 'advanced') {
      this.services.audio?.play('ui')
      this.services.haptics.pulse('ui')
      this.refresh()
    } else if (result === 'completed') {
      celebrate(this.services)
      this.services.ui.pushFeedback(t('tutorial.done'), 'reward')
      this.end('completed')
      this.services.telemetry.track('tutorial_complete')
    }
  }

  /** Replays the tutorial on the next run (from Settings). */
  replay(): void {
    this.tutorial.reset()
  }

  /** Hides the tutorial and brings obstacles back for segments still to spawn. */
  end(reason: 'skip' | 'suspend' | 'completed'): void {
    if (reason === 'skip') {
      if (!this.tutorial.isActive) {
        return
      }
      this.tutorial.skip()
      this.services.telemetry.track('tutorial_skip')
    } else if (reason === 'suspend') {
      if (!this.tutorial.isActive) {
        return
      }
      this.tutorial.suspend()
    }
    this.setObstaclesEnabled(true)
    this.services.ui.setTutorial(null)
  }

  private refresh(): void {
    const view = this.tutorial.view
    if (!view) {
      this.services.ui.setTutorial(null)
      return
    }
    const input = this.coarsePointer ? 'touch' : 'keys'
    this.services.ui.setTutorial({
      text: t(`tutorial.${view.step}.${input}` as StringKey),
      progress: t('tutorial.progress', { index: view.index, total: view.total }),
    })
  }
}
