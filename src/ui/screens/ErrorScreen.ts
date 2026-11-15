import { t } from '../../i18n/i18n.ts'
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
    const eyebrow = createEl('p', 'eyebrow', t('error.eyebrow'))
    const title = createEl('h2', 'screen-title', t('error.title'))
    this.message = createEl('p', 'screen-copy', t('error.copy'))

    this.reloadButton = new Button({
      label: t('error.reload'),
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
