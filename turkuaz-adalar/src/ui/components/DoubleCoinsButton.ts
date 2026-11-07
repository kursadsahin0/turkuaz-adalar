import { t } from '../../i18n/i18n.ts'
import { formatInteger } from '../format.ts'
import { Button } from './Button.ts'

/** What the run summary offers: watch an ad to double this run's coins. */
export interface DoubleCoinsOffer {
  /** Coins collected in the run; the reward adds the same amount again. */
  readonly coins: number
  /** False when no ad can be shown (no consent yet, offline, already used). */
  readonly available: boolean
}

export type DoubleCoinsState = 'idle' | 'playing' | 'done' | 'failed'

/**
 * "▶ Watch an ad: double your coins (+N)". Shared by the game-over and
 * island-complete screens; hidden when there is nothing to double.
 */
export class DoubleCoinsButton {
  readonly button: Button
  private coins = 0

  constructor(onWatch: () => void) {
    this.button = new Button({
      label: '',
      variant: 'secondary',
      className: 'double-coins',
      onClick: onWatch,
    })
    this.button.element.hidden = true
  }

  get element(): HTMLButtonElement {
    return this.button.element
  }

  offer(offer: DoubleCoinsOffer | null | undefined): void {
    this.coins = offer?.coins ?? 0
    this.element.hidden = !offer || !offer.available || offer.coins <= 0
    this.setState('idle')
  }

  setState(state: DoubleCoinsState): void {
    const coins = formatInteger(this.coins)
    this.element.dataset.state = state
    switch (state) {
      case 'idle':
        this.button.setLabel(t('double.offer', { coins }))
        this.button.setDisabled(false)
        break
      case 'playing':
        this.button.setLabel(t('double.playing'))
        this.button.setDisabled(true)
        break
      case 'done':
        this.button.setLabel(t('double.done', { coins }))
        this.button.setDisabled(true)
        break
      case 'failed':
        this.button.setLabel(t('double.failed'))
        this.button.setDisabled(false)
        break
    }
  }

  dispose(): void {
    this.button.dispose()
  }
}
