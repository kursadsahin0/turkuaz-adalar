import { t } from '../../i18n/i18n.ts'
import { createEl } from '../../utils/dom.ts'
import { DoubleCoinsButton, type DoubleCoinsOffer } from '../components/DoubleCoinsButton.ts'
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
  /** Missions and achievements completed by this run. */
  notices?: readonly string[]
  /** Rewarded ad offer to double the run's coins. */
  doubleCoins?: DoubleCoinsOffer
}

export interface GameOverScreenOptions {
  onRestart: () => void
  onQuit: () => void
  onDoubleCoins: () => void
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
  private readonly noticeList: HTMLUListElement
  readonly doubleCoins: DoubleCoinsButton

  constructor(options: GameOverScreenOptions) {
    super('screen--gameover')
    this.root.classList.add('screen--overlay')

    const panel = createPanel('gameover-panel')
    const eyebrow = createEl('p', 'eyebrow', t('over.eyebrow'))
    this.title = createEl('h2', 'screen-title', t('over.title'))

    const hero = createEl('div', 'score-hero')
    const heroLabel = createEl('span', 'score-hero__label', t('common.score'))
    this.scoreValue = createEl('span', 'score-hero__value', '0')
    this.badge = createEl('span', 'record-badge', t('over.newBest'))
    this.badge.hidden = true
    hero.append(heroLabel, this.scoreValue, this.badge)

    const grid = createEl('div', 'result-grid')
    const distance = this.createResult(t('common.distance'), '0 m')
    const crystals = this.createResult(t('common.crystals'), '0')
    const best = this.createResult(t('over.best'), '0')
    this.distanceValue = distance.value
    this.crystalsValue = crystals.value
    this.bestValue = best.value
    grid.append(distance.element, crystals.element, best.element)

    this.note = createEl('p', 'record-note', t('over.noteDefault'))

    this.restartButton = new Button({
      label: t('over.again'),
      onClick: options.onRestart,
    })
    this.menuButton = new Button({
      label: t('over.menu'),
      variant: 'secondary',
      onClick: options.onQuit,
    })
    const actions = createEl('div', 'screen-actions')
    actions.append(this.restartButton.element, this.menuButton.element)

    this.noticeList = createEl('ul', 'gameover__notices')
    this.doubleCoins = new DoubleCoinsButton(options.onDoubleCoins)
    panel.append(
      eyebrow,
      this.title,
      hero,
      grid,
      this.note,
      this.noticeList,
      this.doubleCoins.element,
      actions,
    )
    this.root.appendChild(panel)
  }

  showResult(summary: GameOverSummary): void {
    this.title.textContent = summary.isBestScore ? t('over.titleBest') : t('over.title')
    this.scoreValue.textContent = formatInteger(summary.score)
    this.distanceValue.textContent = formatDistance(summary.distance)
    this.crystalsValue.textContent = formatInteger(summary.crystals)
    this.bestValue.textContent = formatInteger(summary.bestScore)
    this.badge.hidden = !(summary.isBestScore || summary.isBestDistance)

    if (summary.isBestScore && summary.isBestDistance) {
      this.note.textContent = t('over.noteBoth')
    } else if (summary.isBestScore) {
      this.note.textContent = t('over.noteScore')
    } else if (summary.isBestDistance) {
      this.note.textContent = t('over.noteDistance')
    } else {
      this.note.textContent = t('over.noteSoFar', {
        distance: formatDistance(summary.bestDistance),
      })
    }

    this.noticeList.replaceChildren(
      ...(summary.notices ?? []).map((text) => createEl('li', 'gameover__notice', `★ ${text}`)),
    )
    this.noticeList.hidden = (summary.notices ?? []).length === 0
    this.doubleCoins.offer(summary.doubleCoins)

    this.show()
  }

  show(): void {
    super.show()
    this.focusWhenVisible(this.restartButton)
  }

  dispose(): void {
    this.restartButton.dispose()
    this.menuButton.dispose()
    this.doubleCoins.dispose()
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
