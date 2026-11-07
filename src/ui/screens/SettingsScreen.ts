import { LANGUAGES, t, type Language } from '../../i18n/i18n.ts'
import { createEl } from '../../utils/dom.ts'
import { Button } from '../components/Button.ts'
import { IconButton } from '../components/IconButton.ts'
import { Screen } from './Screen.ts'
import { createPanel, ICON_PATHS } from './screenUtils.ts'

export interface SettingsData {
  musicVolume: number
  sfxVolume: number
  muted: boolean
  graphicsQuality: 'auto' | 'low' | 'medium' | 'high'
  showHints: boolean
  vibrationEnabled: boolean
  difficulty: 'easy' | 'medium' | 'hard'
  language: Language
  personalizedAds: boolean
  crashReports: boolean
  reminders: boolean
  /** Show "Ad privacy options" (Google UMP regions). */
  adPrivacyOptions?: boolean
}

export interface SettingsScreenOptions {
  onBack: () => void
  onChangeSettings: (settings: Partial<SettingsData>) => void
  /** Erases every save. Called only after the player confirmed twice. */
  onResetProgress: () => void
  onOpenPolicy: () => void
  onReplayTutorial: () => void
  onAdPrivacyOptions: () => void
}

interface SelectOption {
  readonly value: string
  readonly label: string
}

/** Screen for adjusting game settings. */
export class SettingsScreen extends Screen {
  private readonly backButton: IconButton
  private readonly musicSlider: HTMLInputElement
  private readonly sfxSlider: HTMLInputElement
  private readonly graphicsSelect: HTMLSelectElement
  private readonly difficultySelect: HTMLSelectElement
  private readonly hintsToggle: HTMLInputElement
  private readonly vibrationToggle: HTMLInputElement
  private readonly remindersToggle: HTMLInputElement
  private readonly languageSelect: HTMLSelectElement
  private readonly adsToggle: HTMLInputElement
  private readonly crashToggle: HTMLInputElement
  private readonly policyButton: Button
  private readonly tutorialButton: Button
  private readonly adPrivacyButton: Button
  private readonly resetButton: Button
  private readonly resetProgressButton: Button
  private resetArmedUntil = 0
  private resetTimer: number | null = null
  private settings: SettingsData = {
    musicVolume: 0.8,
    sfxVolume: 0.8,
    muted: false,
    graphicsQuality: 'medium',
    showHints: true,
    vibrationEnabled: true,
    difficulty: 'medium',
    language: 'en',
    personalizedAds: false,
    crashReports: true,
    reminders: true,
  }

