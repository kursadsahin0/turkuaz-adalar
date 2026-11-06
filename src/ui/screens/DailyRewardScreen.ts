import { t } from '../../i18n/i18n.ts'
import type { DailyStatus, Reward } from '../../systems/meta/DailyRewards.ts'
import { createEl } from '../../utils/dom.ts'
import { Button } from '../components/Button.ts'
import { formatInteger } from '../format.ts'
import { Screen } from './Screen.ts'
import { createPanel } from './screenUtils.ts'

export interface DailyRewardScreenOptions {
  onClaim: () => void
  onClose: () => void
}

/** Seven-day login calendar with a single claim button. */
export class DailyRewardScreen extends Screen {
  private readonly tiles: HTMLDivElement
  private readonly streak: HTMLParagraphElement
  private readonly claimButton: Button
  private readonly closeButton: Button

  constructor(options: DailyRewardScreenOptions) {
    super('screen--overlay')
    this.root.classList.add('screen--daily')

    const panel = createPanel('daily-panel')
    const eyebrow = createEl('p', 'eyebrow', t('daily.eyebrow'))
    const title = createEl('h2', 'screen-title', t('daily.title'))
    this.streak = createEl('p', 'daily__streak', '')
    this.tiles = createEl('div', 'daily__tiles')
    const copy = createEl('p', 'screen-copy daily__copy', t('daily.copy'))

    this.claimButton = new Button({ label: t('daily.claim'), onClick: options.onClaim })
    this.closeButton = new Button({
      label: t('common.close'),
      variant: 'text',
      onClick: options.onClose,
    })
    const actions = createEl('div', 'screen-actions')
    actions.append(this.claimButton.element, this.closeButton.element)

    panel.append(eyebrow, title, this.streak, this.tiles, copy, actions)
    this.root.appendChild(panel)
  }

  setData(status: DailyStatus, rewards: readonly Reward[]): void {
    this.streak.textContent =
      status.streak > 0 ? `🔥 ${t('daily.streak', { days: status.streak })}` : ''
    this.tiles.replaceChildren()
    rewards.forEach((reward, index) => {
      const done = status.canClaim ? index < status.dayIndex : index <= status.dayIndex
      const today = index === status.dayIndex
      const tile = createEl(
        'div',
        `daily-tile${done ? ' daily-tile--done' : ''}${today ? ' daily-tile--today' : ''}${index === rewards.length - 1 ? ' daily-tile--big' : ''}`,
      )
      tile.append(createEl('span', 'daily-tile__day', t('daily.day', { day: index + 1 })))
      tile.append(createEl('span', 'daily-tile__coins', `${formatInteger(reward.coins)} ●`))
      if (reward.crystals > 0) {
        tile.append(createEl('span', 'daily-tile__crystals', `+${reward.crystals} 💎`))
      }
      if (done) {
        tile.append(createEl('span', 'daily-tile__check', '✓'))
      }
      this.tiles.appendChild(tile)
    })
    this.claimButton.setLabel(status.canClaim ? t('daily.claim') : t('daily.claimed'))
    this.claimButton.setDisabled(!status.canClaim)
  }

  show(): void {
    super.show()
    this.focusWhenVisible(this.claimButton.element.disabled ? this.closeButton : this.claimButton)
  }

  dispose(): void {
    this.claimButton.dispose()
    this.closeButton.dispose()
    super.dispose()
  }
}
