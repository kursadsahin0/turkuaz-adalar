import { getLanguage, t } from '../../i18n/i18n.ts'
import { createEl } from '../../utils/dom.ts'
import { IconButton } from '../components/IconButton.ts'
import { Screen } from './Screen.ts'
import { createPanel, ICON_PATHS } from './screenUtils.ts'

export interface PrivacyPolicyScreenOptions {
  onClose: () => void
}

/**
 * Shows the bundled privacy policy (public/privacy.html) inside the game, so
 * it works offline and never leaves the app. The same file is what gets
 * hosted publicly for the store listing.
 */
export class PrivacyPolicyScreen extends Screen {
  private readonly closeButton: IconButton
  private readonly frame: HTMLIFrameElement

  constructor(options: PrivacyPolicyScreenOptions) {
    super('screen--overlay')
    this.root.classList.add('screen--privacy')

    const panel = createPanel('privacy-panel')
    const top = createEl('div', 'progress__top')
    top.append(createEl('h2', 'screen-title', t('privacy.title')))
    this.closeButton = new IconButton({
      iconPaths: ICON_PATHS.back,
      label: t('common.close'),
      onClick: options.onClose,
      className: 'progress__back',
    })
    top.append(this.closeButton.element)

    this.frame = createEl('iframe', 'privacy__frame')
    this.frame.title = t('privacy.title')
    panel.append(top, this.frame)
    this.root.appendChild(panel)
  }

  show(): void {
    // Relative URL: served from the app bundle on web, Android and iOS.
    this.frame.src = `privacy.html#${getLanguage()}`
    super.show()
    this.closeButton.focus()
  }

  dispose(): void {
    this.closeButton.dispose()
    super.dispose()
  }
}
