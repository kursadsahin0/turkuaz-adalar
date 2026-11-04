import { createEl } from '../../utils/dom.ts'
import { Button } from '../components/Button.ts'
import { Screen } from './Screen.ts'
import { createPanel } from './screenUtils.ts'

export interface PauseScreenOptions {
  onResume: () => void
  onQuit: () => void
  onToggleMute: () => void
}

/** Pause overlay shown for manual pauses and tab visibility changes. */
export class PauseScreen extends Screen {
  private readonly resumeButton: Button
  private readonly quitButton: Button
  private readonly audioButton: Button

  constructor(options: PauseScreenOptions) {
    super('screen--pause')
    this.root.classList.add('screen--overlay')

    const panel = createPanel('pause-panel')
    const eyebrow = createEl('p', 'eyebrow', 'Run paused')
    const title = createEl('h2', 'screen-title', 'Take a breath')
    const copy = createEl(
      'p',
      'screen-copy',
      'The islands will wait. Resume when you are ready for the next stretch of tide.',
    )

    this.resumeButton = new Button({
      label: 'Resume run',
      onClick: options.onResume,
    })
    this.quitButton = new Button({
      label: 'End run',
      variant: 'secondary',
      onClick: options.onQuit,
    })
    this.audioButton = new Button({
      label: 'Sound: On',
      variant: 'text',
      onClick: options.onToggleMute,
    })

    const actions = createEl('div', 'screen-actions')
    actions.append(this.resumeButton.element, this.quitButton.element)

    panel.append(eyebrow, title, copy, actions, this.audioButton.element)
    this.root.appendChild(panel)
  }

  setMuted(muted: boolean): void {
    this.audioButton.setLabel(muted ? 'Sound: Off' : 'Sound: On')
  }

  show(): void {
    super.show()
    this.focusWhenVisible(this.resumeButton)
  }

  dispose(): void {
    this.resumeButton.dispose()
    this.quitButton.dispose()
    this.audioButton.dispose()
    super.dispose()
  }
}
