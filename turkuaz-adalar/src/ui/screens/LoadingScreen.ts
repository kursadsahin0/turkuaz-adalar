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

    const content = createEl('div', 'loading')
    const mark = createEl('div', 'brand-mark brand-mark--small')
    mark.appendChild(createEl('span', 'brand-mark__glow'))

    const eyebrow = createEl('p', 'eyebrow', t('loading.eyebrow'))
    const title = createEl('h1', 'loading__title', t('loading.title'))

    this.status = createEl('p', 'loading__status', t('loading.preparing'))

    this.track = createEl('div', 'loading__track')
    this.track.setAttribute('role', 'progressbar')
    this.track.setAttribute('aria-valuemin', '0')
    this.track.setAttribute('aria-valuemax', '100')
    this.track.setAttribute('aria-valuenow', '0')
    this.bar = createEl('div', 'loading__bar')
    this.track.appendChild(this.bar)

    const hint = createEl('p', 'loading__hint', t('loading.hint'))

    content.append(mark, eyebrow, title, this.status, this.track, hint)
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
