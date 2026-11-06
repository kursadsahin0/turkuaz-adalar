import type { DoubleCoinsState } from './components/DoubleCoinsButton.ts'
import type { CharacterCollectionState, CosmeticType } from '../game/characters/CharacterData.ts'
import type { AchievementId } from '../systems/meta/Achievements.ts'
import type { DailyStatus, Reward } from '../systems/meta/DailyRewards.ts'
import type { ProgressionSnapshot } from '../systems/progression/ProgressionManager.ts'
import { createEl } from '../utils/dom.ts'
import type { HUDState, HudTutorial } from './hud/GameHud.ts'
import { GameHud } from './hud/GameHud.ts'
import { ConsentScreen } from './screens/ConsentScreen.ts'
import { PrivacyPolicyScreen } from './screens/PrivacyPolicyScreen.ts'
import { CharacterSelectionScreen } from './screens/CharacterSelectionScreen.ts'
import { ContinueScreen, type ContinueOffer } from './screens/ContinueScreen.ts'
import { DailyRewardScreen } from './screens/DailyRewardScreen.ts'
import { ErrorScreen } from './screens/ErrorScreen.ts'
import type { GameOverSummary } from './screens/GameOverScreen.ts'
import { GameOverScreen } from './screens/GameOverScreen.ts'
import { LevelCompletedScreen } from './screens/LevelCompletedScreen.ts'
import { LevelSelectionScreen, type LevelSelectionData } from './screens/LevelSelectionScreen.ts'
import { LoadingScreen } from './screens/LoadingScreen.ts'
import { MenuScreen, type MenuBadges } from './screens/MenuScreen.ts'
import { PauseScreen } from './screens/PauseScreen.ts'
import { ProgressScreen, type ProgressData } from './screens/ProgressScreen.ts'
import type { Screen } from './screens/Screen.ts'
import { SettingsScreen, type SettingsData } from './screens/SettingsScreen.ts'

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
  onSkipTutorial: () => void
  onReplayTutorial: () => void
  onCharacter: () => void
  onCloseCharacter: () => void
  /** Any "back to menu" button; the game re-renders the menu with fresh data. */
  onBackToMenu: () => void
  onProgress: () => void
  onDaily: () => void
  onClaimDaily: () => void
  onClaimMission: (id: string) => void
  onClaimAchievement: (id: AchievementId) => void
  onSettings: () => void
  onSelectLevel: (levelId: string | null) => void
  onUnlockLevel: (levelId: string) => void
  onLevelSelect: () => void
  onEquipCosmetic: (type: CosmeticType, id: string) => void
  onNextLevel: () => void
  onPurchase: (type: CosmeticType, id: string, cost: number) => void
  onExchangeCrystals: () => void
  onRotatePreview: (deltaX: number) => void
  onPreviewCosmetic: (type: CosmeticType, id: string) => void
  onChangeSettings: (settings: Partial<SettingsData>) => void
  onResetProgress: () => void
  onContinueCoins: () => void
  onContinueAd: () => void
  onDoubleCoins: () => void
  onContinueSkip: () => void
  onConsent: (personalizedAds: boolean) => void
  onOpenPolicy: () => void
  onClosePolicy: () => void
  onAdPrivacyOptions: () => void
}

interface Screens {
  readonly loading: LoadingScreen
  readonly menu: MenuScreen
  readonly pause: PauseScreen
  readonly gameOver: GameOverScreen
  readonly error: ErrorScreen
  readonly levelSelection: LevelSelectionScreen
  readonly characterSelection: CharacterSelectionScreen
  readonly levelCompleted: LevelCompletedScreen
  readonly settings: SettingsScreen
  readonly progress: ProgressScreen
  readonly daily: DailyRewardScreen
  readonly continueOffer: ContinueScreen
  readonly consent: ConsentScreen
  readonly policy: PrivacyPolicyScreen
  readonly hud: GameHud
}

/**
 * Owns every DOM overlay and coordinates the transition between game states.
 * Screens are created once and reused; a language change rebuilds them so
 * every string is re-rendered in the new language.
 */
export class UIManager {
  private readonly layer: HTMLDivElement
  private readonly callbacks: UIManagerCallbacks
  private ui: Screens
  private disposed = false
  private currentSnapshot: ProgressionSnapshot = {
    bestScore: 0,
    bestDistance: 0,
    totalRuns: 0,
    totalCrystals: 0,
    coins: 0,
    crystalBalance: 0,
    totalCoinsEarned: 0,
  }
  private currentMuted = false
  private currentBadges: MenuBadges = { dailyReady: false, claimable: 0 }

  constructor(container: HTMLElement, callbacks: UIManagerCallbacks) {
    this.callbacks = callbacks
    this.layer = createEl('div', 'ui-layer')
    container.appendChild(this.layer)
    this.ui = this.build()
    this.showLoading()
  }

