import { createEl } from '../../utils/dom.ts'

export type ButtonVariant = 'primary' | 'secondary' | 'text'

export interface ButtonOptions {
  label: string
  onClick: () => void
  variant?: ButtonVariant
  className?: string
  ariaLabel?: string
  onHover?: () => void
}

/** Reusable, accessible action button used by every screen. */
export class Button {
  readonly element: HTMLButtonElement

  private readonly onClick: () => void
  private readonly onHover?: () => void
  private readonly handleClick = (): void => {
    this.onClick()
  }
  private readonly handleMouseEnter = (): void => {
    this.onHover?.()
  }

  constructor(options: ButtonOptions) {
    this.onClick = options.onClick
    this.onHover = options.onHover
    this.element = createEl('button', `btn btn--${options.variant ?? 'primary'}`, options.label)
    this.element.type = 'button'
    if (options.className) {
      this.element.classList.add(options.className)
    }
    if (options.ariaLabel) {
      this.element.setAttribute('aria-label', options.ariaLabel)
    }
    this.element.addEventListener('click', this.handleClick)
    if (this.onHover) {
      this.element.addEventListener('mouseenter', this.handleMouseEnter)
    }
  }

  setLabel(label: string): void {
    this.element.textContent = label
  }

  setDisabled(disabled: boolean): void {
    this.element.disabled = disabled
  }

  focus(): void {
    this.element.focus()
  }

  dispose(): void {
    this.element.removeEventListener('click', this.handleClick)
    if (this.onHover) {
      this.element.removeEventListener('mouseenter', this.handleMouseEnter)
    }
    this.element.remove()
  }
}
