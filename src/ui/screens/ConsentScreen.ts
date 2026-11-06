import { t } from '../../i18n/i18n.ts'
import { createEl } from '../../utils/dom.ts'
import { Button } from '../components/Button.ts'
import { Screen } from './Screen.ts'
import { createPanel } from './screenUtils.ts'

export interface ConsentScreenOptions {
  onAccept: () => void
  onEssentialOnly: () => void
  onOpenPolicy: () => void
}

/**
 * First-launch privacy prompt. Both choices are equally easy to pick and the
 * game is fully playable either way; only the ad type differs.
 */
export class ConsentScreen extends Screen {
  private readonly acceptButton: Button
  private readonly essentialButton: Button
  private readonly policyButton: Button

  constructor(options: ConsentScreenOptions) {
    super('screen--overlay')
    this.root.classList.add('screen--consent')

    const panel = createPanel('consent-panel')
    const eyebrow = createEl('p', 'eyebrow', t('consent.eyebrow'))
    const title = createEl('h2', 'screen-title', t('consent.title'))
    const copy = createEl('p', 'screen-copy', t('consent.copy'))
    const list = createEl('ul', 'consent__list')
    for (const key of [
      'consent.point.saves',
      'consent.point.ads',
      'consent.point.change',
    ] as const) {
      list.append(createEl('li', '', t(key)))
    }

    this.acceptButton = new Button({ label: t('consent.accept'), onClick: options.onAccept })
    this.essentialButton = new Button({
      label: t('consent.essential'),
      variant: 'secondary',
      onClick: options.onEssentialOnly,
    })
    this.policyButton = new Button({
      label: t('consent.policy'),
      variant: 'text',
      onClick: options.onOpenPolicy,
    })
    const actions = createEl('div', 'screen-actions')
    actions.append(this.acceptButton.element, this.essentialButton.element)

    panel.append(eyebrow, title, copy, list, actions, this.policyButton.element)
    this.root.appendChild(panel)
  }

  show(): void {
    super.show()
    this.focusWhenVisible(this.acceptButton)
  }

  dispose(): void {
    this.acceptButton.dispose()
    this.essentialButton.dispose()
    this.policyButton.dispose()
    super.dispose()
  }
}