  get hud(): GameHud {
    return this.ui.hud
  }

  /** Re-creates every screen in the current language and reopens settings. */
  rebuild(settings: SettingsData): void {
    this.disposeScreens()
    this.ui = this.build()
    this.ui.menu.setProgression(this.currentSnapshot)
    this.ui.menu.setMuted(this.currentMuted)
    this.ui.menu.setBadges(this.currentBadges)
    this.showSettings(settings)
  }

  showLoading(): void {
    this.hideAll()
    this.ui.loading.show()
  }

  setLoadingProgress(value: number, label?: string): void {
    this.ui.loading.setProgress(value, label)
  }

  showMenu(snapshot: ProgressionSnapshot, muted: boolean): void {
    this.currentSnapshot = snapshot
    this.currentMuted = muted
    this.hideAll()
    this.ui.menu.setProgression(snapshot)
    this.ui.menu.setMuted(muted)
    this.ui.menu.setBadges(this.currentBadges)
    this.ui.menu.show()
  }

  setMenuBadges(badges: MenuBadges): void {
    this.currentBadges = badges
    this.ui.menu.setBadges(badges)
  }

  /** Opens the island list, or refreshes it in place when already open. */
  showLevelSelection(data: LevelSelectionData): void {
    const screen = this.ui.levelSelection
    if (screen.root.hidden) {
      this.hideAll()
      screen.setData(data)
      screen.show()
      return
    }
    screen.setData(data)
  }

  get isLevelCompletedVisible(): boolean {
    return !this.ui.levelCompleted.root.hidden
  }

  /** Opens the character screen, or refreshes it in place when already open. */
  showCharacterSelection(data: {
    collection: CharacterCollectionState
    currentCoins: number
    currentCrystals: number
  }): void {
    const screen = this.ui.characterSelection
    if (!screen.root.hidden) {
      screen.setData(data)
      return
    }
    this.hideAll()
    screen.setData(data)
    screen.show()
  }

  /** True when the title screen itself (not an overlay on top of it) is showing. */
  get isMenuVisible(): boolean {
    return !this.ui.menu.root.hidden
  }

  /** True while the run summary is on screen (it appears after a short beat). */
  get isGameOverVisible(): boolean {
    return !this.ui.gameOver.root.hidden
  }

  get isCharacterSelectionOpen(): boolean {
    return !this.ui.characterSelection.root.hidden
  }

  /** Opens the missions screen, or refreshes it in place when already open. */
  showProgress(data: ProgressData): void {
    const screen = this.ui.progress
    if (screen.root.hidden) {
      this.hideAll()
      screen.setData(data)
      screen.show()
      return
    }
    screen.setData(data)
  }

  showDaily(status: DailyStatus, rewards: readonly Reward[]): void {
    const screen = this.ui.daily
    screen.setData(status, rewards)
    if (screen.root.hidden) {
      this.hideAll()
      screen.show()
    }
  }

  showContinue(offer: ContinueOffer): void {
    this.hideAll()
    this.ui.continueOffer.offer(offer)
  }

  /** Updates the "double your coins" button on whichever summary is open. */
  setDoubleCoinsState(state: DoubleCoinsState): void {
    this.ui.gameOver.doubleCoins.setState(state)
    this.ui.levelCompleted.doubleCoins.setState(state)
  }

  setContinueAdPlaying(playing: boolean, failed = false): void {
    this.ui.continueOffer.setAdPlaying(playing, failed)
  }

  showConsent(): void {
    this.hideAll()
    this.ui.consent.show()
  }

  /** The policy opens on top of whatever is showing and closes back to it. */
  showPolicy(): void {
    this.ui.policy.show()
  }

  hidePolicy(): void {
    this.ui.policy.hide()
  }

  get isPolicyOpen(): boolean {
    return !this.ui.policy.root.hidden
  }

  get isConsentOpen(): boolean {
    return !this.ui.consent.root.hidden
  }

  showLevelCompleted(data: Parameters<LevelCompletedScreen['showResult']>[0]): void {
    this.hideAll()
    this.ui.levelCompleted.showResult(data)
    this.ui.levelCompleted.show()
  }

  showSettings(settings: SettingsData): void {
    this.hideAll()
    this.ui.settings.setSettings(settings)
    this.ui.settings.show()
  }

  showHud(): void {
    this.hideScreens()
    this.ui.hud.show()
  }

  showPause(muted: boolean): void {
    this.hideAll()
    this.ui.pause.setMuted(muted)
    this.ui.pause.show()
  }

  showGameOver(summary: GameOverSummary): void {
    this.hideAll()
    this.ui.gameOver.showResult(summary)
  }

