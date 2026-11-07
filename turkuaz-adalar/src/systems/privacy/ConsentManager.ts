import type { SaveManager } from '../save/SaveManager.ts'

/**
 * Bump when the privacy policy or the data uses change materially: every
 * player is asked again.
 */
export const CONSENT_VERSION = 1

export interface ConsentState {
  readonly version: number
  /** Personalised (interest-based) ads. False means non-personalised only. */
  readonly personalizedAds: boolean
  readonly decidedAt: number
}

const SAVE_KEY = 'consent'

/**
 * Stores the player's privacy choice. This is the in-game record and UI;
 * when AdMob is integrated, Google's UMP SDK must also be shown in the EEA/UK
 * (Google requires a certified consent platform there) and its result fed in
 * through `record()`.
 */
export class ConsentManager {
  private readonly save: SaveManager
  private state: ConsentState | null

  constructor(save: SaveManager) {
    this.save = save
    const raw = save.load<Partial<ConsentState> | null>(SAVE_KEY, null)
    this.state =
      raw &&
      raw.version === CONSENT_VERSION &&
      typeof raw.personalizedAds === 'boolean' &&
      typeof raw.decidedAt === 'number'
        ? { version: raw.version, personalizedAds: raw.personalizedAds, decidedAt: raw.decidedAt }
        : null
  }

  /** The player has not answered the current version of the prompt yet. */
  get needsPrompt(): boolean {
    return this.state === null
  }

  get personalizedAds(): boolean {
    return this.state?.personalizedAds ?? false
  }

  record(personalizedAds: boolean): void {
    this.state = { version: CONSENT_VERSION, personalizedAds, decidedAt: Date.now() }
    this.save.save(SAVE_KEY, this.state)
  }
}
