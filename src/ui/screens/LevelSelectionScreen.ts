import { islandName } from '../../game/levels/islandName.ts'
import { t, tc, type StringKey } from '../../i18n/i18n.ts'
import type { LevelDefinition } from '../../game/levels/LevelDefinition.ts'
import { createEl } from '../../utils/dom.ts'
import { IconButton } from '../components/IconButton.ts'
import { formatDistance, formatInteger } from '../format.ts'
import { Screen } from './Screen.ts'
import { createPanel, ICON_PATHS } from './screenUtils.ts'

export interface LevelSelectionScreenOptions {
  /** Starts a level, or the endless run when `levelId` is null. */
  onSelectLevel: (levelId: string | null) => void
  /** Pays a locked level's unlock cost. The game re-checks coins. */
  onUnlockLevel: (levelId: string) => void
  onBack: () => void
}

export interface LevelCardProgress {
  readonly completed: boolean
  readonly bestScore: number
  readonly bestDistance: number
  readonly bestStars: number
}

export interface LevelSelectionData {
  levels: readonly LevelDefinition[]
  unlockedLevels: readonly string[]
  levelProgress: Readonly<Record<string, LevelCardProgress>>
  currentCoins: number
  /** Best distance of the endless run, for its card. */
  endlessBest: number
  /** This week's event island. */
  event?: EventCardData
}

export interface EventCardData {
  readonly level: LevelDefinition
  readonly daysLeft: number
  /** True once this week's reward has been paid. */
  readonly claimed: boolean
  readonly reward: { readonly coins: number; readonly crystals: number }
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

function starText(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars))
}

/** Islands per chapter tab. */
const CHAPTER_SIZE = 10

/** The endless run plus every catalogue level, with unlocks and stars. */
export class LevelSelectionScreen extends Screen {
  private readonly backButton: IconButton
  private readonly coinsDisplay: HTMLSpanElement
  private readonly starsDisplay: HTMLSpanElement
  private readonly levelsContainer: HTMLDivElement
  private readonly chapterTabs: HTMLDivElement
  private currentData: LevelSelectionData | null = null
  /** Index of the chapter shown; null until data arrives (then the furthest unlocked). */
  private chapter: number | null = null

  constructor(options: LevelSelectionScreenOptions) {
    super('screen--overlay')

    const panel = createPanel('level-selection-panel')

    const top = createEl('div', 'level-selection__top')
    const eyebrow = createEl('p', 'eyebrow', t('levels.eyebrow'))
    const title = createEl('h2', 'screen-title', t('levels.title'))

    this.backButton = new IconButton({
      iconPaths: ICON_PATHS.back,
      label: t('common.back'),
      onClick: options.onBack,
      className: 'level-selection__back',
    })

    const wallet = createEl('div', 'level-selection__wallet')
    const coins = createEl('div', 'menu__coins')
    coins.append(createEl('span', 'menu__coins-icon', '●'))
    this.coinsDisplay = createEl('span', 'menu__coins-value', '0')
    coins.append(this.coinsDisplay)
    const stars = createEl('div', 'menu__coins level-selection__stars')
    stars.append(createEl('span', 'level-selection__star-icon', '★'))
    this.starsDisplay = createEl('span', 'menu__coins-value', '0')
    stars.append(this.starsDisplay)
    wallet.append(coins, stars)

    top.append(eyebrow, title, this.backButton.element, wallet)

    this.chapterTabs = createEl('div', 'level-selection__chapters')
    this.chapterTabs.setAttribute('role', 'tablist')
    this.chapterTabs.setAttribute('aria-label', t('levels.chapters'))
    this.chapterTabs.addEventListener('click', (event) => {
      const tab = (event.target as Element).closest<HTMLButtonElement>('[data-chapter]')
      if (tab) {
        this.chapter = Number(tab.dataset.chapter)
        this.render()
        this.levelsContainer.scrollTop = 0
      }
    })
    this.levelsContainer = createEl('div', 'level-selection__levels')
    panel.append(top, this.chapterTabs, this.levelsContainer)
    this.root.appendChild(panel)
    this.levelsContainer.addEventListener('keydown', this.handleKey)

    this.levelsContainer.addEventListener('click', (event) => {
      const target = event.target as Element
      const unlock = target.closest<HTMLButtonElement>('[data-unlock-level]')
      if (unlock) {
        if (!unlock.disabled) {
          options.onUnlockLevel(unlock.dataset.unlockLevel ?? '')
        }
        return
      }
      const card = target.closest<HTMLElement>('[data-play-level]')
      if (card && card.dataset.playable === 'true') {
        const id = card.dataset.playLevel ?? ''
        options.onSelectLevel(id === 'endless' ? null : id)
      }
    })
  }

