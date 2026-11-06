import { t, type StringKey, localeOf } from '../../i18n/i18n.ts'
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
}

type Tab = 'missions' | 'achievements' | 'records'

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
      this.tabButton('achievements', t('progress.tab.achievements'), achievementBadge),
      this.tabButton('records', t('progress.tab.records'), 0),
    )

    this.list.replaceChildren()
    if (this.tab === 'missions') {
      this.renderMissions(data)
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
    kind: 'mission' | 'achievement'
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
