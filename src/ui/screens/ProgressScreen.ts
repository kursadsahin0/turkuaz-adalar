import { t, tc, type StringKey, localeOf } from '../../i18n/i18n.ts'
import { CHARACTER_ACCESSORIES, CHARACTER_COLORS } from '../../game/characters/CharacterData.ts'
import {
  SEASON_TIER_XP,
  SEASON_TIERS,
  type SeasonReward,
  type SeasonView,
} from '../../systems/meta/SeasonRoad.ts'
import type { AchievementDefinition, AchievementId } from '../../systems/meta/Achievements.ts'
import type { RunRecord } from '../../systems/meta/Leaderboard.ts'
import type { Mission } from '../../systems/meta/Missions.ts'
import { createEl } from '../../utils/dom.ts'
import { IconButton } from '../components/IconButton.ts'
import { formatDistance, formatInteger } from '../format.ts'
import { Screen } from './Screen.ts'
import { createPanel, ICON_PATHS } from './screenUtils.ts'

export interface ProgressScreenOptions {
  onBack: () => void
  onClaimMission: (id: string) => void
  onClaimAchievement: (id: AchievementId) => void
  onClaimSeason: (tier: number) => void
}

export interface AchievementView {
  readonly definition: AchievementDefinition
  readonly progress: number
  readonly unlocked: boolean
  readonly claimed: boolean
}

export interface ProgressData {
  readonly missions: readonly Mission[]
  readonly hoursLeft: number
  readonly achievements: readonly AchievementView[]
  readonly records: readonly RunRecord[]
  readonly season: SeasonView
}

type Tab = 'missions' | 'season' | 'achievements' | 'records'

/** Daily missions, lifetime achievements and the local top-10, in tabs. */
export class ProgressScreen extends Screen {
  private readonly backButton: IconButton
  private readonly tabs: HTMLDivElement
  private readonly list: HTMLDivElement
  private readonly options: ProgressScreenOptions
  private tab: Tab = 'missions'
  private data: ProgressData | null = null