  constructor(options: SettingsScreenOptions) {
    super('screen--overlay')
    this.root.classList.add('screen--sheet')

    const panel = createPanel('settings-panel')

    const top = createEl('div', 'settings__top')
    const eyebrow = createEl('p', 'eyebrow', t('settings.eyebrow'))
    const title = createEl('h2', 'screen-title', t('settings.title'))

    this.backButton = new IconButton({
      iconPaths: ICON_PATHS.back,
      label: t('common.back'),
      onClick: options.onBack,
      className: 'settings__back',
    })

    top.append(eyebrow, title, this.backButton.element)

    const sections = createEl('div', 'settings__sections')

    // Language first: it is the setting a player most needs to find.
    const languageSection = this.createSection(t('settings.language'))
    const languageControl = this.createSelectControl(
      t('settings.language'),
      LANGUAGES.map((language) => ({ value: language.id, label: language.label })),
      'en',
    )
    this.languageSelect = languageControl.select
    languageSection.appendChild(languageControl.element)
    sections.appendChild(languageSection)

    // Audio section
    const audioSection = this.createSection(t('settings.audio'))
    const musicControl = this.createSliderControl(t('settings.music'), 0, 100, 80)
    this.musicSlider = musicControl.slider
    audioSection.appendChild(musicControl.element)

    const sfxControl = this.createSliderControl(t('settings.sfx'), 0, 100, 80)
    this.sfxSlider = sfxControl.slider
    audioSection.appendChild(sfxControl.element)

    sections.appendChild(audioSection)

    // Graphics section
    const graphicsSection = this.createSection(t('settings.graphics'))
    const qualityControl = this.createSelectControl(
      t('settings.quality'),
      [
        { value: 'auto', label: t('settings.auto') },
        { value: 'low', label: t('settings.low') },
        { value: 'medium', label: t('settings.medium') },
        { value: 'high', label: t('settings.high') },
      ],
      'medium',
    )
    this.graphicsSelect = qualityControl.select
    graphicsSection.appendChild(qualityControl.element)
    sections.appendChild(graphicsSection)

    // Gameplay section
    const gameplaySection = this.createSection(t('settings.gameplay'))
    const difficultyControl = this.createSelectControl(
      t('settings.difficulty'),
      [
        { value: 'easy', label: t('settings.easy') },
        { value: 'medium', label: t('settings.medium') },
        { value: 'hard', label: t('settings.hard') },
      ],
      'medium',
    )
    this.difficultySelect = difficultyControl.select
    gameplaySection.appendChild(difficultyControl.element)

    const hintsControl = this.createToggleControl(t('settings.hints'), true)
    this.hintsToggle = hintsControl.toggle
    gameplaySection.appendChild(hintsControl.element)

    const vibrationControl = this.createToggleControl(t('settings.vibration'), true)
    this.vibrationToggle = vibrationControl.toggle
    gameplaySection.appendChild(vibrationControl.element)
    const remindersControl = this.createToggleControl(t('settings.reminders'), true)
    this.remindersToggle = remindersControl.toggle
    gameplaySection.appendChild(remindersControl.element)

    this.tutorialButton = new Button({
      label: t('settings.replayTutorial'),
      variant: 'text',
      onClick: () => {
        options.onReplayTutorial()
        this.tutorialButton.setLabel(t('settings.tutorialQueued'))
        this.tutorialButton.setDisabled(true)
      },
      className: 'settings__policy',
    })
    gameplaySection.appendChild(this.tutorialButton.element)
    sections.appendChild(gameplaySection)

    this.resetButton = new Button({
      label: t('settings.resetDefaults'),
      variant: 'text',
      onClick: () => this.resetToDefaults(options.onChangeSettings),
      className: 'settings__reset',
    })

    // Privacy: the consent choice from first launch, changeable any time.
    const privacySection = this.createSection(t('settings.privacy'))
    const adsControl = this.createToggleControl(t('settings.personalizedAds'), false)
    this.adsToggle = adsControl.toggle
    this.policyButton = new Button({
      label: t('settings.openPolicy'),
      variant: 'text',
      onClick: options.onOpenPolicy,
      className: 'settings__policy',
    })
    const crashControl = this.createToggleControl(t('settings.crashReports'), true)
    this.crashToggle = crashControl.toggle
    this.adPrivacyButton = new Button({
      label: t('settings.adPrivacyOptions'),
      variant: 'text',
      onClick: options.onAdPrivacyOptions,
      className: 'settings__policy',
    })
    this.adPrivacyButton.element.hidden = true
    privacySection.append(
      adsControl.element,
      crashControl.element,
      this.adPrivacyButton.element,
      this.policyButton.element,
    )
    sections.appendChild(privacySection)

    // Data: a destructive action behind a two-tap confirmation.
    const dataSection = this.createSection(t('settings.data'))
    this.resetProgressButton = new Button({
      label: t('settings.resetProgress'),
      variant: 'secondary',
      onClick: () => this.handleResetProgress(options.onResetProgress),
      className: 'settings__danger',
    })
    dataSection.append(
      this.resetProgressButton.element,
      createEl('p', 'settings__note', t('settings.resetNote')),
    )
    sections.appendChild(dataSection)

    panel.append(top, sections, this.resetButton.element)
    this.root.appendChild(panel)

    this.setupEventListeners(options.onChangeSettings)
  }

