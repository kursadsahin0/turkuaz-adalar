import * as THREE from 'three'
import { ASSET_REGISTRY } from '../assets/AssetRegistry.ts'
import { ModelLoader } from '../assets/ModelLoader.ts'
import { GAME_CONFIG } from '../config/GameConfig.ts'
import { PALETTE } from '../config/Palette.ts'
import { DashAbility } from '../game/abilities/DashAbility.ts'
import { VisualEffectsManager } from '../game/effects/VisualEffectsManager.ts'
import type { CollectiblePickup } from '../game/collectibles/CollectibleKind.ts'
import { ShowcaseCamera } from '../game/camera/ShowcaseCamera.ts'
import { setLanguage, t, tc } from '../i18n/i18n.ts'
import { MetaProgress } from '../systems/meta/MetaProgress.ts'
import { MonetizationManager } from '../systems/monetization/MonetizationManager.ts'
import { NativeBridge } from '../platform/NativeBridge.ts'
import { ConsentManager } from '../systems/privacy/ConsentManager.ts'
import { Telemetry } from '../systems/telemetry/Telemetry.ts'
import { PowerUpSystem } from '../game/powerups/PowerUpSystem.ts'
import { IsometricCameraRig } from '../game/camera/IsometricCameraRig.ts'
import { LevelManager } from '../game/levels/LevelManager.ts'
import { islandName } from '../game/levels/islandName.ts'
import { EVENT_LEVEL_ID, EVENT_REWARD } from '../game/levels/WeeklyEvent.ts'
import { LEVEL_CATALOG } from '../game/levels/LevelCatalog.ts'
import type { LevelDefinition } from '../game/levels/LevelDefinition.ts'
import { LevelProgressionManager, starsFor } from '../game/levels/LevelProgression.ts'
import { Tutorial } from '../game/tutorial/Tutorial.ts'
import { CharacterModel } from '../game/player/CharacterModel.ts'
import { MovementEffects } from '../game/player/MovementEffects.ts'
import { Player } from '../game/player/Player.ts'
import { RunRecovery } from '../game/player/RunRecovery.ts'
import { ChaseWave } from '../game/world/ChaseWave.ts'
import { World } from '../game/world/World.ts'
import type { Obstacle } from '../game/obstacles/Obstacle.ts'
import { AudioManager } from '../systems/audio/AudioManager.ts'
import {
  PerformanceMonitor,
  type PerformanceMetrics,
} from '../systems/performance/PerformanceMonitor.ts'
import { Haptics } from '../systems/haptics/Haptics.ts'
import { ISLAND_STYLES, MENU_STYLE } from '../systems/audio/MusicSequencer.ts'
import { AdaptiveQuality, type RenderQuality } from '../systems/performance/AdaptiveQuality.ts'
import { detectQualityLevel, type QualitySettings } from '../config/QualitySettings.ts'
import { InputManager } from '../systems/input/InputManager.ts'
import { PhysicsWorld } from '../systems/physics/PhysicsWorld.ts'
import { ProgressionManager } from '../systems/progression/ProgressionManager.ts'
import { SaveManager } from '../systems/save/SaveManager.ts'
import { PlayerSaveManager } from '../systems/save/PlayerSaveManager.ts'
import { ContinueController } from './controllers/ContinueController.ts'
import { ChaseController } from './controllers/ChaseController.ts'
import { DoubleCoinsController } from './controllers/DoubleCoinsController.ts'
import { IslandMechanicsController } from './controllers/IslandMechanicsController.ts'
import type { GameServices } from './controllers/GameServices.ts'
import { MetaController } from './controllers/MetaController.ts'
import { migrateLegacyAudioSettings, SettingsController } from './controllers/SettingsController.ts'
import { ShopController } from './controllers/ShopController.ts'
import { TutorialController } from './controllers/TutorialController.ts'
import { Renderer } from './Renderer.ts'
import { SceneManager } from './SceneManager.ts'
import { Time } from './Time.ts'
import { UIManager } from '../ui/UIManager.ts'
import type { HUDState } from '../ui/hud/GameHud.ts'
import { formatDistance } from '../ui/format.ts'
import type { GameOverSummary } from '../ui/screens/GameOverScreen.ts'
import { GameError, toError } from '../utils/errors.ts'
import { Logger } from '../utils/logger.ts'
import { createSeed, Rng } from '../utils/random.ts'

type GameState = 'loading' | 'menu' | 'playing' | 'paused' | 'offer' | 'gameover' | 'error'

const CONTINUE_INVULNERABILITY = 3
/** Metres cleared ahead of the runner after a continue or a fall recovery. */
const RESPAWN_RUNWAY = 25

/**
 * Central orchestrator. Owns every subsystem, the fixed-step simulation and
 * the run state machine. UI code only receives snapshots and callbacks, which
 * keeps gameplay independent from the DOM.
 */
export class Game {
  private readonly container: HTMLElement
  private readonly logger = new Logger('Game')
  private readonly save: SaveManager
  private readonly playerSave: PlayerSaveManager
  private readonly progression: ProgressionManager
  private readonly haptics: Haptics
  private readonly level = new LevelManager()
  private readonly dash = new DashAbility()
  private readonly effects = new MovementEffects()
  private readonly powerUps = new PowerUpSystem()
  private readonly recovery = new RunRecovery()
  private readonly ui: UIManager
  private readonly assets = new ModelLoader(ASSET_REGISTRY)
  private readonly performanceMonitor = new PerformanceMonitor()
  private readonly meta: MetaProgress
  private readonly consent: ConsentManager
  private readonly levels: LevelProgressionManager
  private readonly tutorialFlow: TutorialController
  private readonly shop: ShopController
  /** Island selection, daily rewards, missions and achievements. */
  private readonly menus: MetaController
  private readonly settingsFlow: SettingsController
  private readonly continueOffer: ContinueController
  private readonly doubleCoins: DoubleCoinsController
  /** The island's own rule: ice, wind or ember rain. */
  private readonly mechanics: IslandMechanicsController
  private readonly chase: ChaseController
  private chaseWave: ChaseWave | null = null
  /** The level being played, or null for the endless run. */
  private currentLevel: LevelDefinition | null = null
  private runTime = 0
  private adaptiveQuality: AdaptiveQuality | null = null
  private lastFpsSample = 0
  readonly telemetry: Telemetry
  private readonly monetization = new MonetizationManager({
    // AdMob on Android/iOS; a simulated provider in the browser.
    provider: NativeBridge.isNative ? 'admob' : 'test',
    testMode: !NativeBridge.isNative,
    testConfig: { minDelay: 1500 },
  })
  private readonly showcase = new ShowcaseCamera()
  private readonly native = new NativeBridge()
  private readonly reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  private renderer!: Renderer
  private scene!: SceneManager
  private camera!: IsometricCameraRig
  private physics!: PhysicsWorld
  private world!: World
  private player!: Player
  private fx!: VisualEffectsManager
  private characterModel: CharacterModel | null = null
  private input!: InputManager
  private audio!: AudioManager
  private time!: Time

