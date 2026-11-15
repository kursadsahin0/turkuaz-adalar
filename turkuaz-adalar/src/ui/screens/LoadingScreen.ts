import { t } from '../../i18n/i18n.ts'
import { clamp } from '../../utils/math.ts'
import { createEl } from '../../utils/dom.ts'
import { Screen } from './Screen.ts'

/** Boot screen with a real progress value driven by initialisation stages. */
export class LoadingScreen extends Screen {
  private readonly bar: HTMLDivElement
  private readonly track: HTMLDivElement
  private readonly status: HTMLParagraphElement

  constructor() {
    super('screen--loading')

    // Same picture as the native launch screen (emblem centred on the deep
    // sea), so the hand-over from the OS splash is invisible.
    const content = createEl('div', 'splash')
    const emblem = createEl('img', 'splash__emblem')
    emblem.src = 'favicon.svg'
    emblem.alt = ''
    emblem.decoding = 'async'

    const below = createEl('div', 'splash__below')
    const wordmark = createEl('h1', 'splash__wordmark')
    wordmark.setAttribute('aria-label', 'Tidelark')
    wordmark.append(
      createEl('span', 'splash__tide', 'TIDE'),
      createEl('span', 'splash__lark', 'LARK'),
    )

    this.track = createEl('div', 'loading__track splash__track')
    this.track.setAttribute('role', 'progressbar')
    this.track.setAttribute('aria-valuemin', '0')
    this.track.setAttribute('aria-valuemax', '100')
    this.track.setAttribute('aria-valuenow', '0')
    this.bar = createEl('div', 'loading__bar')
    this.track.appendChild(this.bar)
    this.status = createEl('p', 'loading__status splash__status', t('loading.preparing'))
    below.append(wordmark, this.track, this.status)

    const hint = createEl('p', 'splash__hint', t('loading.hint'))
    content.append(emblem, below, hint)
    this.root.appendChild(content)
  }

  setProgress(value: number, label?: string): void {
    const progress = clamp(value, 0, 1)
    this.bar.style.transform = `scaleX(${progress})`
    this.track.setAttribute('aria-valuenow', String(Math.round(progress * 100)))
    if (label) {
      this.status.textContent = label
    }
  }
}
