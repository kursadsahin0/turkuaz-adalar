import { t } from '../../i18n/i18n.ts'
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
    const title = createEl('h1', 'game-title')
    title.append(
      createEl('span', 'game-title__line', 'Turkuaz'),
      createEl('span', 'game-title__line', 'Adalar'),
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
    this.progressBadge = createEl('span', 'menu__badge', '')
    this.progressBadge.hidden = true
    this.progressButton.element.appendChild(this.progressBadge)
    this.settingsButton = new Button({
      label: t('menu.settings'),
      variant: 'secondary',
      onClick: options.onSettings,
    })
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