  private state: GameState = 'loading'
  private distance = 0
  private crystals = 0
  private coins = 0
  private pickupScore = 0
  private score = 0
  private queuedJump = false
  private queuedSlide = false
  private hudTimer = 0
  private checkpointDistance = 0
  private invulnerabilityTimer = 0
  private frameHandle: number | null = null
  private summaryTimer: number | null = null
  private unsubscribeResize: (() => void) | null = null
  private disposed = false
  private readonly scratchFeet = new THREE.Vector3()
  /** Dash trail particles stream backwards, against the -Z run direction. */
  private static readonly TRAIL_DIRECTION = new THREE.Vector3(0, 0.15, 1).normalize()

  private readonly tick = (timestamp: number): void => {
    this.frameHandle = null
    if (this.disposed) {
      return
    }

    this.time.update(timestamp)
    this.performanceMonitor.tick()
    // Auto quality: one FPS sample per second, only while running.
    if (this.state === 'playing' && timestamp - this.lastFpsSample >= 1000) {
      this.lastFpsSample = timestamp
      const lower = this.adaptiveQuality?.sample(this.performanceMonitor.getFPS())
      if (lower) {
        this.renderer.setQualityLevel(lower)
        this.telemetry.track('quality_auto_down', { level: lower })
      }
    }
    const delta = this.time.delta

    switch (this.state) {
      case 'menu':
        this.updateMenu(delta)
        break
      case 'playing':
        this.updatePlaying()
        break
      case 'gameover':
      case 'offer':
        this.updateGameOver(delta)
        break
      case 'paused':
      case 'loading':
      case 'error':
        break
    }

    if (
      this.state === 'menu' ||
      this.state === 'playing' ||
      this.state === 'gameover' ||
      this.state === 'offer'
    ) {
      this.fx.update(delta)
      this.chaseWave?.update(
        this.chase.active && this.state !== 'menu',
        this.player.position.z,
        this.chase.gap ?? 0,
        this.time.elapsed,
      )
      const mode = this.state === 'menu' ? 'menu' : 'follow'
      this.camera.update(delta, this.player.position, mode, this.time.elapsed, this.distance)
      if (this.state === 'menu' && this.shop.isShowcaseActive) {
        const canvas = this.renderer.canvas
        this.showcase.update(
          delta,
          this.player.position,
          canvas.clientWidth,
          canvas.clientHeight,
          this.reducedMotion,
        )
        this.renderer.render(this.scene.scene, this.showcase.camera)
      } else {
        this.renderer.render(this.scene.scene, this.camera.camera)
      }
    }

    if (!this.disposed && this.state !== 'error') {
      this.frameHandle = window.requestAnimationFrame(this.tick)
    }
  }

  private readonly handleVisibility = (): void => {
    if (document.hidden) {
      this.enterBackground()
    } else {
      this.audio?.resume()
    }
  }

  private enterBackground(): void {
    if (this.state === 'playing') {
      this.pause()
    }
    // The app may be killed in the background: write everything now.
    this.playerSave.saveNow()
    this.meta.flush()
    this.haptics.stop()
    this.audio?.suspend()
  }

  /**
   * Android back: step back one level instead of closing the app mid-run.
   * Returns false only on the title screen, which lets the app exit.
   */
  private handleBack(): boolean {
    if (this.ui.isPolicyOpen) {
      this.ui.hidePolicy()
      return true
    }
    if (this.ui.isConsentOpen) {
      // A choice is required; back does nothing here.
      return true
    }
    switch (this.state) {
      case 'playing':
        this.pause()
        return true
      case 'paused':
        this.resume()
        return true
      case 'offer':
        this.declineContinue()
        return true
      case 'gameover':
        // The summary appears after a short beat; ignore back until it does.
        if (this.ui.isGameOverVisible || this.ui.isLevelCompletedVisible) {
          this.returnToMenu()
        }
        return true
      case 'menu':
        if (this.ui.isMenuVisible) {
          return false
        }
        this.showMenuScreen()
        return true
      default:
        return false
    }
  }

  private readonly handlePlayerCollision = (colliderHandle: number): void => {
    if (this.state !== 'playing') {
      return
    }

    const obstacle = this.world.findObstacle(colliderHandle)
    if (obstacle) {
      const contact = obstacle.contact()
      if (contact.kind === 'bounce') {
        this.player.bounce(contact.height)
        return
      }
      if (contact.kind === 'safe') {
        return
      }
      this.handleHazard(obstacle)
      return
    }

    const bouncePad = this.world.consumeBounce(colliderHandle)
    if (bouncePad) {
      this.player.bounce(bouncePad.height)
      return
    }

    const speedPad = this.world.consumeSpeed(colliderHandle)
    if (speedPad) {
      this.activateEffect(speedPad.effect)
    }
  }

  private readonly handlePlayerJump = (): void => {
    if (this.state === 'playing') {
      this.tutorialFlow.action('jump')
      this.menus.notify(this.meta.record({ kind: 'jump', amount: 1 }))
    }
    this.audio?.play('jump')
    this.camera.jump()
    this.fx?.emitJumpDust(this.feetPosition())
  }

  private readonly handlePlayerLand = (impactSpeed: number): void => {
    this.camera.land(impactSpeed)
    // Soft touchdowns (stepping off a pad) stay clean; real landings kick up dust.
    if (impactSpeed > 3) {
      this.fx?.emitLandingDust(this.feetPosition())
    }
  }

  private readonly handlePlayerBounce = (): void => {
    this.audio?.play('bounce')
    this.camera.jump()
    this.camera.shake(0.12, 0.18)
  }