  setSettings(settings: SettingsData): void {
    this.settings = { ...settings }
    this.musicSlider.value = (this.settings.musicVolume * 100).toString()
    this.sfxSlider.value = (this.settings.sfxVolume * 100).toString()
    this.graphicsSelect.value = this.settings.graphicsQuality
    this.difficultySelect.value = this.settings.difficulty
    this.hintsToggle.checked = this.settings.showHints
    this.vibrationToggle.checked = this.settings.vibrationEnabled
    this.remindersToggle.checked = this.settings.reminders
    this.languageSelect.value = this.settings.language
    this.tutorialButton.setLabel(t('settings.replayTutorial'))
    this.tutorialButton.setDisabled(false)
    this.adsToggle.checked = this.settings.personalizedAds
    this.crashToggle.checked = this.settings.crashReports
    // In UMP regions Google's form owns ad consent, so the in-game toggle hides.
    this.adPrivacyButton.element.hidden = !this.settings.adPrivacyOptions
    this.adsToggle.closest<HTMLElement>('.settings-control')!.hidden =
      this.settings.adPrivacyOptions === true
    this.disarmReset()
  }

  show(): void {
    super.show()
    this.backButton.focus()
  }

  hide(): void {
    super.hide()
    this.disarmReset()
  }

  dispose(): void {
    this.disarmReset()
    this.backButton.dispose()
    this.resetButton.dispose()
    this.resetProgressButton.dispose()
    this.policyButton.dispose()
    this.tutorialButton.dispose()
    this.adPrivacyButton.dispose()
    super.dispose()
  }

  private setupEventListeners(onChange: (settings: Partial<SettingsData>) => void): void {
    this.musicSlider.addEventListener('input', () => {
      onChange({ musicVolume: parseInt(this.musicSlider.value) / 100 })
    })

    this.sfxSlider.addEventListener('input', () => {
      onChange({ sfxVolume: parseInt(this.sfxSlider.value) / 100 })
    })

    this.graphicsSelect.addEventListener('change', () => {
      onChange({ graphicsQuality: this.graphicsSelect.value as SettingsData['graphicsQuality'] })
    })

    this.difficultySelect.addEventListener('change', () => {
      onChange({ difficulty: this.difficultySelect.value as 'easy' | 'medium' | 'hard' })
    })

    this.hintsToggle.addEventListener('change', () => {
      onChange({ showHints: this.hintsToggle.checked })
    })

    this.vibrationToggle.addEventListener('change', () => {
      onChange({ vibrationEnabled: this.vibrationToggle.checked })
    })
    this.remindersToggle.addEventListener('change', () => {
      onChange({ reminders: this.remindersToggle.checked })
    })

    this.languageSelect.addEventListener('change', () => {
      onChange({ language: this.languageSelect.value as Language })
    })

    this.adsToggle.addEventListener('change', () => {
      onChange({ personalizedAds: this.adsToggle.checked })
    })

    this.crashToggle.addEventListener('change', () => {
      onChange({ crashReports: this.crashToggle.checked })
    })
  }

  private handleResetProgress(onReset: () => void): void {
    if (performance.now() < this.resetArmedUntil) {
      this.disarmReset()
      onReset()
      return
    }
    // First tap arms the button for four seconds.
    this.resetArmedUntil = performance.now() + 4000
    this.resetProgressButton.setLabel(t('settings.resetConfirm'))
    this.resetProgressButton.element.classList.add('is-armed')
    this.resetTimer = window.setTimeout(() => this.disarmReset(), 4000)
  }

