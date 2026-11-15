import type { SaveManager } from '../save/SaveManager.ts'
import type { Reward } from './DailyRewards.ts'

/** Paid by the chest that opens after the very first run. */
export const WELCOME_CHEST: Reward = { coins: 250, crystals: 5 }
/** A premium-looking runner the player wears for one run, free. */
export const TRIAL_CHARACTER = 'tide-mage'

interface WelcomeState {
  chestOpened: boolean
  trialUsed: boolean
}

const SAVE_KEY = 'welcome'

/**
 * The first-session "wow" moments: a gift chest after the first run and a
 * one-run trial of a character the player does not own yet. Each happens once
 * per install.
 */
export class WelcomeGifts {
  private readonly save: SaveManager
  private state: WelcomeState
  /** The character being tried in the current/next run (not saved). */
  private trial: string | null = null

  constructor(save: SaveManager) {
    this.save = save
    const raw = save.load<Partial<WelcomeState> | null>(SAVE_KEY, null)
    this.state = { chestOpened: raw?.chestOpened === true, trialUsed: raw?.trialUsed === true }
  }

  /** The chest waits for the first finished run. */
  chestReady(totalRuns: number): boolean {
    return !this.state.chestOpened && totalRuns >= 1
  }

  /** Marks the chest opened; returns its reward, or null if it already was. */
  openChest(): Reward | null {
    if (this.state.chestOpened) {
      return null
    }
    this.state = { ...this.state, chestOpened: true }
    this.persist()
    return WELCOME_CHEST
  }

  /** Whether the trial can still be offered (once, and not if already owned). */
  canTry(owned: readonly string[]): boolean {
    return !this.state.trialUsed && !owned.includes(TRIAL_CHARACTER)
  }

  startTrial(): string | null {
    if (this.state.trialUsed) {
      return null
    }
    this.state = { ...this.state, trialUsed: true }
    this.persist()
    this.trial = TRIAL_CHARACTER
    return this.trial
  }

  get trialCharacter(): string | null {
    return this.trial
  }

  /** Ends the trial after its run; returns the character that was tried. */
  endTrial(): string | null {
    const tried = this.trial
    this.trial = null
    return tried
  }

  private persist(): void {
    this.save.save(SAVE_KEY, this.state)
  }
}
