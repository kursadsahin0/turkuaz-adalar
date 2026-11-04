import { createEl } from '../../utils/dom.ts'
import { Button } from '../components/Button.ts'
import { IconButton } from '../components/IconButton.ts'
import { Screen } from './Screen.ts'
import { createPanel, ICON_PATHS } from './screenUtils.ts'

export interface SettingsData {
  musicVolume: number
  sfxVolume: number
  muted: boolean
  graphicsQuality: 'low' | 'medium' | 'high'
  showHints: boolean
  vibrationEnabled: boolean
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface SettingsScreenOptions {
  onBack: () => void
  onChangeSettings: (settings: Partial<SettingsData>) => void
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
  private readonly resetButton: Button
  private settings: SettingsData = {
    musicVolume: 0.8,
    sfxVolume: 0.8,
    muted: false,
    graphicsQuality: 'medium',
    showHints: true,
    vibrationEnabled: true,
    difficulty: 'medium',
  }

  constructor(options: SettingsScreenOptions) {
    super('screen--overlay')

    const panel = createPanel('settings-panel')

    const top = createEl('div', 'settings__top')
    const eyebrow = createEl('p', 'eyebrow', 'Preferences')
    const title = createEl('h2', 'screen-title', 'Settings')

    this.backButton = new IconButton({
      iconPaths: ICON_PATHS.back,
      label: 'Back to menu',
      onClick: options.onBack,
      className: 'settings__back',
    })

    top.append(eyebrow, title, this.backButton.element)

    const sections = createEl('div', 'settings__sections')

    // Audio section
    const audioSection = this.createSection('Audio')
    const musicControl = this.createSliderControl('Music volume', 0, 100, 80)
    this.musicSlider = musicControl.slider
    audioSection.appendChild(musicControl.element)

    const sfxControl = this.createSliderControl('Sound effects', 0, 100, 80)
    this.sfxSlider = sfxControl.slider
    audioSection.appendChild(sfxControl.element)

    sections.appendChild(audioSection)

    // Graphics section
    const graphicsSection = this.createSection('Graphics')
    const qualityControl = this.createSelectControl('Quality', ['Low', 'Medium', 'High'], 'Medium')
    this.graphicsSelect = qualityControl.select
    graphicsSection.appendChild(qualityControl.element)
    sections.appendChild(graphicsSection)

    // Gameplay section
    const gameplaySection = this.createSection('Gameplay')
    const difficultyControl = this.createSelectControl('Difficulty', ['Easy', 'Medium', 'Hard'], 'Medium')
    this.difficultySelect = difficultyControl.select
    gameplaySection.appendChild(difficultyControl.element)

    const hintsControl = this.createToggleControl('Show control hints', true)
    this.hintsToggle = hintsControl.toggle
    gameplaySection.appendChild(hintsControl.element)

    const vibrationControl = this.createToggleControl('Vibration feedback', true)
    this.vibrationToggle = vibrationControl.toggle
    gameplaySection.appendChild(vibrationControl.element)
    sections.appendChild(gameplaySection)

    this.resetButton = new Button({
      label: 'Reset to defaults',
      variant: 'text',
      onClick: () => this.resetToDefaults(options.onChangeSettings),
      className: 'settings__reset',
    })

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
  }

  show(): void {
    super.show()
    this.backButton.focus()
  }

  dispose(): void {
    this.backButton.dispose()
    this.resetButton.dispose()
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
      onChange({ graphicsQuality: this.graphicsSelect.value as 'low' | 'medium' | 'high' })
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
    options: string[],
    initial: string,
  ): { element: HTMLDivElement; select: HTMLSelectElement } {
    const control = createEl('div', 'settings-control')
    const labelEl = createEl('label', 'settings-control__label', label)
    
    const select = createEl('select', 'settings-control__select') as HTMLSelectElement
    select.setAttribute('aria-label', label)

    for (const option of options) {
      const optionEl = createEl('option', '', option)
      optionEl.value = option.toLowerCase()
      if (option === initial) {
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