  private disarmReset(): void {
    // Fields are assigned after super(); hide() can run before that.
    if (!this.resetProgressButton) {
      return
    }
    this.resetArmedUntil = 0
    if (this.resetTimer !== null) {
      window.clearTimeout(this.resetTimer)
      this.resetTimer = null
    }
    this.resetProgressButton.setLabel(t('settings.resetProgress'))
    this.resetProgressButton.element.classList.remove('is-armed')
  }

  private resetToDefaults(onChange: (settings: Partial<SettingsData>) => void): void {
    this.musicSlider.value = '80'
    this.sfxSlider.value = '80'
    this.graphicsSelect.value = 'medium'
    this.difficultySelect.value = 'medium'
    this.hintsToggle.checked = true
    this.vibrationToggle.checked = true

    this.settings = {
      musicVolume: 0.8,
      sfxVolume: 0.8,
      muted: false,
      graphicsQuality: 'medium',
      showHints: true,
      vibrationEnabled: true,
      difficulty: 'medium',
      language: this.settings.language,
      personalizedAds: this.settings.personalizedAds,
      crashReports: this.settings.crashReports,
      reminders: this.settings.reminders,
    }

    onChange({
      musicVolume: 0.8,
      sfxVolume: 0.8,
      graphicsQuality: 'medium',
      showHints: true,
      vibrationEnabled: true,
      difficulty: 'medium',
    })
  }

  private createSection(title: string): HTMLDivElement {
    const section = createEl('div', 'settings-section')
    const sectionTitle = createEl('h3', 'settings-section__title', title)
    section.appendChild(sectionTitle)
    return section
  }

  private createSliderControl(
    label: string,
    min: number,
    max: number,
    initial: number,
  ): { element: HTMLDivElement; slider: HTMLInputElement } {
    const control = createEl('div', 'settings-control')
    const labelEl = createEl('label', 'settings-control__label', label)

    const sliderWrapper = createEl('div', 'settings-control__slider-wrapper')
    const slider = createEl('input', 'settings-control__slider') as HTMLInputElement
    slider.type = 'range'
    slider.min = min.toString()
    slider.max = max.toString()
    slider.value = initial.toString()
    slider.setAttribute('aria-label', label)

    const valueDisplay = createEl('span', 'settings-control__value', `${initial}%`)

    slider.addEventListener('input', () => {
      valueDisplay.textContent = `${slider.value}%`
    })

    sliderWrapper.append(slider, valueDisplay)
    control.append(labelEl, sliderWrapper)

    return { element: control, slider }
  }

  private createSelectControl(
    label: string,
    options: readonly SelectOption[],
    initial: string,
  ): { element: HTMLDivElement; select: HTMLSelectElement } {
    const control = createEl('div', 'settings-control')
    const labelEl = createEl('label', 'settings-control__label', label)

    const select = createEl('select', 'settings-control__select') as HTMLSelectElement
    select.setAttribute('aria-label', label)

    for (const option of options) {
      const optionEl = createEl('option', '', option.label)
      optionEl.value = option.value
      if (option.value === initial) {
        optionEl.selected = true
      }
      select.appendChild(optionEl)
    }

    control.append(labelEl, select)
    return { element: control, select }
  }

  private createToggleControl(
    label: string,
    initial: boolean,
  ): { element: HTMLDivElement; toggle: HTMLInputElement } {
    const control = createEl('div', 'settings-control settings-control--toggle')
    const labelEl = createEl('label', 'settings-control__label', label)

    const toggleWrapper = createEl('div', 'settings-control__toggle-wrapper')
    const toggle = createEl('input', 'settings-control__toggle') as HTMLInputElement
    toggle.type = 'checkbox'
    toggle.checked = initial
    toggle.setAttribute('aria-label', label)

    const toggleTrack = createEl('div', 'settings-control__toggle-track')
    const toggleThumb = createEl('div', 'settings-control__toggle-thumb')

    toggleTrack.appendChild(toggleThumb)
    toggleWrapper.append(toggle, toggleTrack)
    control.append(labelEl, toggleWrapper)

    return { element: control, toggle }
  }
}
