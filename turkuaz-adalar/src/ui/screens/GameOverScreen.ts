import { createEl } from '../../utils/dom.ts'
import { Button } from '../components/Button.ts'
import { formatDistance, formatInteger } from '../format.ts'
import { Screen } from './Screen.ts'
import { createPanel } from './screenUtils.ts'

export interface GameOverSummary {
  score: number
  distance: number
  crystals: number
  bestScore: number
  bestDistance: number
  isBestScore: boolean
  isBestDistance: boolean
}

export interface GameOverScreenOptions {
  onRestart: () => void
  onQuit: () => void
}

/** Post-run summary with local best indicators. */
export class GameOverScreen extends Screen {
  private readonly restartButton: Button
  private readonly menuButton: Button
  private readonly title: HTMLHeadingElement
  private readonly scoreValue: HTMLSpanElement
  private readonly distanceValue: HTMLSpanElement
  private readonly crystalsValue: HTMLSpanElement
  private readonly bestValue: HTMLSpanElement
  private readonly badge: HTMLSpanElement
  private readonly note: HTMLParagraphElement

  constructor(options: GameOverScreenOptions) {
    super('screen--gameover')
    this.root.classList.add('screen--overlay')

    const panel = createPanel('gameover-panel')
    const eyebrow = createEl('p', 'eyebrow', 'Run complete')
    this.title = createEl('h2', 'screen-title', 'The tide got you')

    const hero = createEl('div', 'score-hero')
    const heroLabel = createEl('span', 'score-hero__label', 'Score')
    this.scoreValue = createEl('span', 'score-hero__value', '0')
    this.badge = createEl('span', 'record-badge', 'New best')
    this.badge.hidden = true
    hero.append(heroLabel, this.scoreValue, this.badge)

    const grid = createEl('div', 'result-grid')
    const distance = this.createResult('Distance', '0 m')
    const crystals = this.createResult('Crystals', '0')
    const best = this.createResult('Best score', '0')
    this.distanceValue = distance.value
    this.crystalsValue = crystals.value
    this.bestValue = best.value
    grid.append(distance.element, crystals.element, best.element)

    this.note = createEl('p', 'record-note', 'The tide remembers every run.')

    this.restartButton = new Button({
      label: 'Run again',
      onClick: options.onRestart,
    })
    this.menuButton = new Button({
      label: 'Island menu',
      variant: 'secondary',
      onClick: options.onQuit,
    })
    const actions = createEl('div', 'screen-actions')
    actions.append(this.restartButton.element, this.menuButton.element)

    panel.append(eyebrow, this.title, hero, grid, this.note, actions)
    this.root.appendChild(panel)
  }

  showResult(summary: GameOverSummary): void {
    this.title.textContent = summary.isBestScore ? 'A new horizon' : 'The tide got you'
    this.scoreValue.textContent = formatInteger(summary.score)
    this.distanceValue.textContent = formatDistance(summary.distance)
    this.crystalsValue.textContent = formatInteger(summary.crystals)
    this.bestValue.textContent = formatInteger(summary.bestScore)
    this.badge.hidden = !(summary.isBestScore || summary.isBestDistance)

    if (summary.isBestScore && summary.isBestDistance) {
      this.note.textContent = 'New best score and distance. The islands are taking notice.'
    } else if (summary.isBestScore) {
      this.note.textContent = 'New best score. Keep chasing the horizon.'
    } else if (summary.isBestDistance) {
      this.note.textContent = 'Farthest run yet. The current is behind you.'
    } else {
      this.note.textContent = `Best run so far: ${formatDistance(summary.bestDistance)}.`
    }

    this.show()
  }

  show(): void {
    super.show()
    this.focusWhenVisible(this.restartButton)
  }

  dispose(): void {
    this.restartButton.dispose()
    this.menuButton.dispose()
    super.dispose()
  }

  private createResult(
    label: string,
    initial: string,
  ): { element: HTMLDivElement; value: HTMLSpanElement } {
    const element = createEl('div', 'result')
    const value = createEl('span', 'result__value', initial)
    const caption = createEl('span', 'result__label', label)
    element.append(value, caption)
    return { element, value }
  }
}
