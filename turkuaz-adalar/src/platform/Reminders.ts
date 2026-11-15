import { Capacitor } from '@capacitor/core'
import { t } from '../i18n/i18n.ts'
import type { SaveManager } from '../systems/save/SaveManager.ts'
import { Logger } from '../utils/logger.ts'

export interface ReminderState {
  /** Today's daily reward is already claimed. */
  readonly dailyClaimedToday: boolean
  /** Current login streak (0 when it already broke). */
  readonly streak: number
  /** This week's event reward is already paid. */
  readonly eventClaimed: boolean
}

export interface PlannedReminder {
  readonly id: number
  readonly at: Date
  readonly title: string
  readonly body: string
}

export const REMINDER_IDS = { daily: 1, event: 2, comeback: 3 } as const
/** Local time reminders go out; never at night. */
const EVENING_HOUR = 18
const STREAK_HOUR = 19
const EVENT_HOUR = 10
const COMEBACK_DAYS = 3

function atHour(base: Date, dayOffset: number, hour: number): Date {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hour)
  return date
}

/**
 * What to remind the player of, from the moment the app goes to the
 * background. Pure, so it can be tested without a device:
 *
 * - daily reward: tomorrow evening once today's is claimed; this evening if it
 *   is still waiting (as "your streak is about to break" when there is one);
 * - weekly event: Monday morning, when the new event starts;
 * - a gentle "come back" after three quiet days (replaced every time the app
 *   is used, so active players never see it).
 */
export function planReminders(now: Date, state: ReminderState): PlannedReminder[] {
  const plans: PlannedReminder[] = []
  const later = (date: Date) => date.getTime() - now.getTime() > 10 * 60_000

  if (state.dailyClaimedToday) {
    plans.push({
      id: REMINDER_IDS.daily,
      at: atHour(now, 1, EVENING_HOUR),
      title: t('notify.dailyTitle'),
      body: t('notify.dailyBody'),
    })
  } else if (state.streak > 0 && later(atHour(now, 0, STREAK_HOUR))) {
    plans.push({
      id: REMINDER_IDS.daily,
      at: atHour(now, 0, STREAK_HOUR),
      title: t('notify.streakTitle'),
      body: t('notify.streakBody', { days: state.streak }),
    })
  } else {
    const today = atHour(now, 0, EVENING_HOUR)
    plans.push({
      id: REMINDER_IDS.daily,
      at: later(today) ? today : atHour(now, 1, EVENING_HOUR),
      title: t('notify.dailyTitle'),
      body: t('notify.dailyBody'),
    })
  }

  const weekday = now.getDay() || 7
  plans.push({
    id: REMINDER_IDS.event,
    at: atHour(now, 8 - weekday, EVENT_HOUR),
    title: t('notify.eventTitle'),
    body: t('notify.eventBody'),
  })

  plans.push({
    id: REMINDER_IDS.comeback,
    at: atHour(now, COMEBACK_DAYS, EVENING_HOUR),
    title: t('notify.comebackTitle'),
    body: t('notify.comebackBody'),
  })
  return plans
}

const ASKED_KEY = 'reminders_asked'

/**
 * Local notifications (no server): scheduled when the app goes to the
 * background, cleared when it comes back. Permission is asked once, at a good
 * moment (after the first island or daily reward), never on first launch.
 */
export class Reminders {
  private readonly logger = new Logger('Reminders')
  private readonly save: SaveManager
  private enabled: boolean
  private readonly native = Capacitor.isNativePlatform()

  constructor(save: SaveManager, enabled: boolean) {
    this.save = save
    this.enabled = enabled
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (enabled) {
      void this.askOnce(true)
    } else {
      void this.clear()
    }
  }

  /** Asks for permission the first time it is useful; returns whether granted. */
  async askOnce(force = false): Promise<boolean> {
    if (!this.native || !this.enabled) {
      return false
    }
    if (!force && this.save.load<boolean>(ASKED_KEY, false)) {
      return false
    }
    this.save.save(ASKED_KEY, true)
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const current = await LocalNotifications.checkPermissions()
      if (current.display === 'granted') {
        return true
      }
      const result = await LocalNotifications.requestPermissions()
      return result.display === 'granted'
    } catch (error) {
      this.logger.warn('Notification permission request failed.', error)
      return false
    }
  }

  async schedule(state: ReminderState, now = new Date()): Promise<void> {
    if (!this.native || !this.enabled) {
      return
    }
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      if ((await LocalNotifications.checkPermissions()).display !== 'granted') {
        return
      }
      await this.clear()
      await LocalNotifications.schedule({
        notifications: planReminders(now, state).map((plan) => ({
          id: plan.id,
          title: plan.title,
          body: plan.body,
          schedule: { at: plan.at, allowWhileIdle: true },
          // A reminder may be a few minutes late. Asking for exact alarms would
          // make Android open the "Alarms & reminders" settings screen.
          isExactNotification: false,
          smallIcon: 'ic_stat_turkuaz',
          iconColor: '#2fe0cd',
        })),
      })
    } catch (error) {
      this.logger.warn('Scheduling reminders failed.', error)
    }
  }

  async clear(): Promise<void> {
    if (!this.native) {
      return
    }
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      await LocalNotifications.cancel({
        notifications: Object.values(REMINDER_IDS).map((id) => ({ id })),
      })
    } catch (error) {
      this.logger.warn('Clearing reminders failed.', error)
    }
  }
}