  showError(message: string): void {
    this.hideAll()
    this.ui.error.setMessage(message)
    this.ui.error.show()
  }

  /** Shows or hides keyboard/touch control hints on every screen and the HUD. */
  setHintsVisible(visible: boolean): void {
    this.layer.classList.toggle('ui-layer--no-hints', !visible)
  }

  setMuted(muted: boolean): void {
    this.currentMuted = muted
    this.ui.menu.setMuted(muted)
    this.ui.pause.setMuted(muted)
  }

  setTutorial(tutorial: HudTutorial | null): void {
    this.ui.hud.setTutorial(tutorial)
  }

  updateHud(state: HUDState): void {
    this.ui.hud.update(state)
  }

  pushFeedback(text: string, tone: 'coin' | 'powerup' | 'reward' | 'shield' = 'coin'): void {
    this.ui.hud.pushFeedback(text, tone)
  }

  hideAll(): void {
    this.hideScreens()
    this.ui.hud.hide()
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.disposeScreens()
    this.layer.remove()
  }

  private build(): Screens {
    const c = this.callbacks
    const backToMenu = c.onBackToMenu
    const screens: Screens = {
      loading: new LoadingScreen(),
      menu: new MenuScreen({
        onPlay: c.onPlay,
        onCharacter: c.onCharacter,
        onProgress: c.onProgress,
        onDaily: c.onDaily,
        onSettings: c.onSettings,
        onToggleMute: c.onToggleMute,
      }),
      pause: new PauseScreen({
        onResume: c.onResume,
        onQuit: c.onQuit,
        onToggleMute: c.onToggleMute,
      }),
      gameOver: new GameOverScreen({
        onRestart: c.onRestart,
        onQuit: c.onQuit,
        onDoubleCoins: c.onDoubleCoins,
      }),
      error: new ErrorScreen({ onReload: c.onReload }),
      levelSelection: new LevelSelectionScreen({
        onSelectLevel: c.onSelectLevel,
        onUnlockLevel: c.onUnlockLevel,
        onBack: backToMenu,
      }),
      characterSelection: new CharacterSelectionScreen({
        onBack: c.onCloseCharacter,
        onPurchase: c.onPurchase,
        onEquip: c.onEquipCosmetic,
        onExchange: c.onExchangeCrystals,
        onRotate: c.onRotatePreview,
        onPreview: c.onPreviewCosmetic,
      }),
      levelCompleted: new LevelCompletedScreen({
        onNextLevel: c.onNextLevel,
        onRestart: c.onRestart,
        onMenu: c.onLevelSelect,
        onDoubleCoins: c.onDoubleCoins,
      }),
      settings: new SettingsScreen({
        onBack: backToMenu,
        onChangeSettings: c.onChangeSettings,
        onResetProgress: c.onResetProgress,
        onOpenPolicy: c.onOpenPolicy,
        onReplayTutorial: c.onReplayTutorial,
        onAdPrivacyOptions: c.onAdPrivacyOptions,
      }),
      progress: new ProgressScreen({
        onBack: backToMenu,
        onClaimMission: c.onClaimMission,
        onClaimAchievement: c.onClaimAchievement,
      }),
      daily: new DailyRewardScreen({ onClaim: c.onClaimDaily, onClose: backToMenu }),
      continueOffer: new ContinueScreen({
        onPayCoins: c.onContinueCoins,
        onWatchAd: c.onContinueAd,
        onSkip: c.onContinueSkip,
      }),
      consent: new ConsentScreen({
        onAccept: () => c.onConsent(true),
        onEssentialOnly: () => c.onConsent(false),
        onOpenPolicy: c.onOpenPolicy,
      }),
      policy: new PrivacyPolicyScreen({ onClose: c.onClosePolicy }),
      hud: new GameHud({
        onPause: c.onPause,
        onJump: c.onJump,
        onSlide: c.onSlide,
        onDash: c.onDash,
        onSkipTutorial: c.onSkipTutorial,
      }),
    }
    this.layer.append(...this.screenList(screens).map((screen) => screen.root), screens.hud.root)
    return screens
  }

  private screenList(screens: Screens): Screen[] {
    return [
      screens.loading,
      screens.menu,
      screens.pause,
      screens.gameOver,
      screens.error,
      screens.levelSelection,
      screens.characterSelection,
      screens.levelCompleted,
      screens.settings,
      screens.progress,
      screens.daily,
      screens.continueOffer,
      screens.consent,
      screens.policy,
    ]
  }

  private hideScreens(): void {
    for (const screen of this.screenList(this.ui)) {
      screen.hide()
    }
  }

  private disposeScreens(): void {
    this.ui.hud.dispose()
    for (const screen of this.screenList(this.ui)) {
      screen.dispose()
    }
  }
}
