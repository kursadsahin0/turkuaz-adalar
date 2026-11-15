import { t } from '../../i18n/i18n.ts'
import type { ProgressionSnapshot } from '../../systems/progression/ProgressionManager.ts'
import { createEl, createIcon } from '../../utils/dom.ts'
import { Button } from '../components/Button.ts'
import { IconButton } from '../components/IconButton.ts'
import { formatDistance, formatInteger } from '../format.ts'
import { Screen } from './Screen.ts'
import { createPanel, ICON_PATHS } from './screenUtils.ts'

export interface MenuScreenOptions {
  onPlay: () => void
  onCharacter: () => void
  onProgress: () => void
  onDaily: () => void
  onSettings: () => void
  onToggleMute: () => void
}

export interface MenuBadges {
  /** A daily reward is waiting to be claimed. */
  readonly dailyReady: boolean
  /** Missions or achievements with an unclaimed reward. */
  readonly claimable: number
}

/** Outline icons for the three menu tiles (24×24 grid). */
const TILE_ICONS = {
  characters: [
    'M12 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5z',
    'M4.5 20c.8-3.6 3.8-5.8 7.5-5.8s6.7 2.2 7.5 5.8',
  ],
  missions: [
    'M8 4h8v5.5a4 4 0 0 1-8 0V4z',
    'M16 5.5h3V7a3 3 0 0 1-3 3',
    'M8 5.5H5V7a3 3 0 0 0 3 3',
    'M12 13.5V17',
    'M8.5 20h7',
    'M10 17h4',
  ],
  settings: ['M4 7h9', 'M17 7h3', 'M4 17h3', 'M11 17h9', 'M15 5v4', 'M9 15v4'],
} as const

/** Icon above a short label: the menu's secondary tiles. */
function makeTile(button: Button, icon: readonly string[], label: string): void {
  button.element.classList.add('menu__tile')
  button.element.replaceChildren(createIcon(icon), createEl('span', 'menu__tile-label', label))
}

/** Title screen with local progression records and audio control. */
export class MenuScreen extends Screen {
  private readonly playButton: Button
  private readonly characterButton: Button
  private readonly progressButton: Button
  private readonly settingsButton: Button
  private readonly dailyButton: Button
  private readonly audioButton: IconButton
  private readonly bestScore: HTMLSpanElement
  private readonly bestDistance: HTMLSpanElement
  private readonly totalCrystals: HTMLSpanElement
  private readonly coinBalance: HTMLSpanElement
  private readonly crystalBalance: HTMLSpanElement
  private readonly progressBadge: HTMLSpanElement

