import { t } from '../../i18n/i18n.ts'
import { createEl } from '../../utils/dom.ts'
import { Button } from '../components/Button.ts'
import { formatInteger } from '../format.ts'
import { Screen } from './Screen.ts'
import { createPanel } from './screenUtils.ts'

export interface ContinueScreenOptions {
  onPayCoins: () => void
  onWatchAd: () => void
  onSkip: () => void
}

export interface ContinueOffer {
  readonly cost: number
  readonly canAfford: boolean
  readonly adAvailable: boolean
  /** Seconds before the offer expires on its own. */
  readonly seconds: number
}

/**
 * "Second chance" offer shown after a crash. It counts down and declines by
 * itself, so an idle player still reaches the summary screen.
 */
export class ContinueScreen extends Screen {
  private readonly coinButton: Button
  private readonly adButton: Button
  private readonly skipButton: Button
  private readonly timerFill: HTMLDivElement
  private readonly status: HTMLParagraphElement
  private readonly options: ContinueScreenOptions
  private deadline = 0
  private duration = 1
  private frame: number | null = null
  private busy = false
  private canAfford = false

  private readonly tick = (): void => {
    this.frame = null
    if (this.root.hidden) {
      return
    }
    if (!this.busy) {
      const remaining = Math.max(0, this.deadline - performance.now())
      this.timerFill.style.transform = `scaleX(${remaining / this.duration})`
      if (remaining <= 0) {
        this.options.onSkip()
        return
      }
    }
    this.frame = window.requestAnimationFrame(this.tick)
  }

  constructor(options: ContinueScreenOptions) {
    super('screen--overlay')
    this.root.classList.add('screen--continue')
    this.root.classList.add('screen--dialog')
    this.options = options

    const panel = createPanel('continue-panel')
    const eyebrow = createEl('p', 'eyebrow', t('continue.eyebrow'))
    const title = createEl('h2', 'screen-title', t('continue.title'))
    const copy = createEl('p', 'screen-copy', t('continue.copy'))
    const timer = createEl('div', 'continue__timer')
    this.timerFill = createEl('div', 'continue__timer-fill')
    timer.append(this.timerFill)
    this.status = createEl('p', 'continue__status', '')

    this.coinButton = new Button({ label: '', onClick: options.onPayCoins })
    this.adButton = new Button({
      label: `▶ ${t('continue.ad')}`,
      variant: 'secondary',
      onClick: options.onWatchAd,
    })
    this.skipButton = new Button({
      label: t('continue.skip'),
      variant: 'text',
      onClick: options.onSkip,
    })
    const actions = createEl('div', 'screen-actions')
    actions.append(this.coinButton.element, this.adButton.element, this.skipButton.element)

    panel.append(eyebrow, title, copy, timer, this.status, actions)
    this.root.appendChild(panel)
  }

  offer(offer: ContinueOffer): void {
    this.busy = false
    this.canAfford = offer.canAfford
    this.duration = offer.seconds * 1000
    this.deadline = performance.now() + this.duration
    this.status.textContent = offer.canAfford ? '' : t('continue.notEnough')
    this.coinButton.setLabel(t('continue.coins', { cost: formatInteger(offer.cost) }))
    this.coinButton.setDisabled(!offer.canAfford)
    this.adButton.setLabel(offer.adAvailable ? `▶ ${t('continue.ad')}` : t('continue.adUsed'))
    this.adButton.setDisabled(!offer.adAvailable)
    this.skipButton.setDisabled(false)
    this.show()
    if (this.frame === null) {
      this.frame = window.requestAnimationFrame(this.tick)
    }
  }

  /** Freezes the countdown and buttons while an ad plays. */
  setAdPlaying(playing: boolean, failed = false): void {
    this.busy = playing
    this.status.textContent = playing
      ? t('continue.adPlaying')
      : failed
        ? t('continue.adFailed')
        : ''
    this.coinButton.setDisabled(playing || !this.canAfford)
    this.adButton.setDisabled(playing || failed)
    this.skipButton.setDisabled(playing)
    if (!playing) {
      // Give the player a fresh moment to decide after the ad.
      this.deadline = performance.now() + this.duration
    }
  }

  show(): void {
    super.show()
    this.focusWhenVisible(this.coinButton.element.disabled ? this.skipButton : this.coinButton)
  }

  hide(): void {
    super.hide()
    if (this.frame !== null) {
      window.cancelAnimationFrame(this.frame)
      this.frame = null
    }
  }

  dispose(): void {
    this.hide()
    this.coinButton.dispose()
    this.adButton.dispose()
    this.skipButton.dispose()
    super.dispose()
  }
}