  private readonly handleKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    const card = (event.target as Element).closest<HTMLElement>('[data-play-level]')
    if (card && event.target === card) {
      event.preventDefault()
      card.click()
    }
  }

  setData(data: LevelSelectionData): void {
    this.currentData = data
    this.coinsDisplay.textContent = formatInteger(data.currentCoins)
    const totalStars = data.levels.reduce(
      (sum, level) => sum + (data.levelProgress[level.id]?.bestStars ?? 0),
      0,
    )
    this.starsDisplay.textContent = `${totalStars}/${data.levels.length * 3}`
    if (this.chapter === null) {
      // Open on the chapter of the furthest island the player can play.
      const furthest = data.levels.reduce(
        (last, level, index) => (data.unlockedLevels.includes(level.id) ? index : last),
        0,
      )
      this.chapter = Math.floor(furthest / CHAPTER_SIZE)
    }
    this.render()
  }

  show(): void {
    super.show()
    this.backButton.focus()
  }

  dispose(): void {
    this.backButton.dispose()
    super.dispose()
  }

  private render(): void {
    const data = this.currentData
    if (!data) {
      return
    }
    const chapters = Math.ceil(data.levels.length / CHAPTER_SIZE)
    const current = Math.min(this.chapter ?? 0, chapters - 1)
    this.chapterTabs.replaceChildren(
      ...Array.from({ length: chapters }, (_, chapter) => this.chapterTab(chapter, current, data)),
    )
    this.levelsContainer.replaceChildren(
      this.endlessCard(data),
      ...(data.event ? [this.eventCard(data.event)] : []),
    )
    data.levels.forEach((level, index) => {
      if (Math.floor(index / CHAPTER_SIZE) !== current) {
        return
      }
      const previous = index > 0 ? data.levels[index - 1] : null
      this.levelsContainer.append(this.levelCard(level, index, previous, data))
    })
  }

  private chapterTab(
    chapter: number,
    current: number,
    data: LevelSelectionData,
  ): HTMLButtonElement {
    const levels = data.levels.slice(chapter * CHAPTER_SIZE, (chapter + 1) * CHAPTER_SIZE)
    const stars = levels.reduce(
      (sum, level) => sum + (data.levelProgress[level.id]?.bestStars ?? 0),
      0,
    )
    const first = chapter * CHAPTER_SIZE + 1
    const tab = createEl(
      'button',
      `level-selection__chapter ${chapter === current ? 'level-selection__chapter--active' : ''}`,
    )
    tab.type = 'button'
    tab.dataset.chapter = String(chapter)
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-selected', String(chapter === current))
    tab.append(
      createEl(
        'span',
        'level-selection__chapter-name',
        t(`levels.chapter.${chapter + 1}` as StringKey),
      ),
      createEl('span', 'level-selection__chapter-meta', ''),
    )
    const meta = tab.querySelector('.level-selection__chapter-meta')
    meta?.append(
      createEl(
        'span',
        'level-selection__chapter-range',
        `${first}–${first + levels.length - 1} · `,
      ),
      createEl('span', 'level-selection__chapter-stars', `★ ${stars}/${levels.length * 3}`),
    )
    return tab
  }

  /** The weekly event: an island with this week's twist and a one-off reward. */
  private eventCard(event: EventCardData): HTMLDivElement {
    const card = createEl(
      'div',
      'level-card level-card--unlocked level-card--endless level-card--event',
    )
    card.dataset.playLevel = event.level.id
    card.dataset.playable = 'true'
    card.setAttribute('role', 'button')
    card.tabIndex = 0
    const tags = [
      ...(event.level.mechanic ? [t(`mechanic.${event.level.mechanic}.tag` as StringKey)] : []),
      ...(event.level.chase ? [t('chase.tag')] : []),
    ]
    card.append(
      createEl('div', 'level-card__number', '★'),
      createEl('h3', 'level-card__name', islandName(event.level)),
      createEl('p', 'level-card__tagline', t('event.tagline', { days: event.daysLeft })),
      ...tags.map((tag) => createEl('span', 'level-card__mechanic', tag)),
    )
    const stats = createEl('div', 'level-card__stats')
    stats.append(
      this.stat(
        t('event.rewardLabel'),
        event.claimed
          ? t('event.claimed')
          : `${formatInteger(event.reward.coins)} ● · ${event.reward.crystals} 💎`,
      ),
    )
    card.append(stats)
    return card
  }

  private endlessCard(data: LevelSelectionData): HTMLDivElement {
    const card = createEl('div', 'level-card level-card--unlocked level-card--endless')
    card.dataset.playLevel = 'endless'
    card.dataset.playable = 'true'
    card.setAttribute('role', 'button')
    card.tabIndex = 0
    card.append(
      createEl('div', 'level-card__number', '∞'),
      createEl('h3', 'level-card__name', t('levels.endless')),
      createEl('p', 'level-card__tagline', t('levels.endlessTagline')),
    )
    const stats = createEl('div', 'level-card__stats')
    stats.append(
      this.stat(t('levels.best'), data.endlessBest > 0 ? formatDistance(data.endlessBest) : '—'),
    )
    card.append(stats)
    return card
  }

  private levelCard(
    level: LevelDefinition,
    index: number,
    previous: LevelDefinition | null,
    data: LevelSelectionData,
  ): HTMLDivElement {
    const unlocked = index === 0 || data.unlockedLevels.includes(level.id)
    const progress = data.levelProgress[level.id]
    const card = createEl(
      'div',
      `level-card ${unlocked ? 'level-card--unlocked' : 'level-card--locked'}`,
    )
    card.dataset.playLevel = level.id
    card.dataset.playable = String(unlocked)
    card.style.setProperty('--level-color', hex(level.theme.skyColor))
    if (unlocked) {
      card.setAttribute('role', 'button')
      card.tabIndex = 0
    }

    const name = tc(`level.${level.id}.name`, level.name)
    card.append(
      createEl('div', 'level-card__number', String(index + 1)),
      createEl('h3', 'level-card__name', name),
      createEl('p', 'level-card__tagline', tc(`level.${level.id}.tagline`, level.tagline)),
      ...(level.mechanic
        ? [
            createEl(
              'span',
              'level-card__mechanic',
              t(`mechanic.${level.mechanic}.tag` as StringKey),
            ),
          ]
        : []),
      ...(level.chase ? [createEl('span', 'level-card__mechanic', t('chase.tag'))] : []),
    )

    const stats = createEl('div', 'level-card__stats')
    stats.append(this.stat(t('levels.target'), formatDistance(level.targetDistance)))

    if (unlocked) {
      stats.append(
        this.stat(
          t('levels.best'),
          progress?.bestDistance ? formatDistance(progress.bestDistance) : '—',
        ),
      )
      const stars = createEl('div', 'level-card__stars', starText(progress?.bestStars ?? 0))
      stars.setAttribute('aria-label', t('levels.starsLabel', { stars: progress?.bestStars ?? 0 }))
      card.append(stars)
      if (progress?.completed) {
        card.append(createEl('div', 'level-card__badge', '✓'))
      }
    } else {
      card.append(createEl('div', 'level-card__lock', '🔒'))
      const hint = createEl(
        'p',
        'level-card__hint',
        previous
          ? t('levels.finishToUnlock', { level: tc(`level.${previous.id}.name`, previous.name) })
          : '',
      )
      card.append(hint)
      // A cost of 0 means the island opens only by finishing the previous one.
      if (level.unlockCost > 0) {
        const unlock = createEl(
          'button',
          'level-card__unlock',
          t('levels.unlockFor', { cost: formatInteger(level.unlockCost) }),
        )
        unlock.type = 'button'
        unlock.dataset.unlockLevel = level.id
        unlock.disabled = data.currentCoins < level.unlockCost
        card.append(unlock)
      }
    }

    card.append(stats)
    return card
  }

  private stat(label: string, value: string): HTMLDivElement {
    const stat = createEl('div', 'level-card__stat')
    stat.append(
      createEl('span', 'level-card__stat-label', label),
      createEl('span', 'level-card__stat-value', value),
    )
    return stat
  }
}
