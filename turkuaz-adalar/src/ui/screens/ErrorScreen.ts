import { createEl } from '../../utils/dom.ts'
import { Button } from '../components/Button.ts'
import { Screen } from './Screen.ts'
import { createPanel } from './screenUtils.ts'

export interface ErrorScreenOptions {
  onReload: () => void
}

/** Last-resort UI for unrecoverable WebGL, physics or runtime failures. */
export class ErrorScreen extends Screen {
  private readonly message: HTMLParagraphElement
  private readonly reloadButton: Button

  constructor(options: ErrorScreenOptions) {
    super('screen--error')

    const panel = createPanel('error-panel')
    const eyebrow = createEl('p', 'eyebrow', 'Something broke the current')
    const title = createEl('h2', 'screen-title', 'The tide pulled us under')
    this.message = createEl(
      'p',
      'screen-copy',
      'The game could not start. Reload the page to try again.',
    )

    this.reloadButton = new Button({
      label: 'Reload the game',
      onClick: options.onReload,
    })

    panel.append(eyebrow, title, this.message, this.reloadButton.element)
    this.root.appendChild(panel)
  }

  setMessage(message: string): void {
    this.message.textContent = message
  }

  show(): void {
    super.show()
    this.focusWhenVisible(this.reloadButton)
  }

  dispose(): void {
    this.reloadButton.dispose()
    super.dispose()
  }
}
