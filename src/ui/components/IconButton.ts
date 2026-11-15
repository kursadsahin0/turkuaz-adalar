import { createEl, createIcon } from '../../utils/dom.ts'

export interface IconButtonOptions {
  iconPaths: readonly string[]
  label: string
  onClick: () => void
  className?: string
}

/** Circular icon-only button for pause, audio and other compact controls. */
export class IconButton {
  readonly element: HTMLButtonElement

  private readonly onClick: () => void
  private readonly handleClick = (): void => {
    this.onClick()
  }

  constructor(options: IconButtonOptions) {
    this.onClick = options.onClick
    this.element = createEl('button', 'icon-btn')
    this.element.type = 'button'
    this.element.setAttribute('aria-label', options.label)
    this.element.appendChild(createIcon(options.iconPaths))
    if (options.className) {
      this.element.classList.add(options.className)
    }
    this.element.addEventListener('click', this.handleClick)
  }

  setIcon(paths: readonly string[], label: string): void {
    this.element.replaceChildren(createIcon(paths))
    this.element.setAttribute('aria-label', label)
  }

  focus(): void {
    this.element.focus()
  }

  dispose(): void {
    this.element.removeEventListener('click', this.handleClick)
    this.element.remove()
  }
}
