import { detectQualityLevel } from '../../config/QualitySettings.ts'
import { setLanguage } from '../../i18n/i18n.ts'
import type { RenderQuality } from '../../systems/performance/AdaptiveQuality.ts'
import type { PlayerSaveManager } from '../../systems/save/PlayerSaveManager.ts'
import type { SaveManager } from '../../systems/save/SaveManager.ts'
import type { SettingsData } from '../../ui/screens/SettingsScreen.ts'
import { Logger } from '../../utils/logger.ts'
import type { GameServices } from './GameServices.ts'

export interface SettingsHooks {
  /** Applies a graphics level; `auto` lets adaptive quality move it later. */
  readonly setQuality: (level: RenderQuality, auto: boolean) => void
  /** Called after the consent prompt is answered. */
  readonly afterConsent: () => void
  readonly isDisposed: () => boolean
}

/**
 * Settings, sound toggles and privacy: builds the settings view, applies
 * changes to every system, runs the start-up ad-consent flow and the
 * "reset progress" escape hatch.
 */
export class SettingsController {
  private readonly logger = new Logger('Settings')
  /** UMP regions must offer a way back into the consent form. */
  private adPrivacyOptions = false

  private readonly services: GameServices
  private readonly hooks: SettingsHooks

  constructor(services: GameServices, hooks: SettingsHooks) {
    this.services = services
    this.hooks = hooks
  }

  data(): SettingsData {
    const settings = this.services.playerSave.settings
    return {
      musicVolume: settings.musicVolume,
      sfxVolume: settings.sfxVolume,
      muted: this.services.audio?.isMuted ?? settings.muted,
      graphicsQuality: settings.quality,
      showHints: settings.controlHints,
      vibrationEnabled: settings.vibration,
      difficulty: settings.difficulty,
      language: settings.language,
      personalizedAds: this.services.consent.personalizedAds,
      crashReports: settings.crashReports,
      adPrivacyOptions: this.adPrivacyOptions,
    }
  }

  show(): void {
    this.services.ui.showSettings(this.data())
  }

  change(settings: Partial<SettingsData>): void {
    const { playerSave, telemetry, ui, meta, audio, haptics, consent, monetization } = this.services
    const currentSettings = playerSave.settings
    const updatedSettings = {
      ...currentSettings,
      musicVolume: settings.musicVolume ?? currentSettings.musicVolume,
      sfxVolume: settings.sfxVolume ?? currentSettings.sfxVolume,
      quality: settings.graphicsQuality ?? currentSettings.quality,
      controlHints: settings.showHints ?? currentSettings.controlHints,
      vibration: settings.vibrationEnabled ?? currentSettings.vibration,
      muted: settings.muted ?? currentSettings.muted,
      difficulty: settings.difficulty ?? currentSettings.difficulty,
      language: settings.language ?? currentSettings.language,
      crashReports: settings.crashReports ?? currentSettings.crashReports,
    }
    playerSave.updateSettings(updatedSettings)

    if (typeof settings.crashReports === 'boolean') {
      telemetry.setCrashReportsAllowed(settings.crashReports)
    }
    if (settings.language && settings.language !== currentSettings.language) {
      telemetry.track('language_change', { language: settings.language })
      setLanguage(settings.language)
      // Every screen is rebuilt so all text switches at once.
      ui.rebuild(this.data())
      ui.setMenuBadges(meta.badges)
    }

    if (settings.graphicsQuality) {
      const auto = settings.graphicsQuality === 'auto'
      const level = (auto ? detectQualityLevel() : settings.graphicsQuality) as RenderQuality
      this.hooks.setQuality(level, auto)
    }
    if (typeof settings.musicVolume === 'number') {
      audio?.setMusicVolume(updatedSettings.musicVolume)
    }
    if (typeof settings.sfxVolume === 'number') {
      audio?.setSfxVolume(updatedSettings.sfxVolume)
    }
    if (typeof settings.muted === 'boolean' && audio && settings.muted !== audio.isMuted) {
      this.toggleMute()
    }
    if (typeof settings.vibrationEnabled === 'boolean') {
      haptics.setEnabled(updatedSettings.vibration)
      // A short buzz confirms the toggle on devices that support it.
      haptics.pulse('ui')
    }
    if (typeof settings.personalizedAds === 'boolean') {
      consent.record(settings.personalizedAds)
      monetization.setPersonalizedAds(settings.personalizedAds)
    }
    if (typeof settings.showHints === 'boolean') {
      ui.setHintsVisible(updatedSettings.controlHints)
    }
  }

  toggleMute(): void {
    const audio = this.services.audio
    if (!audio) {
      return
    }
    const muted = audio.toggleMute()
    this.services.playerSave.updateSettings({ muted })
    this.services.ui.setMuted(muted)
    if (!muted) {
      void audio.unlock().then(() => {
        audio.play('ui')
      })
    }
  }

  /**
   * Native: Google's UMP form runs first where the law requires it (EEA, UK,
   * Switzerland) and then the iOS tracking prompt. Everywhere else the
   * game's own prompt asks once, before any ad.
   */
  async runConsentFlow(): Promise<void> {
    const { monetization, consent, ui } = this.services
    const outcome = await monetization.prepareConsent().catch((error: unknown) => {
      this.logger.warn('Ad consent flow failed; using non-personalised ads.', error)
      return null
    })
    if (outcome?.handledByUmp) {
      this.adPrivacyOptions = outcome.privacyOptionsRequired
      // UMP's choice is enforced by the SDK itself; don't ask a second time.
      if (consent.needsPrompt) {
        consent.record(true)
      }
      monetization.setPersonalizedAds(true)
      return
    }
    if (consent.needsPrompt && !this.hooks.isDisposed()) {
      ui.showConsent()
    }
  }

  recordConsent(personalized: boolean): void {
    this.services.consent.record(personalized)
    this.services.monetization.setPersonalizedAds(personalized)
    this.services.telemetry.track('consent', { personalized })
    this.hooks.afterConsent()
  }

  showAdPrivacyOptions(): void {
    void this.services.monetization.showPrivacyOptions()
  }

  /** Wipes every save and restarts the game from a clean slate. */
  resetProgress(): void {
    this.logger.warn("Resetting all progress at the player's request.")
    this.services.save.clearAll()
    window.location.reload()
  }
}

/**
 * The audio manager used to persist mute and volumes under its own keys,
 * duplicating the player settings. Fold any such values in once and drop them.
 */
export function migrateLegacyAudioSettings(save: SaveManager, playerSave: PlayerSaveManager): void {
  const keys = ['settings.muted', 'settings.musicVolume', 'settings.sfxVolume'] as const
  const muted = save.load<unknown>(keys[0], null)
  const music = save.load<unknown>(keys[1], null)
  const sfx = save.load<unknown>(keys[2], null)
  if (muted === null && music === null && sfx === null) {
    return
  }
  playerSave.updateSettings({
    ...(typeof muted === 'boolean' ? { muted } : {}),
    ...(typeof music === 'number' ? { musicVolume: music } : {}),
    ...(typeof sfx === 'number' ? { sfxVolume: sfx } : {}),
  })
  if (playerSave.saveNow()) {
    for (const key of keys) {
      save.remove(key)
    }
  }
}