  private readonly handlePlayerSlide = (): void => {
    if (this.state === 'playing') {
      this.tutorialFlow.action('slide')
    }
    this.audio?.play('slide')
  }

  constructor(container: HTMLElement) {
    this.container = container
    this.save = new SaveManager()
    this.playerSave = new PlayerSaveManager(this.save)
    // Installed first so errors during the rest of start-up are recorded.
    this.telemetry = new Telemetry(this.save, {
      version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
      sentryDsn: import.meta.env.VITE_SENTRY_DSN,
      crashReportsAllowed: this.playerSave.settings.crashReports,
      environment: import.meta.env.MODE,
    })
    this.telemetry.install()
    this.telemetry.breadcrumb('app', 'boot')
    if (import.meta.env.DEV) {
      this.telemetry.addAnalyticsSink({
        send: (event) => this.logger.info(`[event] ${event.name}`, event.props),
      })
    }
    this.progression = new ProgressionManager(this.playerSave, this.save)
    migrateLegacyAudioSettings(this.save, this.playerSave)
    this.levels = new LevelProgressionManager(this.playerSave, LEVEL_CATALOG)
    this.meta = new MetaProgress(this.save, this.progression, undefined, () => ({
      islandsCompleted: this.levels.completedCount(),
      totalStars: this.levels.totalStars(),
      charactersOwned: this.playerSave.characterCollection.ownedCharacters.length,
    }))
    this.consent = new ConsentManager(this.save)
    this.monetization.setPersonalizedAds(this.consent.personalizedAds)
    this.monetization.onEvent = (event) => this.telemetry.track(event.type)
    this.haptics = new Haptics(this.playerSave.settings.vibration)
    // Language must be set before any screen is built.
    setLanguage(this.playerSave.settings.language)
    this.ui = new UIManager(container, {
      onPlay: () => this.menus.showLevelSelection(),
      onRestart: () => this.startRun(this.currentLevel),
      onResume: () => this.resume(),
      onQuit: () => this.quit(),
      onPause: () => this.pause(),
      onToggleMute: () => this.settingsFlow.toggleMute(),
      onReload: () => window.location.reload(),
      onJump: () => this.input?.queueJump(),
      onSlide: () => this.input?.queueSlide(),
      onDash: () => this.input?.queueDash(),
      onSkipTutorial: () => this.tutorialFlow.end('skip'),
      onReplayTutorial: () => this.tutorialFlow.replay(),
      onCharacter: () => this.shop.open(),
      onCloseCharacter: () => this.showMenuScreen(),
      onBackToMenu: () => this.showMenuScreen(),
      onProgress: () => this.menus.showProgress(),
      onDaily: () => this.menus.showDaily(),
      onClaimDaily: () => this.menus.claimDaily(),
      onClaimMission: (id) => this.menus.claimMission(id),
      onClaimAchievement: (id) => this.menus.claimAchievement(id),
      onSettings: () => this.settingsFlow.show(),
      onSelectLevel: (id) => this.startRun(this.menus.findLevel(id)),
      onUnlockLevel: (id) => this.menus.unlockLevel(id),
      onLevelSelect: () => {
        this.returnToMenu()
        this.menus.showLevelSelection()
      },
      onEquipCosmetic: (type, id) => this.shop.equip(type, id),
      onNextLevel: () => {
        const next = this.currentLevel ? this.levels.getNextLevel(this.currentLevel.id) : null
        this.startRun(next && this.levels.isUnlocked(next.id) ? next : this.currentLevel)
      },
      onPurchase: (type, id) => this.shop.purchase(type, id),
      onExchangeCrystals: () => this.shop.exchangeCrystals(),
      onRotatePreview: (deltaX) => this.shop.rotatePreview(deltaX),
      onPreviewCosmetic: (type, id) => this.shop.preview(type, id),
      onChangeSettings: (settings) => this.settingsFlow.change(settings),
      onResetProgress: () => this.settingsFlow.resetProgress(),
      onContinueCoins: () => this.continueOffer.payWithCoins(),
      onContinueAd: () => void this.continueOffer.watchAd(),
      onContinueSkip: () => this.declineContinue(),
      onDoubleCoins: () => void this.doubleCoins.watch(),
      onConsent: (personalized) => this.settingsFlow.recordConsent(personalized),
      onOpenPolicy: () => this.ui.showPolicy(),
      onClosePolicy: () => this.ui.hidePolicy(),
      onAdPrivacyOptions: () => this.settingsFlow.showAdPrivacyOptions(),
    })

    // Controllers share the long-lived systems; audio appears after init().
    const currentAudio = (): AudioManager | undefined => this.audio
    const services: GameServices = {
      ui: this.ui,
      save: this.save,
      playerSave: this.playerSave,
      progression: this.progression,
      meta: this.meta,
      levels: this.levels,
      consent: this.consent,
      monetization: this.monetization,
      telemetry: this.telemetry,
      haptics: this.haptics,
      get audio() {
        return currentAudio()
      },
    }
    this.tutorialFlow = new TutorialController(services, new Tutorial(this.playerSave), (enabled) =>
      this.world.setObstaclesEnabled(enabled),
    )
    this.shop = new ShopController(services, this.showcase, {
      characterModel: () => this.characterModel,
      setCollectiblesVisible: (visible) => this.world?.setCollectiblesVisible(visible),
    })
    this.menus = new MetaController(services, () => this.state === 'playing')
    this.settingsFlow = new SettingsController(services, {
      setQuality: (level, auto) => {
        this.renderer.setQualityLevel(level)
        this.adaptiveQuality?.setEnabled(auto, level)
      },
      afterConsent: () => this.showMenuScreen(),
      isDisposed: () => this.disposed,
    })
    this.doubleCoins = new DoubleCoinsController(services)
    this.chase = new ChaseController(services)
    this.mechanics = new IslandMechanicsController(
      services,
      {
        laneIndex: () => this.player.laneIndex,
        laneCount: () => this.player.laneCount,
        laneClear: (lane, seconds) => {
          const x = GAME_CONFIG.track.lanePositions[lane]
          const z = this.player.position.z
          const reach = this.level.speed * seconds
          for (let ahead = 0; ahead <= reach; ahead += 2) {
            if (this.world.obstacles.isBlocked(x, z - ahead, 0.6)) {
              return false
            }
          }
          return true
        },
        push: (direction) => this.input.queueLaneChange(direction),
      },
      new Rng(createSeed()),
    )
    this.continueOffer = new ContinueController(services, {
      isOffering: () => this.state === 'offer',
      isDisposed: () => this.disposed,
      revive: () => this.revive(),
    })

    this.ui.setHintsVisible(this.playerSave.settings.controlHints)
    this.ui.setLoadingProgress(0.06, t('loading.waking'))
  }

