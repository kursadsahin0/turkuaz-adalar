import type { LevelProgressionManager } from '../../game/levels/LevelProgression.ts'
import type { AudioManager } from '../../systems/audio/AudioManager.ts'
import type { Haptics } from '../../systems/haptics/Haptics.ts'
import type { MetaProgress } from '../../systems/meta/MetaProgress.ts'
import type { MonetizationManager } from '../../systems/monetization/MonetizationManager.ts'
import type { ConsentManager } from '../../systems/privacy/ConsentManager.ts'
import type { ProgressionManager } from '../../systems/progression/ProgressionManager.ts'
import type { PlayerSaveManager } from '../../systems/save/PlayerSaveManager.ts'
import type { SaveManager } from '../../systems/save/SaveManager.ts'
import type { Telemetry } from '../../systems/telemetry/Telemetry.ts'
import type { UIManager } from '../../ui/UIManager.ts'

/**
 * The long-lived systems the Game owns, shared with its controllers. Audio is
 * created during `Game.init()`, so it is undefined until loading finishes.
 */
export interface GameServices {
  readonly ui: UIManager
  readonly save: SaveManager
  readonly playerSave: PlayerSaveManager
  readonly progression: ProgressionManager
  readonly meta: MetaProgress
  readonly levels: LevelProgressionManager
  readonly consent: ConsentManager
  readonly monetization: MonetizationManager
  readonly telemetry: Telemetry
  readonly haptics: Haptics
  readonly audio: AudioManager | undefined
}

/** The shared "you got something" sound and buzz. */
export function celebrate(services: GameServices): void {
  services.audio?.play('reward')
  services.haptics.pulse('reward')
}
