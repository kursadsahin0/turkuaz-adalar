import { createEl, createIcon } from '../../utils/dom.ts'
import { t } from '../../i18n/i18n.ts'
import { Button } from '../components/Button.ts'
import { Screen } from './Screen.ts'
import { createPanel } from './screenUtils.ts'

export interface GiftAction {
  readonly label: string
  readonly onClick: () => void
}

export interface GiftData {
  readonly eyebrow: string
  readonly title: string
  /** Large emoji shown in the middle (a chest, a trophy...). */
  readonly icon?: string
  /** An image shown instead of the icon (e.g. the score card). */
  readonly image?: { readonly src: string; readonly alt: string }
  /** Reward chips, e.g. "+250 ●". */
  readonly rewards?: readonly string[]
  readonly text?: string
  /** An optional highlighted offer under the rewards (e.g. a character trial). */
  readonly offer?: { readonly title: string; readonly text: string }
  readonly primary: GiftAction
  readonly secondary?: GiftAction
  /** When set, a ✕ in the corner closes the card (calls this). */
  readonly onClose?: () => void
  /** When set, the icon shakes until the primary button is pressed. */
  readonly sealed?: boolean
}

/**
 * A celebratory card that opens on top of whatever is showing (the run
 * summary, the menu): the welcome chest, a season reward. Content and
 * buttons are given per opening.
 */
export class GiftScreen extends Screen {
  private readonly panel: HTMLDivElement
  private primary: Button | null = null
  private secondary: Button | null = null

  constructor() {
    super('screen--overlay')
    this.root.classList.add('screen--gift')
    this.root.classList.add('screen--dialog')
    this.panel = createPanel('gift-panel')
    this.root.appendChild(this.panel)
  }

  open(data: GiftData): void {
    this.disposeButtons()
    const children: HTMLElement[] = [
      createEl('p', 'eyebrow', data.eyebrow),
      createEl('h2', 'screen-title gift__title', data.title),
    ]
    if (data.image) {
      const image = createEl('img', 'gift__image')
      image.src = data.image.src
      image.alt = data.image.alt
      children.push(image)
    } else if (data.icon) {
      const icon = createEl(
        'div',
        `gift__icon${data.sealed ? ' gift__icon--sealed' : ''}`,
        data.icon,
      )
      icon.setAttribute('aria-hidden', 'true')
      children.push(icon)
    }
    if (data.rewards && data.rewards.length > 0) {
      const rewards = createEl('div', 'gift__rewards')
      for (const reward of data.rewards) {
        rewards.append(createEl('span', 'gift__reward', reward))
      }
      children.push(rewards)
    }
    if (data.text) {
      children.push(createEl('p', 'screen-copy gift__text', data.text))
    }
    if (data.offer) {
      const offer = createEl('div', 'gift__offer')
      offer.append(
        createEl('strong', 'gift__offer-title', data.offer.title),
        createEl('span', 'gift__offer-text', data.offer.text),
      )
      children.push(offer)
    }
    const actions = createEl('div', 'screen-actions')
    this.primary = new Button({ label: data.primary.label, onClick: data.primary.onClick })
    actions.append(this.primary.element)
    if (data.secondary) {
      this.secondary = new Button({
        label: data.secondary.label,
        variant: 'text',
        onClick: data.secondary.onClick,
      })
      actions.append(this.secondary.element)
    }
    children.push(actions)
    if (data.onClose) {
      const close = createEl('button', 'icon-btn gift__close')
      close.type = 'button'
      close.setAttribute('aria-label', t('common.close'))
      close.append(createIcon(['M6 6l12 12', 'M18 6L6 18']))
      close.addEventListener('click', data.onClose)
      children.push(close)
    }
    this.panel.replaceChildren(...children)
    if (this.root.hidden) {
      this.show()
    }
    this.focusWhenVisible(this.primary)
  }

  get isOpen(): boolean {
    return !this.root.hidden
  }

  dispose(): void {
    this.disposeButtons()
    super.dispose()
  }

  private disposeButtons(): void {
    this.primary?.dispose()
    this.secondary?.dispose()
    this.primary = null
    this.secondary = null
  }
}