  async init(): Promise<void> {
    try {
      this.ui.setLoadingProgress(0.18, t('loading.raising'))
      // The physics chunk downloads and compiles while the renderer starts.
      const physicsReady = PhysicsWorld.create()
      physicsReady.catch(() => undefined) // Awaited below; avoids an unhandled-rejection warning.

      const quality = this.playerSave.settings.quality
      const startLevel = (quality === 'auto' ? detectQualityLevel() : quality) as RenderQuality
      this.renderer = new Renderer(this.container, startLevel)
      this.adaptiveQuality = new AdaptiveQuality(startLevel, quality === 'auto')
      this.scene = new SceneManager()
      this.camera = new IsometricCameraRig(this.resolveAspect())
      this.unsubscribeResize = this.renderer.events.on('resize', (size) => {
        this.camera?.setAspect(size.aspect)
      })

      this.physics = await physicsReady
      this.ui.setLoadingProgress(0.46, t('loading.lighting'))

      this.ui.setLoadingProgress(0.56, t('loading.summoning'))
      const qualitySettings = this.renderer.getQualitySettings()
      // Props are optional: a failed download logs a warning and the
      // procedural fallback is used, so they load in parallel and never block.
      const propsPromise = Promise.all([
        this.assets.loadSafe('obstacle.crate'),
        this.assets.loadSafe('obstacle.spire'),
        this.assets.loadSafe('collectible.crystal'),
        this.assets.loadSafe('environment.tide_beacon'),
      ])
      const character = await this.loadCharacterModel(qualitySettings)
      const [crate, spire, crystal, beacon] = await propsPromise

      this.ui.setLoadingProgress(0.78, t('loading.tuning'))
      const settings = this.playerSave.settings
      this.audio = new AudioManager({
        muted: settings.muted,
        musicVolume: settings.musicVolume,
        sfxVolume: settings.sfxVolume,
      })
      this.input = new InputManager(this.renderer.canvas, {
        // Esc / P: pause during a run, otherwise step back one screen (like Android back).
        onPause: () => void this.handleBack(),
        onToggleMute: () => this.settingsFlow.toggleMute(),
      })

      this.ui.setLoadingProgress(0.86, t('loading.painting'))
      this.world = new World(this.scene.scene, this.physics, this.level, {
        crate,
        spire,
        crystal,
        beacon,
      })
      this.fx = new VisualEffectsManager(this.scene.scene, 256, qualitySettings.particleMultiplier)
      this.chaseWave = new ChaseWave(this.scene.scene)
      this.player = new Player(this.scene.scene, this.physics)
      this.player.platformMotionProvider = (handle) =>
        this.world.platformVelocity(handle) ?? this.world.obstaclePlatformVelocity(handle)
      this.camera.setOccluders(() => this.world.cameraOccluders())
      if (character) {
        this.characterModel = character
        this.shop.applyAppearance()
        this.player.attachCharacter(character)
      }
      this.player.onCollision = this.handlePlayerCollision
      this.player.onJump = this.handlePlayerJump
      this.player.onLand = this.handlePlayerLand
      this.player.onBounce = this.handlePlayerBounce
      this.player.onSlide = this.handlePlayerSlide

      this.ui.setLoadingProgress(0.92, t('loading.lifting'))
      this.time = new Time()
      this.world.init()
      this.player.reset(this.spawnPosition())
      this.camera.snapTo(this.player.position, 'menu')

      document.addEventListener('visibilitychange', this.handleVisibility)
      // Browsers only allow audio after a user gesture: start the music on the first one.
      window.addEventListener('pointerdown', this.unlockAudioOnce, { once: true })
      window.addEventListener('keydown', this.unlockAudioOnce, { once: true })
      void this.native.attach({
        onBack: () => this.handleBack(),
        onBackground: () => this.enterBackground(),
        onForeground: () => this.audio?.resume(),
      })

      this.ui.setLoadingProgress(1, t('loading.ready'))
      this.state = 'menu'
      this.showMenuScreen()
      void this.settingsFlow.runConsentFlow()
      this.frameHandle = window.requestAnimationFrame(this.tick)
      this.logger.info('Game ready.')
    } catch (error) {
      this.fail(error)
    }
  }

  /** FPS, frame time and JS heap usage (heap is Chromium-only). See PERFORMANCE.md. */
  getPerformanceMetrics(): PerformanceMetrics {
    return this.performanceMonitor.getMetrics()
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.performanceMonitor.dispose()

    if (this.frameHandle !== null) {
      window.cancelAnimationFrame(this.frameHandle)
      this.frameHandle = null
    }
    this.clearSummaryTimer()
    document.removeEventListener('visibilitychange', this.handleVisibility)
    window.removeEventListener('pointerdown', this.unlockAudioOnce)
    window.removeEventListener('keydown', this.unlockAudioOnce)
    this.meta.flush()
    this.playerSave.dispose()
    this.monetization.dispose()
    this.native.dispose()
    this.telemetry.dispose()
    this.unsubscribeResize?.()
    this.unsubscribeResize = null

    this.haptics.stop()
    this.input?.dispose()
    this.audio?.dispose()
    this.player?.dispose()
    this.fx?.dispose()
    this.chaseWave?.dispose()
    this.world?.dispose()
    this.scene?.dispose()
    this.assets.dispose()
    this.renderer?.dispose()
    this.physics?.dispose()
    this.ui.dispose()
  }

