import type { ProgressionSnapshot } from '../systems/progression/ProgressionManager.ts'
import type { CharacterCollectionState, CosmeticType } from '../game/characters/CharacterData.ts'
import { createEl } from '../utils/dom.ts'
import type { HUDState } from './hud/GameHud.ts'
import { GameHud } from './hud/GameHud.ts'
import { ErrorScreen } from './screens/ErrorScreen.ts'
import type { GameOverSummary } from './screens/GameOverScreen.ts'
import { GameOverScreen } from './screens/GameOverScreen.ts'
import { LoadingScreen } from './screens/LoadingScreen.ts'
import { MenuScreen } from './screens/MenuScreen.ts'
import { PauseScreen } from './screens/PauseScreen.ts'
import type { Screen } from './screens/Screen.ts'
import { LevelSelectionScreen } from './screens/LevelSelectionScreen.ts'
import { CharacterSelectionScreen } from './screens/CharacterSelectionScreen.ts'
import { LevelCompletedScreen } from './screens/LevelCompletedScreen.ts'
import { SettingsScreen } from './screens/SettingsScreen.ts'

export interface UIManagerCallbacks {
  onPlay: () => void
  onRestart: () => void
  onResume: () => void
  onQuit: () => void
  onPause: () => void
  onToggleMute: () => void
  onReload: () => void
  onJump: () => void
  onSlide: () => void
  onDash: () => void
  onCharacter: () => void
  onSettings: () => void
  onSelectLevel: (levelId: string) => void
  onEquipCosmetic: (type: CosmeticType, id: string) => void
  onNextLevel: () => void
  onPurchase: (type: CosmeticType, id: string, cost: number) => void
  onChangeSettings: (settings: any) => void
}

/**
 * Owns every DOM overlay and coordinates the transition between game states.
 * Screens are created once and reused, which avoids layout churn mid-run.
 */
export class UIManager {
  readonly hud: GameHud

  private readonly layer: HTMLDivElement
  private readonly loading: LoadingScreen
  private readonly menu: MenuScreen
  private readonly pause: PauseScreen
  private readonly gameOver: GameOverScreen
  private readonly error: ErrorScreen
  private readonly levelSelection: LevelSelectionScreen
  private readonly characterSelection: CharacterSelectionScreen
  private readonly levelCompleted: LevelCompletedScreen
  private readonly settings: SettingsScreen
  private readonly screens: Screen[]
  private disposed = false
  private currentSnapshot: ProgressionSnapshot = {
    bestScore: 0,
    bestDistance: 0,
    totalRuns: 0,
    totalCrystals: 0,
    coins: 0,
  }
  private currentMuted: boolean = false

  constructor(container: HTMLElement, callbacks: UIManagerCallbacks) {
    this.layer = createEl('div', 'ui-layer')
    container.appendChild(this.layer)

    this.loading = new LoadingScreen()
    this.menu = new MenuScreen({
      onPlay: callbacks.onPlay,
      onCharacter: callbacks.onCharacter,
      onSettings: callbacks.onSettings,
      onToggleMute: callbacks.onToggleMute,
    })
    this.pause = new PauseScreen({
      onResume: callbacks.onResume,
      onQuit: callbacks.onQuit,
      onToggleMute: callbacks.onToggleMute,
    })
    this.gameOver = new GameOverScreen({
      onRestart: callbacks.onRestart,
      onQuit: callbacks.onQuit,
    })
    this.error = new ErrorScreen({ onReload: callbacks.onReload })
    this.levelSelection = new LevelSelectionScreen({
      onSelectLevel: callbacks.onSelectLevel,
      onBack: () => this.showMenu(this.currentSnapshot, this.currentMuted),
    })
    this.characterSelection = new CharacterSelectionScreen({
      onBack: () => this.showMenu(this.currentSnapshot, this.currentMuted),
      onPurchase: callbacks.onPurchase,
      onEquip: callbacks.onEquipCosmetic,
    })
    this.levelCompleted = new LevelCompletedScreen({
      onNextLevel: callbacks.onNextLevel,
      onRestart: callbacks.onRestart,
      onMenu: () => this.showMenu(this.currentSnapshot, this.currentMuted),
    })
    this.settings = new SettingsScreen({
      onBack: () => this.showMenu(this.currentSnapshot, this.currentMuted),
      onChangeSettings: callbacks.onChangeSettings,
    })

    this.hud = new GameHud({
      onPause: callbacks.onPause,
      onJump: callbacks.onJump,
      onSlide: callbacks.onSlide,
      onDash: callbacks.onDash,
    })

    this.screens = [
      this.loading,
      this.menu,
      this.pause,
      this.gameOver,
      this.error,
      this.levelSelection,
      this.characterSelection,
      this.levelCompleted,
      this.settings,
    ]
    this.layer.append(...this.screens.map((screen) => screen.root), this.hud.root)

    this.showLoading()
  }

