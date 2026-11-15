import { t } from '../../i18n/i18n.ts'
import { createEl, createIcon } from '../../utils/dom.ts'
import { DoubleCoinsButton, type DoubleCoinsOffer } from '../components/DoubleCoinsButton.ts'
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
  /** Star goals still open, new unlocks, completed missions... */
  notes?: readonly string[]
  /** Rewarded ad offer to double the run's coins. */
  doubleCoins?: DoubleCoinsOffer
}

export interface LevelCompletedScreenOptions {
  onNextLevel: () => void
  onRestart: () => void
  onMenu: () => void
  onDoubleCoins: () => void
  onShare: () => void
}

const STAR_PATH =
  'M12 2.6l2.83 5.94 6.5.83-4.78 4.5 1.22 6.45L12 17.18l-5.77 3.14 1.22-6.45-4.78-4.5 6.5-.83z'
const SHARE_PATHS = [
  'M12 15V3',
  'M7.5 7.5L12 3l4.5 4.5',
  'M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12',
]
const STAT_ICONS = {
  distance: ['M4 20l5-16', 'M20 20l-5-16', 'M12 6v2', 'M12 11v2', 'M12 16v3'],
  coins: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'],
  crystals: ['M12 3l6 6-6 12-6-12 6-6z', 'M6 9h12'],
  time: ['M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M12 9v4l2.5 2', 'M10 2h4'],
} as const

/** Screen shown when a level is completed successfully. */
export class LevelCompletedScreen extends Screen {
  private readonly nextLevelButton: Button
  private readonly shareButton: Button
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
  private readonly notes: HTMLUListElement
  readonly doubleCoins: DoubleCoinsButton

  constructor(options: LevelCompletedScreenOptions) {
    super('screen--overlay')
    this.root.classList.add('screen--completed')
    this.root.classList.add('screen--dialog')

    const panel = createPanel('level-completed-panel')

    // Celebration: three stars over the island name, the middle one larger.
    const hero = createEl('div', 'lc-hero')
    this.starsContainer = createEl('div', 'level-completed__stars')
    this.starsContainer.setAttribute('role', 'img')
    for (let i = 0; i < 3; i += 1) {
      const star = createEl('span', `level-completed__star level-completed__star--${i + 1}`)
      star.append(createIcon([STAR_PATH], { filled: true }))
      this.starsContainer.append(star)
    }
    const eyebrow = createEl('p', 'eyebrow lc-hero__eyebrow', t('levels.complete'))
    this.levelName = createEl('h2', 'screen-title lc-hero__title', t('levels.complete'))
    hero.append(this.starsContainer, eyebrow, this.levelName)

    const score = createEl('div', 'lc-score')
    const scoreLabel = createEl('span', 'lc-score__label', t('common.score'))
    this.scoreValue = createEl('span', 'lc-score__value', '0')
    this.badge = createEl('span', 'record-badge lc-score__badge', t('over.newBest'))
    this.badge.hidden = true
    score.append(scoreLabel, this.scoreValue, this.badge)

    const stats = createEl('div', 'lc-stats')
    const distance = this.createStat('distance', t('common.distance'), '0 m')
    const coins = this.createStat('coins', t('common.coins'), '0')
    const crystals = this.createStat('crystals', t('common.crystals'), '0')
    const time = this.createStat('time', t('levels.time'), '0:00')
    this.distanceValue = distance.value
    this.coinsValue = coins.value
    this.crystalsValue = crystals.value
    this.timeValue = time.value
    stats.append(distance.element, coins.element, crystals.element, time.element)

    this.nextLevelButton = new Button({
      label: t('levels.next'),
      onClick: options.onNextLevel,
      className: 'level-completed__next',
    })
    this.restartButton = new Button({
      label: t('levels.replay'),
      variant: 'secondary',
      onClick: options.onRestart,
      className: 'lc-actions__half',
    })
    this.menuButton = new Button({
      label: t('levels.select'),
      variant: 'secondary',
      onClick: options.onMenu,
      className: 'lc-actions__half',
    })
    this.shareButton = new Button({
      label: t('share.button'),
      variant: 'text',
      onClick: options.onShare,
      className: 'lc-share',
    })
    this.shareButton.element.prepend(createIcon(SHARE_PATHS, { size: 16 }))

    const pair = createEl('div', 'lc-actions__pair')
    pair.append(this.restartButton.element, this.menuButton.element)
    const actions = createEl('div', 'screen-actions lc-actions')
    actions.append(this.nextLevelButton.element, pair, this.shareButton.element)

    this.notes = createEl('ul', 'gameover__notices level-completed__notes')
    this.doubleCoins = new DoubleCoinsButton(options.onDoubleCoins)
    this.doubleCoins.element.classList.add('lc-double')
    panel.append(hero, score, stats, this.notes, this.doubleCoins.element, actions)
    this.root.appendChild(panel)
  }

  showResult(data: LevelCompletedData): void {
    this.doubleCoins.offer(data.doubleCoins)
    this.levelName.textContent = data.levelName
    this.scoreValue.textContent = formatInteger(data.score)
    this.distanceValue.textContent = formatDistance(data.distance)
    this.coinsValue.textContent = formatInteger(data.coins)
    this.crystalsValue.textContent = formatInteger(data.crystals)
    this.timeValue.textContent = this.formatTime(data.timeElapsed)
    this.badge.hidden = !data.isPersonalBest

    this.renderStars(data.stars)
    this.starsContainer.setAttribute('aria-label', t('levels.starsLabel', { stars: data.stars }))
    const notes = data.notes ?? []
    this.notes.replaceChildren(...notes.map((text) => createEl('li', 'gameover__notice', text)))
    this.notes.hidden = notes.length === 0
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
    this.shareButton.dispose()
    this.doubleCoins.dispose()
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
      starElements[i].classList.toggle('star--earned', i < stars)
    }
    // Restart the pop-in so every result celebrates again.
    this.starsContainer.classList.remove('is-animating')
    void this.starsContainer.offsetWidth
    this.starsContainer.classList.add('is-animating')
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  private createStat(
    kind: 'distance' | 'coins' | 'crystals' | 'time',
    label: string,
    initial: string,
  ): { element: HTMLDivElement; value: HTMLSpanElement } {
    const element = createEl('div', `lc-stat lc-stat--${kind}`)
    const icon = createEl('span', 'lc-stat__icon')
    icon.append(createIcon(STAT_ICONS[kind], { size: 16, filled: kind === 'coins' }))
    const value = createEl('span', 'lc-stat__value', initial)
    const caption = createEl('span', 'lc-stat__label', label)
    element.append(icon, value, caption)
    return { element, value }
  }
}