  private async loadCharacterModel(
    qualitySettings: QualitySettings,
  ): Promise<CharacterModel | null> {
    const definition = ASSET_REGISTRY.get('character.turkuaz')
    if (!definition) {
      this.logger.warn(
        'Character asset "character.turkuaz" is not registered; using the procedural capsule fallback.',
      )
      return null
    }

    try {
      const asset = await this.assets.load(definition.id, {
        qualityMultiplier: qualitySettings.geometryDetail,
        textureCompression: qualitySettings.textureCompression,
        onProgress: (progress) => {
          const percent = Math.round(progress.ratio * 100)
          this.ui.setLoadingProgress(
            0.56 + progress.ratio * 0.2,
            progress.ratio >= 1
              ? t('loading.dressing')
              : t('loading.summoningPercent', { percent }),
          )
        },
      })
      const targetHeight = (GAME_CONFIG.player.halfHeight + GAME_CONFIG.player.radius) * 2
      const character = new CharacterModel(asset, { targetHeight })
      this.logger.info(
        `Character "${definition.id}" ready with states: ${character.availableStates.join(', ')}.`,
      )
      return character
    } catch (error) {
      this.logger.warn(
        `Character GLB "${definition.url}" failed to load; using the procedural capsule fallback.`,
        error,
      )
      return null
    }
  }

  private startRun(level: LevelDefinition | null = this.currentLevel): void {
    if (this.disposed || !this.time) {
      return
    }

    this.clearSummaryTimer()
    const difficulty = this.playerSave.settings.difficulty
    // The weekly event island is open to everyone and outside the unlock chain.
    if (level && level.id !== EVENT_LEVEL_ID && !this.levels.isUnlocked(level.id)) {
      level = null
    }
    this.currentLevel = level
    // Must be set before world.reset(): segments read the level as they spawn.
    this.level.setLevel(level)
    const tutorialRun = this.tutorialFlow.beginRun()
    this.level.reset(difficulty)
    this.runTime = 0
    this.dash.reset()
    this.effects.reset()
    this.powerUps.reset()
    this.recovery.reset()
    this.input.reset()
    this.queuedJump = false
    this.queuedSlide = false
    this.distance = 0
    this.crystals = 0
    this.coins = 0
    this.pickupScore = 0
    this.score = 0
    this.hudTimer = 0
    this.checkpointDistance = 0
    this.invulnerabilityTimer = 0
    this.continueOffer.reset()
    this.doubleCoins.reset()
    this.menus.beginRun()
    this.shop.close()

    this.world.reset()
    this.world.applyTheme(level?.theme ?? null)
    // The runner travels along -Z, so the line sits at -targetDistance.
    this.world.setFinishLine(level ? GAME_CONFIG.player.startZ - level.targetDistance : null)
    this.fx.clear()
    this.player.setShieldActive(false)
    this.player.reset(this.spawnPosition())
    // Only the translation is recentred; the framing blends from menu to run.
    this.camera.recenter(this.player.position, 0)
    this.time.resetAccumulator()

    this.state = 'playing'
    this.ui.showHud()
    this.updateHud()
    this.tutorialFlow.runStarted(this.player.laneIndex, tutorialRun)
    this.mechanics.begin(level?.mechanic)
    this.chase.begin(!tutorialRun && level?.chase)

    this.telemetry.track('run_start', { difficulty, level: level?.id ?? 'endless' })
    this.audio.setMusicStyle(ISLAND_STYLES[level?.theme.id ?? 'shallows'] ?? ISLAND_STYLES.shallows)
    this.audio.setMusicIntensity('run')
    void this.audio.unlock().then(() => {
      this.audio.play('start')
    })
  }

  private pause(): void {
    if (this.state !== 'playing') {
      return
    }

    this.state = 'paused'
    this.meta.flush()
    this.queuedJump = false
    this.input.reset()
    this.ui.showPause(this.audio.isMuted)
    this.audio.play('ui')
  }

  private resume(): void {
    if (this.state !== 'paused') {
      return
    }

    this.state = 'playing'
    this.time.resetAccumulator()
    this.ui.showHud()
    this.updateHud()
    this.audio.play('ui')
  }

  private quit(): void {
    if (this.state === 'paused') {
      this.finishRun(false, true)
      return
    }
    if (this.state === 'gameover') {
      this.returnToMenu()
    }
  }

  /** Every route back to the title screen, with a fresh wallet and badges. */
  private showMenuScreen(): void {
    this.shop.close()
    // Floating coins behind the title only add clutter; a run re-places them.
    this.world?.setCollectiblesVisible(false)
    this.audio?.setMusicStyle(MENU_STYLE)
    this.audio?.setMusicIntensity('menu')
    this.menus.refreshBadges()
    this.ui.showMenu(this.progression.snapshot, this.audio?.isMuted ?? false)
  }

  private readonly unlockAudioOnce = (): void => {
    void this.audio?.unlock()
  }

  private returnToMenu(): void {
    if (this.disposed) {
      return
    }

    this.clearSummaryTimer()
    this.input.reset()
    this.tutorialFlow.end('suspend')
    this.mechanics.end()
    this.chase.end()
    this.level.setLevel(null)
    this.level.reset()
    this.dash.reset()
    this.effects.reset()
    this.powerUps.reset()
    this.recovery.reset()
    this.queuedJump = false
    this.queuedSlide = false
    this.distance = 0
    this.crystals = 0
    this.coins = 0
    this.pickupScore = 0
    this.score = 0
    this.checkpointDistance = 0
    this.invulnerabilityTimer = 0
    this.world.reset()
    this.world.applyTheme(null)
    this.world.setFinishLine(null)
    this.fx.clear()
    this.player.setShieldActive(false)
    this.player.reset(this.spawnPosition())
    // The menu framing blends back in instead of cutting.
    this.camera.recenter(this.player.position, 0)
    this.state = 'menu'
    this.showMenuScreen()
    this.audio.play('ui')
  }

  private updateMenu(delta: number): void {
    this.world.updateVisuals(delta, this.time.elapsed, this.player.position)
    this.player.updateVisual(delta, this.time.elapsed, false, true)
  }