  constructor(options: ProgressScreenOptions) {
    super('screen--overlay')
    this.root.classList.add('screen--sheet')
    this.options = options

    const panel = createPanel('progress-panel')
    const top = createEl('div', 'progress__top')
    const eyebrow = createEl('p', 'eyebrow', t('progress.eyebrow'))
    const title = createEl('h2', 'screen-title', t('progress.title'))
    this.backButton = new IconButton({
      iconPaths: ICON_PATHS.back,
      label: t('common.back'),
      onClick: options.onBack,
      className: 'progress__back',
    })
    top.append(eyebrow, title, this.backButton.element)

    this.tabs = createEl('div', 'character-selection__tabs progress__tabs')
    this.tabs.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLElement>('[data-tab]')
      if (button) {
        this.tab = button.dataset.tab as Tab
        this.render()
      }
    })
    this.list = createEl('div', 'progress__list')
    this.list.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-claim]')
      if (!button || button.disabled) {
        return
      }
      const id = button.dataset.claim ?? ''
      if (button.dataset.kind === 'mission') {
        this.options.onClaimMission(id)
      } else if (button.dataset.kind === 'season') {
        this.options.onClaimSeason(Number(id))
      } else {
        this.options.onClaimAchievement(id as AchievementId)
      }
    })

    panel.append(top, this.tabs, this.list)
    this.root.appendChild(panel)
  }

  setData(data: ProgressData): void {
    this.data = data
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
    const data = this.data
    if (!data) {
      return
    }
    const missionBadge = data.missions.filter((m) => m.completed && !m.claimed).length
    const achievementBadge = data.achievements.filter((a) => a.unlocked && !a.claimed).length
    this.tabs.replaceChildren(
      this.tabButton('missions', t('progress.tab.missions'), missionBadge),
      this.tabButton(
        'season',
        t('progress.tab.season'),
        data.season.tiers.filter((tier) => tier.reached && !tier.claimed).length,
      ),
      this.tabButton('achievements', t('progress.tab.achievements'), achievementBadge),
      this.tabButton('records', t('progress.tab.records'), 0),
    )

    this.list.replaceChildren()
    if (this.tab === 'missions') {
      this.renderMissions(data)
    } else if (this.tab === 'season') {
      this.renderSeason(data.season)
    } else if (this.tab === 'achievements') {
      this.renderAchievements(data)
    } else {
      this.renderRecords(data)
    }
  }

  private tabButton(id: Tab, label: string, badge: number): HTMLButtonElement {
    const button = createEl(
      'button',
      `character-selection__tab${this.tab === id ? ' character-selection__tab--active' : ''}`,
      label,
    )
    button.type = 'button'
    button.dataset.tab = id
    if (badge > 0) {
      button.append(createEl('span', 'menu__badge', String(badge)))
    }
    return button
  }

  private renderMissions(data: ProgressData): void {
    for (const mission of data.missions) {
      const name = t(`mission.${mission.kind}` as StringKey, {
        target: formatInteger(mission.target),
      })
      this.list.append(
        this.row({
          title: name,
          subtitle: `${formatInteger(mission.progress)} / ${formatInteger(mission.target)}`,
          ratio: mission.progress / mission.target,
          reward: `${formatInteger(mission.reward)} ●`,
          claimId: mission.id,
          kind: 'mission',
          state: mission.claimed ? 'claimed' : mission.completed ? 'ready' : 'progress',
        }),
      )
    }
    const done = data.missions.length > 0 && data.missions.every((m) => m.claimed)
    this.list.append(
      createEl(
        'p',
        'progress__note',
        done ? t('progress.allDone') : t('progress.missionsReset', { hours: data.hoursLeft }),
      ),
    )
  }

  private renderSeason(season: SeasonView): void {
    const head = createEl('div', 'season-head')
    const level = createEl(
      'strong',
      'season-head__tier',
      t('season.tier', { tier: season.tier, total: SEASON_TIERS }),
    )
    const meta = createEl(
      'span',
      'season-head__meta',
      t('season.daysLeft', { days: season.daysLeft }),
    )
    const track = createEl('div', 'goal-row__track season-head__track')
    const fill = createEl('div', 'goal-row__fill')
    fill.style.transform = `scaleX(${season.tierXp / SEASON_TIER_XP})`
    track.append(fill)
    const xp = createEl(
      'span',
      'season-head__xp',
      season.tier >= SEASON_TIERS
        ? t('season.complete')
        : t('season.xp', { xp: season.tierXp, total: SEASON_TIER_XP }),
    )
    head.append(level, meta, track, xp)
    this.list.append(head, createEl('p', 'progress__note season-head__how', t('season.how')))

    // Claimable tiers first, then the next few to aim for.
    const next = season.tiers.filter((tier) => !tier.reached).slice(0, 5)
    const ready = season.tiers.filter((tier) => tier.reached && !tier.claimed)
    const claimed = season.tiers.filter((tier) => tier.claimed).slice(-3)
    for (const entry of [...ready, ...next, ...claimed]) {
      const progressXp = Math.max(
        0,
        Math.min(SEASON_TIER_XP, season.xp - (entry.tier - 1) * SEASON_TIER_XP),
      )
      this.list.append(
        this.row({
          title: t('season.tierName', { tier: entry.tier }),
          subtitle: this.seasonRewardName(entry.reward),
          ratio: entry.reached ? 1 : progressXp / SEASON_TIER_XP,
          reward: this.seasonRewardShort(entry.reward),
          claimId: String(entry.tier),
          kind: 'season',
          state: entry.claimed ? 'claimed' : entry.reached ? 'ready' : 'progress',
        }),
      )
    }
  }

  private seasonRewardShort(reward: SeasonReward): string {
    if (reward.cosmetic) {
      return '🎁'
    }
    return reward.crystals > 0
      ? `${formatInteger(reward.crystals)} 💎`
      : `${formatInteger(reward.coins)} ●`
  }

  private seasonRewardName(reward: SeasonReward): string {
    if (reward.cosmetic) {
      const { type, id } = reward.cosmetic
      const item = [...CHARACTER_COLORS, ...CHARACTER_ACCESSORIES].find((entry) => entry.id === id)
      return t('season.cosmetic', { name: tc(`${type}.${id}.name`, item?.name ?? id) })
    }
    return reward.crystals > 0
      ? t('season.crystals', { crystals: reward.crystals })
      : t('season.coins', { coins: formatInteger(reward.coins) })
  }

  private renderAchievements(data: ProgressData): void {
    for (const entry of data.achievements) {
      const id = entry.definition.id
      this.list.append(
        this.row({
          title: t(`ach.${id}.name` as StringKey),
          subtitle: t(`ach.${id}.desc` as StringKey),
          ratio: Math.min(1, entry.progress / entry.definition.target),
          reward: `${entry.definition.reward} 💎`,
          claimId: id,
          kind: 'achievement',
          state: entry.claimed ? 'claimed' : entry.unlocked ? 'ready' : 'progress',
        }),
      )
    }
  }

  private renderRecords(data: ProgressData): void {
    if (data.records.length === 0) {
      this.list.append(createEl('p', 'progress__note', t('progress.noRecords')))
      return
    }
    const dateFormat = new Intl.DateTimeFormat(localeOf(), {
      day: 'numeric',
      month: 'short',
    })
    data.records.forEach((record, index) => {
      const row = createEl('div', 'record-row')
      row.append(
        createEl('span', 'record-row__rank', `#${index + 1}`),
        createEl('span', 'record-row__score', formatInteger(record.score)),
        createEl(
          'span',
          'record-row__meta',
          t('progress.recordRow', {
            distance: formatDistance(record.distance),
            date: dateFormat.format(new Date(record.at)),
          }),
        ),
      )
      this.list.append(row)
    })
  }

  private row(view: {
    title: string
    subtitle: string
    ratio: number
    reward: string
    claimId: string
    kind: 'mission' | 'achievement' | 'season'
    state: 'progress' | 'ready' | 'claimed'
  }): HTMLDivElement {
    const row = createEl('div', `goal-row goal-row--${view.state}`)
    const body = createEl('div', 'goal-row__body')
    body.append(
      createEl('span', 'goal-row__title', view.title),
      createEl('span', 'goal-row__subtitle', view.subtitle),
    )
    const track = createEl('div', 'goal-row__track')
    const fill = createEl('div', 'goal-row__fill')
    fill.style.transform = `scaleX(${Math.max(0, Math.min(1, view.ratio))})`
    track.append(fill)
    body.append(track)

    const button = createEl(
      'button',
      'goal-row__claim',
      view.state === 'claimed' ? t('common.claimed') : `${t('common.claim')} ${view.reward}`,
    )
    button.type = 'button'
    button.dataset.claim = view.claimId
    button.dataset.kind = view.kind
    button.disabled = view.state !== 'ready'
    if (view.state === 'progress') {
      button.textContent = view.reward
    }
    row.append(body, button)
    return row
  }
}