  showLoading(): void {
    this.hideAll()
    this.loading.show()
  }

  setLoadingProgress(value: number, label?: string): void {
    this.loading.setProgress(value, label)
  }

  showMenu(snapshot: ProgressionSnapshot, muted: boolean): void {
    this.currentSnapshot = snapshot
    this.currentMuted = muted
    this.hideAll()
    this.menu.setProgression(snapshot)
    this.menu.setMuted(muted)
    this.menu.show()
  }

  showLevelSelection(
    levels: any,
    unlockedLevels: readonly string[],
    levelProgress: any,
    currentCoins: number,
  ): void {
    this.hideAll()
    this.levelSelection.setData({ levels, unlockedLevels, levelProgress, currentCoins })
    this.levelSelection.show()
  }

  /** Opens the character screen, or refreshes it in place when already open. */
  showCharacterSelection(data: {
    collection: CharacterCollectionState
    currentCoins: number
  }): void {
    if (!this.characterSelection.root.hidden) {
      this.characterSelection.setData(data)
      return
    }
    this.hideAll()
    this.characterSelection.setData(data)
    this.characterSelection.show()
  }

  showLevelCompleted(data: any): void {
    this.hideAll()
    this.levelCompleted.showResult(data)
    this.levelCompleted.show()
  }

  showSettings(settings: any): void {
    this.hideAll()
    this.settings.setSettings({
      musicVolume: settings.musicVolume,
      sfxVolume: settings.sfxVolume,
      muted: settings.muted,
      graphicsQuality: settings.quality,
      showHints: settings.controlHints,
      vibrationEnabled: settings.vibration,
      difficulty: settings.difficulty,
    })
    this.settings.show()
  }

  showHud(): void {
    this.hideScreens()
    this.hud.show()
  }

  showPause(muted: boolean): void {
    this.hideAll()
    this.pause.setMuted(muted)
    this.pause.show()
  }

  showGameOver(summary: GameOverSummary): void {
    this.hideAll()
    this.gameOver.showResult(summary)
  }

  showError(message: string): void {
    this.hideAll()
    this.error.setMessage(message)
    this.error.show()
  }

  /** Shows or hides keyboard/touch control hints on every screen and the HUD. */
  setHintsVisible(visible: boolean): void {
    this.layer.classList.toggle('ui-layer--no-hints', !visible)
  }

  setMuted(muted: boolean): void {
    this.menu.setMuted(muted)
    this.pause.setMuted(muted)
  }

  updateHud(state: HUDState): void {
    this.hud.update(state)
  }

  pushFeedback(text: string, tone: 'coin' | 'powerup' | 'reward' | 'shield' = 'coin'): void {
    this.hud.pushFeedback(text, tone)
  }

  hideAll(): void {
    this.hideScreens()
    this.hud.hide()
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true

    this.hud.dispose()
    for (const screen of this.screens) {
      screen.dispose()
    }
    this.layer.remove()
  }

  private hideScreens(): void {
    for (const screen of this.screens) {
      screen.hide()
    }
  }
}