  private updatePlaying(): void {
    if (this.input.consumeJump()) {
      this.queuedJump = true
    }
    if (this.input.consumeSlide()) {
      this.queuedSlide = true
    }

    if (this.input.consumeDash() && this.dash.tryActivate()) {
      this.tutorialFlow.action('dash')
      this.menus.notify(this.meta.record({ kind: 'dash', amount: 1 }))
      this.audio.play('dash')
      this.haptics.pulse('dash')
      this.camera.shake(0.16, 0.22)
    }

    const steps = this.time.consumeFixedSteps()
    const fixedDelta = this.time.fixedDelta
    const jumpHeld = this.input.isJumpHeld()
    const speedScale = this.effects.speedMultiplier

    for (let step = 0; step < steps; step += 1) {
      if (this.state !== 'playing') {
        break
      }

      // Moving obstacles keep pace with slow time.
      this.world.fixedUpdate(fixedDelta * this.powerUps.timeScale)
      // Slow time scales the whole run: speed, moving obstacles and the wave.
      const timeScale = this.powerUps.timeScale
      const forwardSpeed =
        this.level.speed *
        this.dash.speedMultiplier *
        speedScale *
        this.powerUps.speedMultiplier *
        timeScale
      this.player.fixedUpdate(fixedDelta, {
        laneChange: this.input.consumeLaneChange(),
        jump: this.queuedJump,
        jumpHeld,
        slide: this.queuedSlide,
        forwardSpeed,
        airJumps: this.powerUps.airJumps,
        gravityScale: this.effects.gravityScale * this.powerUps.gravityScale,
        jumpScale: this.effects.jumpScale,
        laneControl: this.effects.laneControl * this.mechanics.laneControl,
      })
      this.queuedJump = false
      this.queuedSlide = false
      this.dash.update(fixedDelta)
      this.physics.step(fixedDelta)
      this.player.syncTransform()
      this.effects.update(fixedDelta)
      this.powerUps.update(fixedDelta)
      this.mechanics.update(fixedDelta)

      this.updateRunProgress(fixedDelta)
      if (
        this.state === 'playing' &&
        this.chase.update(
          fixedDelta,
          forwardSpeed * (this.player.isSliding ? 0.9 : 1),
          this.level.speed * timeScale,
          this.level.completion,
        )
      ) {
        // The wave caught up: a crash, so a continue can still save the run.
        this.finishRun(true)
      }
    }

    if (this.state !== 'playing') {
      return
    }

    if (this.tutorialFlow.isActive) {
      // Nothing can end a run while the player is still learning the moves.
      this.invulnerabilityTimer = Math.max(this.invulnerabilityTimer, 0.5)
    }
    this.tutorialFlow.trackLane(this.player.laneIndex)

    this.player.setShieldActive(this.powerUps.shieldActive)
    if (this.dash.isActive) {
      this.fx.emitSpeedTrail(this.player.position, Game.TRAIL_DIRECTION)
    }
    this.world.stream(this.player.position.z)
    this.world.updateVisuals(this.time.delta, this.time.elapsed, this.player.position)
    this.player.updateVisual(
      this.time.delta,
      this.time.elapsed,
      this.dash.isActive,
      false,
      this.effects.isActive('surge') ||
        this.effects.isActive('recovery') ||
        this.powerUps.isActive('speed'),
    )

    this.hudTimer += this.time.delta
    if (this.hudTimer >= GAME_CONFIG.timing.hudUpdateInterval) {
      this.hudTimer = 0
      this.updateHud()
    }
  }

