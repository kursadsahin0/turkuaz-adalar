import type { ProgressionSnapshot } from '../../systems/progression/ProgressionManager.ts'
import { createEl } from '../../utils/dom.ts'
import { Button } from '../components/Button.ts'
import { IconButton } from '../components/IconButton.ts'
import { formatDistance, formatInteger } from '../format.ts'
import { Screen } from './Screen.ts'
import { createPanel, ICON_PATHS } from './screenUtils.ts'

export interface MenuScreenOptions {
  onPlay: () => void
  onCharacter: () => void
  onSettings: () => void
  onToggleMute: () => void
}

/** Title screen with local progression records and audio control. */
export class MenuScreen extends Screen {
  private readonly playButton: Button
  private readonly characterButton: Button
  private readonly settingsButton: Button
  private readonly audioButton: IconButton
  private readonly bestScore: HTMLSpanElement
  private readonly bestDistance: HTMLSpanElement
  private readonly totalCrystals: HTMLSpanElement
  private readonly coinBalance: HTMLSpanElement

  constructor(options: MenuScreenOptions) {
    super('screen--menu')

    const panel = createPanel('menu-panel')

    const top = createEl('div', 'menu__top')
    const eyebrow = createEl('p', 'eyebrow', 'Endless island runner')
    
    const coins = createEl('div', 'menu__coins')
    const coinsIcon = createEl('span', 'menu__coins-icon', '●')
    this.coinBalance = createEl('span', 'menu__coins-value', '0')
    coins.append(coinsIcon, this.coinBalance)

    this.audioButton = new IconButton({
      iconPaths: ICON_PATHS.sound,
      label: 'Mute sound',
      onClick: options.onToggleMute,
      className: 'menu__audio',
    })
    top.append(eyebrow, coins, this.audioButton.element)

    const brand = createEl('div', 'brand')
    const mark = createEl('div', 'brand-mark')
    mark.appendChild(createEl('span', 'brand-mark__glow'))
    const title = createEl('h1', 'game-title')
    title.append(createEl('span', 'game-title__line', 'Turkuaz'), createEl('span', 'game-title__line', 'Adalar'))
    const tagline = createEl('p', 'tagline', 'Skim the emerald tide. Outrun the deep.')
    brand.append(mark, title, tagline)

    const stats = createEl('div', 'stats-grid')
    const bestScoreStat = this.createStat('Best score', '—')
    const distanceStat = this.createStat('Farthest run', '—')
    const crystalStat = this.createStat('Crystals', '—')
    this.bestScore = bestScoreStat.value
    this.bestDistance = distanceStat.value
    this.totalCrystals = crystalStat.value
    stats.append(bestScoreStat.element, distanceStat.element, crystalStat.element)

    const actions = createEl('div', 'menu__actions')
    this.playButton = new Button({
      label: 'Begin the run',
      onClick: options.onPlay,
      className: 'menu__play',
    })
    this.characterButton = new Button({
      label: 'Characters',
      variant: 'secondary',
      onClick: options.onCharacter,
    })
    this.settingsButton = new Button({
      label: 'Settings',
      variant: 'secondary',
      onClick: options.onSettings,
    })
    actions.append(this.playButton.element, this.characterButton.element, this.settingsButton.element)

    const hintsFine = createEl('p', 'control-hint only-fine')
    hintsFine.append(
      createEl('kbd', '', 'A'),
      createEl('kbd', '', 'D'),
      createEl('span', '', ' lanes  ·  '),
      createEl('kbd', '', 'Space'),
      createEl('span', '', ' jump  ·  '),
      createEl('kbd', '', 'S'),
      createEl('span', '', ' slide  ·  '),
      createEl('kbd', '', 'Shift'),
      createEl('span', '', ' dash'),
    )
    const hintsCoarse = createEl(
      'p',
      'control-hint only-coarse',
      'Swipe ← → to change lanes  ·  Tap to jump  ·  Swipe down to slide',
    )

    panel.append(top, brand, stats, actions, hintsFine, hintsCoarse)
    this.root.appendChild(panel)
  }

  setProgression(snapshot: ProgressionSnapshot): void {
    this.bestScore.textContent = snapshot.bestScore > 0 ? formatInteger(snapshot.bestScore) : '—'
    this.bestDistance.textContent =
      snapshot.bestDistance > 0 ? formatDistance(snapshot.bestDistance) : '—'
    this.totalCrystals.textContent =
      snapshot.totalCrystals > 0 ? formatInteger(snapshot.totalCrystals) : '—'
    this.coinBalance.textContent = formatInteger(snapshot.coins)
  }

  setMuted(muted: boolean): void {
    this.audioButton.setIcon(
      muted ? ICON_PATHS.muted : ICON_PATHS.sound,
      muted ? 'Unmute sound' : 'Mute sound',
    )
  }

  show(): void {
    super.show()
    this.focusWhenVisible(this.playButton)
  }

  dispose(): void {
    this.playButton.dispose()
    this.characterButton.dispose()
    this.settingsButton.dispose()
    this.audioButton.dispose()
    super.dispose()
  }

  private createStat(
    label: string,
    initial: string,
  ): { element: HTMLDivElement; value: HTMLSpanElement } {
    const element = createEl('div', 'stat')
    const value = createEl('span', 'stat__value', initial)
    const caption = createEl('span', 'stat__label', label)
    element.append(value, caption)
    return { element, value }
  }
}
