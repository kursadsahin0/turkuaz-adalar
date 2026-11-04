import { createEl } from '../../utils/dom.ts'
import { Button } from '../components/Button.ts'
import { formatDistance, formatInteger } from '../format.ts'
import { Screen } from './Screen.ts'
import { createPanel } from './screenUtils.ts'

export interface LevelCompletedData {
  levelName: string
  score: number
  distance: number
  coins: number
  crystals: number
  stars: number
  timeElapsed: number
  isPersonalBest: boolean
  nextLevelAvailable: boolean
}

export interface LevelCompletedScreenOptions {
  onNextLevel: () => void
  onRestart: () => void
  onMenu: () => void
}

/** Screen shown when a level is completed successfully. */
export class LevelCompletedScreen extends Screen {
  private readonly nextLevelButton: Button
  private readonly restartButton: Button
  private readonly menuButton: Button
  private readonly levelName: HTMLHeadingElement
  private readonly scoreValue: HTMLSpanElement
  private readonly distanceValue: HTMLSpanElement
  private readonly coinsValue: HTMLSpanElement
  private readonly crystalsValue: HTMLSpanElement
  private readonly timeValue: HTMLSpanElement
  private readonly starsContainer: HTMLDivElement
  private readonly badge: HTMLSpanElement

  constructor(options: LevelCompletedScreenOptions) {
    super('screen--overlay')
    this.root.classList.add('screen--completed')

    const panel = createPanel('level-completed-panel')

    const eyebrow = createEl('p', 'eyebrow', 'Level complete')
    this.levelName = createEl('h2', 'screen-title', 'Island cleared')

    const hero = createEl('div', 'score-hero')
    const heroLabel = createEl('span', 'score-hero__label', 'Score')
    this.scoreValue = createEl('span', 'score-hero__value', '0')
    this.badge = createEl('span', 'record-badge', 'Personal best')
    this.badge.hidden = true
    hero.append(heroLabel, this.scoreValue, this.badge)

    this.starsContainer = createEl('div', 'level-completed__stars')
    this.starsContainer.innerHTML = '★ ★ ★'

    const grid = createEl('div', 'result-grid')
    const distance = this.createResult('Distance', '0 m')
    const coins = this.createResult('Coins', '0')
    const crystals = this.createResult('Crystals', '0')
    this.distanceValue = distance.value
    this.coinsValue = coins.value
    this.crystalsValue = crystals.value
    grid.append(distance.element, coins.element, crystals.element)

    const time = createEl('div', 'level-completed__time')
    const timeLabel = createEl('span', 'level-completed__time-label', 'Time')
    this.timeValue = createEl('span', 'level-completed__time-value', '0:00')
    time.append(timeLabel, this.timeValue)

    this.nextLevelButton = new Button({
      label: 'Next level',
      onClick: options.onNextLevel,
      className: 'level-completed__next',
    })
    this.restartButton = new Button({
      label: 'Replay',
      variant: 'secondary',
      onClick: options.onRestart,
    })
    this.menuButton = new Button({
      label: 'Level select',
      variant: 'text',
      onClick: options.onMenu,
    })

    const actions = createEl('div', 'screen-actions')
    actions.append(this.nextLevelButton.element, this.restartButton.element, this.menuButton.element)

    panel.append(eyebrow, this.levelName, hero, this.starsContainer, grid, time, actions)
    this.root.appendChild(panel)
  }

  showResult(data: LevelCompletedData): void {
    this.levelName.textContent = data.levelName
    this.scoreValue.textContent = formatInteger(data.score)
    this.distanceValue.textContent = formatDistance(data.distance)
    this.coinsValue.textContent = formatInteger(data.coins)
    this.crystalsValue.textContent = formatInteger(data.crystals)
    this.timeValue.textContent = this.formatTime(data.timeElapsed)
    this.badge.hidden = !data.isPersonalBest

    this.renderStars(data.stars)
    this.nextLevelButton.element.hidden = !data.nextLevelAvailable

    if (!data.nextLevelAvailable) {
      this.nextLevelButton.element.style.display = 'none'
    } else {
      this.nextLevelButton.element.style.display = ''
    }

    this.show()
    this.focusNextButton()
  }

  show(): void {
    super.show()
    this.focusNextButton()
  }

  dispose(): void {
    this.nextLevelButton.dispose()
    this.restartButton.dispose()
    this.menuButton.dispose()
    super.dispose()
  }

  private focusNextButton(): void {
    if (!this.nextLevelButton.element.hidden) {
      this.nextLevelButton.focus()
    } else {
      this.restartButton.focus()
    }
  }

  private renderStars(stars: number): void {
    const starElements = this.starsContainer.children
    for (let i = 0; i < starElements.length; i++) {
      const star = starElements[i] as HTMLElement
      if (i < stars) {
        star.classList.add('star--earned')
        star.textContent = '★'
      } else {
        star.classList.remove('star--earned')
        star.textContent = '☆'
      }
    }
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
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