  private updateRunProgress(delta: number): void {
    this.distance = Math.max(this.distance, this.player.position.z * -1)
    this.level.update(this.distance)
    this.runTime += delta
    if (this.level.reachedTarget) {
      this.finishRun(false, false, false, true)
      return
    }
    this.recovery.update(delta)
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - delta)
    }

    const checkpoint = this.world.latestCheckpoint(this.distance)
    if (checkpoint && checkpoint.distance > this.checkpointDistance + 1e-6) {
      this.checkpointDistance = checkpoint.distance
      this.recovery.setCheckpoint({
        x: checkpoint.x,
        y: checkpoint.y,
        z: checkpoint.z,
      })
      this.audio.play('checkpoint')
    }

    this.handlePadTriggers()

    if (this.recovery.shouldRecover(this.player.position.y)) {
      this.recoverFromFall()
      return
    }
    if (this.player.position.y < GAME_CONFIG.player.killY) {
      this.finishRun(true)
      return
    }

    this.world.attractCollectibles(
      delta,
      this.player.position,
      this.powerUps.magnetRadius,
      this.powerUps.magnetPullSpeed,
    )

    const pickups = this.world.collectAt(this.player.position, GAME_CONFIG.player.radius)
    if (pickups.length > 0) {
      this.handlePickups(pickups)
    }

    this.score =
      Math.floor(this.distance * GAME_CONFIG.scoring.distanceMultiplier) + this.pickupScore
  }

  /**
   * Applies one batch of pickups. Each pickup arrives at most once from the
   * collectible manager, so wallet credits and power-up refreshes happen exactly
   * once per object.
   */
  private handlePickups(pickups: readonly CollectiblePickup[]): void {
    for (const pickup of pickups) {
      const isReward = pickup.kind === 'reward'
      this.world.burstAt(pickup.x, pickup.y, pickup.z, pickup.color, isReward ? 22 : 12)
      this.pickupScore += pickup.score

      if (pickup.coins > 0) {
        this.coins += pickup.coins
        this.progression.creditCoins(pickup.coins)
        this.menus.notify(this.meta.record({ kind: 'coins', amount: pickup.coins }))
      }

      if (pickup.powerUp) {
        this.menus.notify(this.meta.record({ kind: 'powerups', amount: 1 }))
        this.fx.emitPowerUp(this.player.position, pickup.powerUp)
        this.powerUps.apply(pickup.powerUp)
        this.player.setShieldActive(this.powerUps.shieldActive)
        this.camera.shake(0.06, 0.1)
      }

      switch (pickup.kind) {
        case 'coin':
          this.audio.play('coin')
          this.ui.pushFeedback(t('feedback.coin', { coins: pickup.coins }), 'coin')
          break
        case 'token':
          this.crystals += 1
          this.progression.creditCrystals(1)
          this.menus.notify(this.meta.record({ kind: 'crystals', amount: 1 }))
          this.audio.play('token')
          this.ui.pushFeedback(
            `+${pickup.coins} ● +1 💎 · ${tc('pickup.token', pickup.label)}`,
            'coin',
          )
          break
        case 'reward': {
          const bonus = pickup.powerUp
            ? ` · ${tc(`powerup.${pickup.powerUp}`, GAME_CONFIG.powerUps[pickup.powerUp].label)}`
            : ''
          this.audio.play('reward')
          this.haptics.pulse('reward')
          this.ui.pushFeedback(
            `+${pickup.coins} · ${tc(`pickup.${pickup.kind}`, pickup.label)}${bonus}`,
            'reward',
          )
          break
        }
        default: {
          const duration = pickup.powerUp ? GAME_CONFIG.powerUps[pickup.powerUp].duration : 0
          this.audio.play('powerup')
          this.haptics.pulse('powerup')
          const label = pickup.powerUp
            ? tc(`powerup.${pickup.powerUp}`, pickup.label)
            : pickup.label
          this.ui.pushFeedback(duration > 0 ? `${label} · ${duration}s` : label, 'powerup')
          break
        }
      }
    }

    this.updateHud()
  }

  private handlePadTriggers(): void {
    const triggers = this.world.triggerPads(this.player.position, GAME_CONFIG.player.radius)
    if (triggers.bounce) {
      this.player.bounce(triggers.bounce.height)
    }
    if (triggers.speed) {
      this.activateEffect(triggers.speed.effect)
    }
  }

  private activateEffect(kind: string): void {
    if (!this.effects.apply(kind)) {
      return
    }

    if (kind === 'surge') {
      this.audio.play('surge')
      this.camera.shake(0.08, 0.12)
    }
    this.updateHud()
  }

  private recoverFromFall(): void {
    const respawn = this.recovery.recover()
    if (!respawn) {
      return
    }

    this.player.teleport(new THREE.Vector3(respawn.x, respawn.y, respawn.z))
    this.world.obstacles.clearAhead(this.player.position.z, RESPAWN_RUNWAY)
    this.camera.recenter(this.player.position, this.distance)
    this.effects.apply('recovery')
    this.invulnerabilityTimer = Math.max(this.invulnerabilityTimer, this.recovery.invulnerability)
    this.audio.play('recover')
    this.camera.shake(0.22, 0.28)
    this.updateHud()
  }

  private handleHazard(obstacle?: Obstacle): void {
    if (this.effects.invulnerable || this.invulnerabilityTimer > 0) {
      return
    }

    if (this.powerUps.absorbHit()) {
      this.player.setShieldActive(this.powerUps.shieldActive)
      this.player.playHit()
      // The shield smashes the obstacle; otherwise the runner would stay pressed
      // against it and crash as soon as the short grace period ends.
      if (obstacle) {
        this.world.obstacles.remove(obstacle)
      }
      this.invulnerabilityTimer = Math.max(
        this.invulnerabilityTimer,
        GAME_CONFIG.powerUps.shield.invulnerability,
      )
      this.audio.play('shieldBreak')
      this.haptics.pulse('shield')
      this.camera.shake(0.3, 0.3)
      this.world.burstAt(
        this.player.position.x,
        this.player.position.y,
        this.player.position.z,
        PALETTE.powerShield,
        24,
      )
      this.fx.emitShieldBreak(this.player.position)
      this.ui.pushFeedback(t('feedback.shield'), 'shield')
      this.updateHud()
      return
    }

    this.finishRun(true)
  }

  private updateGameOver(delta: number): void {
    this.world.updateVisuals(delta, this.time.elapsed, this.player.position)
    this.player.updateVisual(delta, this.time.elapsed, false, true)
  }

  private finishRun(
    crashed: boolean,
    immediate = false,
    afterOffer = false,
    levelComplete = false,
  ): void {
    if (this.state !== 'playing' && this.state !== 'paused' && this.state !== 'offer') {
      return
    }

    this.tutorialFlow.end('suspend')

    // A crash mid-run first offers a second chance (coins or a rewarded ad).
    if (crashed && !immediate && this.state === 'playing' && this.continueOffer.canOffer) {
      this.beginContinueOffer()
      return
    }

    this.player.syncTransform()
    if (!afterOffer) {
      this.player.playOutcome(crashed ? 'lose' : 'win')
    }
    this.distance = Math.max(this.distance, this.player.position.z * -1)
    this.level.update(this.distance)
    this.score =
      Math.floor(this.distance * GAME_CONFIG.scoring.distanceMultiplier) + this.pickupScore

    const update = this.progression.recordRun({
      score: this.score,
      distance: this.distance,
      crystals: this.crystals,
    })

    const summary: GameOverSummary = {
      score: this.score,
      distance: this.distance,
      crystals: this.crystals,
      bestScore: update.snapshot.bestScore,
      bestDistance: update.snapshot.bestDistance,
      isBestScore: update.isBestScore,
      isBestDistance: update.isBestDistance,
      notices: [],
      doubleCoins: this.doubleCoins.offerFor(this.coins),
    }

    // Level bookkeeping: stars, personal best and the next unlock.
    const level = this.currentLevel
    const runResult = {
      distance: this.distance,
      score: this.score,
      coins: this.coins,
      crystals: this.crystals,
      completed: levelComplete,
    }
    const isEvent = level?.id === EVENT_LEVEL_ID
    // The event island keeps no progress of its own; it pays a weekly reward.
    const levelOutcome =
      level && !isEvent
        ? this.levels.recordRun(level, runResult)
        : level
          ? { stars: starsFor(level, runResult), isPersonalBest: false, unlockedNext: null }
          : null
    if (isEvent && levelComplete && this.menus.claimEventReward()) {
      this.menus.addNotice(
        t('event.reward', { coins: EVENT_REWARD.coins, crystals: EVENT_REWARD.crystals }),
      )
    }
    if (!level) {
      this.menus.recordEndlessBest(this.distance)
    }
    if (levelOutcome?.unlockedNext) {
      const next = levelOutcome.unlockedNext
      this.menus.addNotice(
        t('levels.unlockedNext', { level: tc(`level.${next.id}.name`, next.name) }),
      )
    }
    if (level && levelComplete) {
      if (this.coins < level.completionCoins) {
        this.menus.addNotice(t('levels.starCoins', { coins: level.completionCoins }))
      }
      if (this.crystals < level.completionCrystals) {
        this.menus.addNotice(t('levels.starCrystals', { crystals: level.completionCrystals }))
      }
      this.telemetry.track('level_complete', {
        level: level.id,
        stars: levelOutcome?.stars ?? 0,
        seconds: Math.round(this.runTime),
      })
    }

    if (level && levelComplete) {
      // Island missions: one island finished, and the stars it earned.
      this.menus.notify(this.meta.record({ kind: 'islands', amount: 1 }))
      this.menus.notify(this.meta.record({ kind: 'stars', amount: levelOutcome?.stars ?? 0 }))
    }
    this.menus.notify(this.meta.finishRun(this.score, this.distance))
    this.telemetry.track('run_end', {
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      coins: this.coins,
      crystals: this.crystals,
      continues: this.continueOffer.continuesUsed,
      crashed,
    })
    summary.notices = [...this.menus.runNotices]
    this.player.setShieldActive(false)

    this.state = 'gameover'
    this.queuedJump = false
    this.input.reset()
    this.ui.hideAll()

    if (afterOffer) {
      // The crash beat already played when the offer opened.
    } else if (levelComplete) {
      this.audio.play('reward')
      this.haptics.pulse('reward')
      this.fx.emitLevelComplete(this.player.position)
    } else if (crashed) {
      this.audio.play('hit')
      this.haptics.pulse('crash')
      this.camera.shake(0.55, 0.5)
    } else {
      this.audio.play('ui')
    }

    // Let the crash or the victory pose read for a moment before the summary.
    const delay =
      (crashed || levelComplete) && !immediate && !afterOffer
        ? GAME_CONFIG.timing.gameOverDelay * 1000
        : 0
    this.clearSummaryTimer()
    this.summaryTimer = window.setTimeout(() => {
      this.summaryTimer = null
      if (this.state !== 'gameover' || this.disposed) {
        return
      }
      if (level && levelComplete) {
        const next = this.levels.getNextLevel(level.id)
        this.ui.showLevelCompleted({
          levelName: islandName(level),
          score: this.score,
          distance: this.distance,
          coins: this.coins,
          crystals: this.crystals,
          stars: levelOutcome?.stars ?? 1,
          timeElapsed: this.runTime,
          isPersonalBest: levelOutcome?.isPersonalBest ?? false,
          nextLevelAvailable: next !== null && this.levels.isUnlocked(next.id),
          notes: summary.notices,
          doubleCoins: summary.doubleCoins,
        })
      } else {
        this.ui.showGameOver(summary)
      }
    }, delay)
  }

  private beginContinueOffer(): void {
    this.state = 'offer'
    this.player.syncTransform()
    this.player.playOutcome('lose')
    this.player.setShieldActive(false)
    this.queuedJump = false
    this.input.reset()
    this.meta.flush()
    this.ui.hideAll()
    this.audio.play('hit')
    this.haptics.pulse('crash')
    this.camera.shake(0.55, 0.5)

    this.clearSummaryTimer()
    // Let the crash read for a beat before asking.
    this.summaryTimer = window.setTimeout(() => {
      this.summaryTimer = null
      if (this.state !== 'offer' || this.disposed) {
        return
      }
      this.continueOffer.showOffer()
    }, GAME_CONFIG.timing.gameOverDelay * 1000)
  }

  private declineContinue(): void {
    if (this.state !== 'offer') {
      return
    }
    this.finishRun(true, false, true)
  }

  /** Puts the runner back on the track with a short invulnerability window. */
  private revive(): void {
    this.chase.recover()
    const checkpoint = this.recovery.lastCheckpoint
    const spawn = this.spawnPosition()
    const position = checkpoint
      ? new THREE.Vector3(checkpoint.x, checkpoint.y, checkpoint.z)
      : new THREE.Vector3(0, spawn.y, this.player.position.z + 4)
    this.player.reset(position)
    // A clear runway, so the continue never restarts in front of the obstacle it hit.
    this.world.obstacles.clearAhead(this.player.position.z, RESPAWN_RUNWAY)
    this.camera.recenter(this.player.position, this.distance)
    this.effects.apply('recovery')
    this.invulnerabilityTimer = CONTINUE_INVULNERABILITY
    this.time.resetAccumulator()
    this.fx.emitPowerUp(this.player.position, 'shield')
    this.state = 'playing'
    this.ui.showHud()
    this.updateHud()
    this.audio.play('recover')
    this.haptics.pulse('powerup')
  }

  private updateHud(): void {
    const effect = this.effects.primary
    const state: HUDState = {
      score: this.score,
      distance: this.distance,
      crystals: this.crystals,
      coins: this.coins,
      coinBalance: this.progression.balance('coins'),
      powerUps: this.powerUps.active,
      dashCharge: this.dash.charge,
      dashCooldown: this.dash.cooldownRemainingSeconds,
      dashReady: this.dash.isReady,
      dashActive: this.dash.isActive,
      effectLabel: effect ? tc(`effect.${effect.kind}`, effect.label) : '',
      effectRemaining: effect?.remaining ?? 0,
      effectDuration: effect?.duration ?? 0,
      slideActive: this.player.isSliding,
      slideCooldown: this.player.slideCooldownRemaining,
      levelName: this.level.isEndless
        ? t('levels.endless')
        : `${islandName(this.level.definition)} · ${t('levels.toGo', {
            distance: formatDistance(
              Math.max(0, this.level.definition.targetDistance - this.distance),
            ),
          })}`,
      // Levels show progress to the finish line; the endless run shows its difficulty ramp.
      levelProgress: this.level.isEndless ? this.level.progress : this.level.completion,
      targetDistance: this.level.definition.targetDistance,
      chaseGap: this.chase.gap,
    }
    this.ui.updateHud(state)
  }

  private feetPosition(): THREE.Vector3 {
    const player = GAME_CONFIG.player
    return this.scratchFeet
      .copy(this.player.position)
      .setY(this.player.position.y - player.halfHeight - player.radius + 0.05)
  }

  private spawnPosition(): THREE.Vector3 {
    const player = GAME_CONFIG.player
    return new THREE.Vector3(
      0,
      GAME_CONFIG.track.topY + player.halfHeight + player.radius + 0.03,
      player.startZ,
    )
  }

  private resolveAspect(): number {
    const width = this.container.clientWidth || window.innerWidth
    const height = this.container.clientHeight || window.innerHeight
    return Math.max(0.2, width / Math.max(1, height))
  }

  private clearSummaryTimer(): void {
    if (this.summaryTimer !== null) {
      window.clearTimeout(this.summaryTimer)
      this.summaryTimer = null
    }
  }

  private fail(error: unknown): void {
    const resolved = toError(error)
    this.logger.error('Fatal error.', resolved)
    this.telemetry.captureException(resolved, `fatal in state ${this.state}`)
    this.state = 'error'

    if (this.frameHandle !== null) {
      window.cancelAnimationFrame(this.frameHandle)
      this.frameHandle = null
    }

    const message = resolved instanceof GameError ? resolved.message : t('error.unexpected')
    this.ui.showError(message)
  }
}
