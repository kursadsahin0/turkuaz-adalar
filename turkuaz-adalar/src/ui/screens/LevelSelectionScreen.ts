import type { LevelDefinition } from '../../game/levels/LevelDefinition.ts'
import { createEl } from '../../utils/dom.ts'
import { IconButton } from '../components/IconButton.ts'
import { formatInteger } from '../format.ts'
import { Screen } from './Screen.ts'
import { createPanel, ICON_PATHS } from './screenUtils.ts'

export interface LevelSelectionScreenOptions {
  onSelectLevel: (levelId: string) => void
  onBack: () => void
}

export interface LevelSelectionData {
  levels: readonly LevelDefinition[]
  unlockedLevels: readonly string[]
  levelProgress: Readonly<Record<string, { completed: boolean; bestScore: number }>>
  currentCoins: number
}

/** Screen for selecting and unlocking levels. */
export class LevelSelectionScreen extends Screen {
  private readonly backButton: IconButton
  private readonly levelsContainer: HTMLDivElement
  private readonly coinsDisplay: HTMLSpanElement

  private currentData: LevelSelectionData | null = null

  constructor(options: LevelSelectionScreenOptions) {
    super('screen--overlay')

    const panel = createPanel('level-selection-panel')

    const top = createEl('div', 'level-selection__top')
    const eyebrow = createEl('p', 'eyebrow', 'Choose your path')
    const title = createEl('h2', 'screen-title', 'Islands')

    this.backButton = new IconButton({
      iconPaths: ICON_PATHS.back,
      label: 'Back to menu',
      onClick: options.onBack,
      className: 'level-selection__back',
    })

    const coins = createEl('div', 'level-selection__coins')
    const coinsIcon = createEl('span', 'level-selection__coins-icon', '●')
    this.coinsDisplay = createEl('span', 'level-selection__coins-value', '0')
    coins.append(coinsIcon, this.coinsDisplay)

    top.append(eyebrow, title, this.backButton.element, coins)

    this.levelsContainer = createEl('div', 'level-selection__levels')

    panel.append(top, this.levelsContainer)
    this.root.appendChild(panel)

    this.root.addEventListener('click', (event) => {
      const target = event.target as Element
      const levelCard = target.closest('[data-level-id]')
      if (levelCard) {
        const levelId = levelCard.getAttribute('data-level-id')
        if (levelId) {
          options.onSelectLevel(levelId)
        }
      }
    })
  }

  setData(data: LevelSelectionData): void {
    this.currentData = data
    this.coinsDisplay.textContent = formatInteger(data.currentCoins)
    this.renderLevels()
  }

  show(): void {
    super.show()
    this.backButton.focus()
  }

  dispose(): void {
    this.backButton.dispose()
    super.dispose()
  }

  private renderLevels(): void {
    if (!this.currentData) return

    this.levelsContainer.innerHTML = ''

    for (const level of this.currentData.levels) {
      const isUnlocked = this.currentData.unlockedLevels.includes(level.id)
      const progress = this.currentData.levelProgress[level.id]
      const isCompleted = progress?.completed ?? false
      const bestScore = progress?.bestScore ?? 0

      const card = this.createLevelCard(level, isUnlocked, isCompleted, bestScore)
      this.levelsContainer.appendChild(card)
    }
  }

  private createLevelCard(
    level: LevelDefinition,
    isUnlocked: boolean,
    isCompleted: boolean,
    bestScore: number,
  ): HTMLDivElement {
    const card = createEl('div', `level-card ${isUnlocked ? 'level-card--unlocked' : 'level-card--locked'}`)
    card.setAttribute('data-level-id', level.id)

    const number = createEl('div', 'level-card__number', level.id.includes('10') ? '10' : level.id.slice(-1))
    const name = createEl('h3', 'level-card__name', level.name)
    const tagline = createEl('p', 'level-card__tagline', level.tagline)

    const theme = createEl('div', 'level-card__theme')
    const themeColor = createEl('div', 'level-card__theme-color')
    themeColor.style.backgroundColor = `#${level.theme.skyColor.toString(16).padStart(6, '0')}`
    const themeName = createEl('span', 'level-card__theme-name', level.theme.name)
    theme.append(themeColor, themeName)

    const stats = createEl('div', 'level-card__stats')
    
    if (isUnlocked) {
      const difficulty = this.createStat('Difficulty', this.getDifficultyLabel(level))
      const target = this.createStat('Target', `${formatInteger(level.targetDistance)}m`)
      const completion = isCompleted
        ? this.createStat('Best', formatInteger(bestScore))
        : this.createStat('Unlock', formatInteger(level.unlockCost) + ' ●')
      stats.append(difficulty, target, completion)

      if (isCompleted) {
        const completedBadge = createEl('div', 'level-card__badge', '✓')
        card.appendChild(completedBadge)
      }
    } else {
      const lock = createEl('div', 'level-card__lock', '🔒')
      const unlockCost = this.createStat('Unlock cost', formatInteger(level.unlockCost) + ' ●')
      stats.append(unlockCost)
      card.appendChild(lock)
    }

    card.append(number, name, tagline, theme, stats)
    return card
  }

  private createStat(label: string, value: string): HTMLDivElement {
    const stat = createEl('div', 'level-card__stat')
    const statLabel = createEl('span', 'level-card__stat-label', label)
    const statValue = createEl('span', 'level-card__stat-value', value)
    stat.append(statLabel, statValue)
    return stat
  }

  private getDifficultyLabel(level: LevelDefinition): string {
    const progress = level.id.includes('10') ? 10 : parseInt(level.id.slice(-1))
    if (progress <= 3) return 'Beginner'
    if (progress <= 6) return 'Intermediate'
    if (progress <= 8) return 'Advanced'
    return 'Expert'
  }
}