  constructor(options: MenuScreenOptions) {
    super('screen--menu')

    const panel = createPanel('menu-panel')

    const top = createEl('div', 'menu__top')
    const eyebrow = createEl('p', 'eyebrow', t('menu.eyebrow'))

    const wallet = createEl('div', 'menu__wallet')
    const coins = createEl('div', 'menu__coins')
    coins.append(createEl('span', 'menu__coins-icon', '●'))
    this.coinBalance = createEl('span', 'menu__coins-value', '0')
    coins.append(this.coinBalance)
    coins.setAttribute('title', t('common.coins'))
    const crystals = createEl('div', 'menu__coins menu__crystals')
    crystals.append(createEl('span', 'menu__crystals-icon', '💎'))
    this.crystalBalance = createEl('span', 'menu__coins-value', '0')
    crystals.append(this.crystalBalance)
    crystals.setAttribute('title', t('common.crystals'))
    wallet.append(coins, crystals)

    this.audioButton = new IconButton({
      iconPaths: ICON_PATHS.sound,
      label: t('menu.mute'),
      onClick: options.onToggleMute,
      className: 'menu__audio',
    })
    top.append(eyebrow, wallet, this.audioButton.element)

    const brand = createEl('div', 'brand')
    const mark = createEl('div', 'brand-mark')
    mark.appendChild(createEl('span', 'brand-mark__glow'))
    const title = createEl('h1', 'game-title game-title--word')
    title.setAttribute('aria-label', 'Tidelark')
    title.append(
      createEl('span', 'game-title__line', 'Tide'),
      createEl('span', 'game-title__line', 'lark'),
    )
    const tagline = createEl('p', 'tagline', t('menu.tagline'))
    brand.append(mark, title, tagline)

    this.dailyButton = new Button({
      label: `🎁 ${t('menu.dailyReady')}`,
      variant: 'secondary',
      onClick: options.onDaily,
      className: 'menu__daily',
    })
    this.dailyButton.element.hidden = true

    const stats = createEl('div', 'stats-grid')
    const bestScoreStat = this.createStat(t('menu.bestScore'), '—')
    const distanceStat = this.createStat(t('menu.farthest'), '—')
    const crystalStat = this.createStat(t('common.crystals'), '—')
    this.bestScore = bestScoreStat.value
    this.bestDistance = distanceStat.value
    this.totalCrystals = crystalStat.value
    stats.append(bestScoreStat.element, distanceStat.element, crystalStat.element)

    const actions = createEl('div', 'menu__actions')
    this.playButton = new Button({
      label: t('menu.play'),
      onClick: options.onPlay,
      className: 'menu__play',
    })
    this.characterButton = new Button({
      label: t('menu.characters'),
      variant: 'secondary',
      onClick: options.onCharacter,
    })
    this.progressButton = new Button({
      label: t('menu.progress'),
      variant: 'secondary',
      onClick: options.onProgress,
      className: 'menu__progress',
    })
    makeTile(this.characterButton, TILE_ICONS.characters, t('menu.characters'))
    makeTile(this.progressButton, TILE_ICONS.missions, t('menu.progress'))
    this.progressBadge = createEl('span', 'menu__badge', '')
    this.progressBadge.hidden = true
    this.progressButton.element.appendChild(this.progressBadge)
    this.settingsButton = new Button({
      label: t('menu.settings'),
      variant: 'secondary',
      onClick: options.onSettings,
    })
    makeTile(this.settingsButton, TILE_ICONS.settings, t('menu.settings'))
    const secondary = createEl('div', 'menu__secondary')
    secondary.append(
      this.characterButton.element,
      this.progressButton.element,
      this.settingsButton.element,
    )
    actions.append(this.playButton.element, secondary)

    const hintsFine = createEl('p', 'control-hint only-fine')
    hintsFine.append(
      createEl('kbd', '', 'A'),
      createEl('kbd', '', 'D'),
      createEl('span', '', t('hint.keys.lanes')),
      createEl('kbd', '', 'Space'),
      createEl('span', '', t('hint.keys.jump')),
      createEl('kbd', '', 'S'),
      createEl('span', '', t('hint.keys.slide')),
      createEl('kbd', '', 'Shift'),
      createEl('span', '', t('hint.keys.dash')),
    )
    const hintsCoarse = createEl('p', 'control-hint only-coarse', t('hint.touch'))

    panel.append(top, brand, this.dailyButton.element, stats, actions, hintsFine, hintsCoarse)
    this.root.appendChild(panel)
  }

  setProgression(snapshot: ProgressionSnapshot): void {
    this.bestScore.textContent = snapshot.bestScore > 0 ? formatInteger(snapshot.bestScore) : '—'
    this.bestDistance.textContent =
      snapshot.bestDistance > 0 ? formatDistance(snapshot.bestDistance) : '—'
    this.totalCrystals.textContent =
      snapshot.totalCrystals > 0 ? formatInteger(snapshot.totalCrystals) : '—'
    this.coinBalance.textContent = formatInteger(snapshot.coins)
    this.crystalBalance.textContent = formatInteger(snapshot.crystalBalance)
  }

  setBadges(badges: MenuBadges): void {
    this.dailyButton.element.hidden = !badges.dailyReady
    this.progressBadge.hidden = badges.claimable <= 0
    this.progressBadge.textContent = String(badges.claimable)
  }

  setMuted(muted: boolean): void {
    this.audioButton.setIcon(
      muted ? ICON_PATHS.muted : ICON_PATHS.sound,
      muted ? t('menu.unmute') : t('menu.mute'),
    )
  }

  show(): void {
    super.show()
    this.focusWhenVisible(this.playButton)
  }

  dispose(): void {
    this.playButton.dispose()
    this.characterButton.dispose()
    this.progressButton.dispose()
    this.settingsButton.dispose()
    this.dailyButton.dispose()
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
