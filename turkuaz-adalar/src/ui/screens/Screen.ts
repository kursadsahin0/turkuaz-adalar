import type { Button } from '../components/Button.ts'
import { createScreenRoot } from './screenUtils.ts'

/** Base class for full-screen UI states with explicit show/hide lifecycle. */
export abstract class Screen {
  readonly root: HTMLDivElement

  protected constructor(className: string) {
    this.root = createScreenRoot(className)
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-modal', 'true')
  }

  show(): void {
    this.root.hidden = false
    this.root.setAttribute('aria-hidden', 'false')
  }

  hide(): void {
    this.root.hidden = true
    this.root.setAttribute('aria-hidden', 'true')
  }

  dispose(): void {
    this.root.remove()
  }

  protected focusWhenVisible(button: Button): void {
    if (!this.root.hidden) {
      button.focus()
    }
  }
}
