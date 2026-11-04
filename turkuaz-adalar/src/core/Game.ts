import * as THREE from 'three'
import { ASSET_REGISTRY } from '../assets/AssetRegistry.ts'
import { ModelLoader } from '../assets/ModelLoader.ts'
import { GAME_CONFIG } from '../config/GameConfig.ts'
import { PALETTE } from '../config/Palette.ts'
import { DashAbility } from '../game/abilities/DashAbility.ts'
import { VisualEffectsManager } from '../game/effects/VisualEffectsManager.ts'
import type { CollectiblePickup } from '../game/collectibles/CollectibleKind.ts'
import { resolveAppearance } from '../game/characters/CharacterAppearance.ts'
import {
  CHARACTER_ACCESSORIES,
  CHARACTER_COLORS,
  CHARACTER_OUTFITS,
  CHARACTER_SKINS,
  CHARACTERS,
  type CosmeticType,
} from '../game/characters/CharacterData.ts'
import { PowerUpSystem } from '../game/powerups/PowerUpSystem.ts'
import { IsometricCameraRig } from '../game/camera/IsometricCameraRig.ts'
import { LevelManager } from '../game/levels/LevelManager.ts'
import { CharacterModel } from '../game/player/CharacterModel.ts'
import { MovementEffects } from '../game/player/MovementEffects.ts'
import { Player } from '../game/player/Player.ts'
import { RunRecovery } from '../game/player/RunRecovery.ts'
import { World } from '../game/world/World.ts'
import { AudioManager } from '../systems/audio/AudioManager.ts'
import { PerformanceMonitor, type PerformanceMetrics } from '../systems/performance/PerformanceMonitor.ts'
import { Haptics } from '../systems/haptics/Haptics.ts'
import { InputManager } from '../systems/input/InputManager.ts'
import { PhysicsWorld } from '../systems/physics/PhysicsWorld.ts'
import { ProgressionManager } from '../systems/progression/ProgressionManager.ts'
import { SaveManager } from '../systems/save/SaveManager.ts'
import { PlayerSaveManager } from '../systems/save/PlayerSaveManager.ts'
import { Renderer } from './Renderer.ts'
import { SceneManager } from './SceneManager.ts'
import { Time } from './Time.ts'
import { UIManager } from '../ui/UIManager.ts'
import type { HUDState } from '../ui/hud/GameHud.ts'
import type { GameOverSummary } from '../ui/screens/GameOverScreen.ts'
import { GameError, toError } from '../utils/errors.ts'
import { Logger } from '../utils/logger.ts'

type GameState = 'loading' | 'menu' | 'playing' | 'paused' | 'gameover' | 'error'

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
  private coinBalance = 0
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
    const delta = this.time.delta

    switch (this.state) {
      case 'menu':
        this.updateMenu(delta)
        break
      case 'playing':
        this.updatePlaying()
        break
      case 'gameover':
        this.updateGameOver(delta)
        break
      case 'paused':
      case 'loading':
      case 'error':
        break
    }

    if (this.state === 'menu' || this.state === 'playing' || this.state === 'gameover') {
      this.fx.update(delta)
      const mode = this.state === 'menu' ? 'menu' : 'follow'
      this.camera.update(
        delta,
        this.player.position,
        mode,
        this.time.elapsed,
        this.distance,
      )
      this.renderer.render(this.scene.scene, this.camera.camera)
    }

    if (!this.disposed && this.state !== 'error') {
      this.frameHandle = window.requestAnimationFrame(this.tick)
    }
  }

  private readonly handleVisibility = (): void => {
    if (document.hidden) {
      if (this.state === 'playing') {
        this.pause()
      }
      this.haptics.stop()
      this.audio?.suspend()
    } else {
      this.audio?.resume()
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
      this.handleHazard()
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
    this.audio?.play('slide')
  }

  constructor(container: HTMLElement) {
    this.container = container
    this.save = new SaveManager()
    this.playerSave = new PlayerSaveManager(this.save)
    this.progression = new ProgressionManager(this.save)
    this.haptics = new Haptics(this.playerSave.settings.vibration)
    this.coinBalance = this.progression.snapshot.coins
    this.ui = new UIManager(container, {
      onPlay: () => this.startRun(),
      onRestart: () => this.startRun(),
      onResume: () => this.resume(),
      onQuit: () => this.quit(),
      onPause: () => this.pause(),
      onToggleMute: () => this.toggleMute(),
      onReload: () => window.location.reload(),
      onJump: () => this.input?.queueJump(),
      onSlide: () => this.input?.queueSlide(),
      onDash: () => this.input?.queueDash(),
      onCharacter: () => this.showCharacterSelection(),
      onSettings: () =>
        this.ui.showSettings({
          ...this.playerSave.settings,
          muted: this.audio?.isMuted ?? this.playerSave.settings.muted,
        }),
      onSelectLevel: () => this.startRun(),
      onEquipCosmetic: (type, id) => this.equipCosmetic(type, id),
      onNextLevel: () => this.startRun(),
      onPurchase: (type, id) => this.purchaseCosmetic(type, id),
      onChangeSettings: (settings) => this.handleSettingsChange(settings),
    })

    this.ui.setHintsVisible(this.playerSave.settings.controlHints)
    this.ui.setLoadingProgress(0.06, 'Waking the tide')
  }

  async init(): Promise<void> {
    try {
      this.ui.setLoadingProgress(0.18, 'Raising the islands')
      this.physics = await PhysicsWorld.create()
      this.ui.setLoadingProgress(0.46, 'Lighting the horizon')

      this.renderer = new Renderer(this.container, this.playerSave.settings.quality)
      this.scene = new SceneManager()
      this.camera = new IsometricCameraRig(this.resolveAspect())
      this.unsubscribeResize = this.renderer.events.on('resize', (size) => {
        this.camera?.setAspect(size.aspect)
      })

      this.ui.setLoadingProgress(0.56, 'Summoning the runner')
      const qualitySettings = this.renderer.getQualitySettings()
      // Props are optional: a failed download logs a warning and the
      // procedural fallback is used, so they load in parallel and never block.
      const propsPromise = Promise.all([
        this.assets.loadSafe('obstacle.crate'),
        this.assets.loadSafe('obstacle.spire'),
        this.assets.loadSafe('collectible.crystal'),
      ])
      const character = await this.loadCharacterModel(qualitySettings)
      const [crate, spire, crystal] = await propsPromise

      this.ui.setLoadingProgress(0.78, 'Tuning the current')
      this.audio = new AudioManager(this.save)
      this.audio.setMusicVolume(this.playerSave.settings.musicVolume)
      this.audio.setSfxVolume(this.playerSave.settings.sfxVolume)
      this.input = new InputManager(this.renderer.canvas, {
        onPause: () => this.pause(),
        onToggleMute: () => this.toggleMute(),
      })

      this.ui.setLoadingProgress(0.86, 'Painting the shallows')
      this.world = new World(this.scene.scene, this.physics, this.level, { crate, spire, crystal })
      this.fx = new VisualEffectsManager(this.scene.scene, 256, qualitySettings.particleMultiplier)
      this.player = new Player(this.scene.scene, this.physics)
      this.player.platformMotionProvider = (handle) =>
        this.world.platformVelocity(handle) ?? this.world.obstaclePlatformVelocity(handle)
      this.camera.setOccluders(() => this.world.cameraOccluders())
      if (character) {
        this.characterModel = character
        this.applyAppearance()
        this.player.attachCharacter(character)
      }
      this.player.onCollision = this.handlePlayerCollision
      this.player.onJump = this.handlePlayerJump
      this.player.onLand = this.handlePlayerLand
      this.player.onBounce = this.handlePlayerBounce
      this.player.onSlide = this.handlePlayerSlide

      this.ui.setLoadingProgress(0.92, 'Lifting the tide')
      this.time = new Time()
      this.world.init()
      this.player.reset(this.spawnPosition())
      this.camera.snapTo(this.player.position, 'menu')

      document.addEventListener('visibilitychange', this.handleVisibility)

      this.ui.setLoadingProgress(1, 'Ready')
      this.state = 'menu'
      this.ui.showMenu(this.progression.snapshot, this.audio.isMuted)
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
    this.unsubscribeResize?.()
    this.unsubscribeResize = null

    this.haptics.stop()
    this.input?.dispose()
    this.audio?.dispose()
    this.player?.dispose()
    this.fx?.dispose()
    this.world?.dispose()
    this.scene?.dispose()
    this.assets.dispose()
    this.renderer?.dispose()
    this.physics?.dispose()
    this.ui.dispose()
  }

  private async loadCharacterModel(qualitySettings: any): Promise<CharacterModel | null> {
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
            progress.ratio >= 1 ? 'Dressing the runner' : `Summoning the runner ${percent}%`,
          )
        },
      })
      const targetHeight =
        (GAME_CONFIG.player.halfHeight + GAME_CONFIG.player.radius) * 2
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

  private startRun(): void {
    if (this.disposed || !this.time) {
      return
    }

    this.clearSummaryTimer()
    const difficulty = this.playerSave.settings.difficulty
    this.level.reset(difficulty)
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
    this.coinBalance = this.progression.snapshot.coins
    this.score = 0
    this.hudTimer = 0
    this.checkpointDistance = 0
    this.invulnerabilityTimer = 0

    this.world.reset()
    this.fx.clear()
    this.player.setShieldActive(false)
    this.player.reset(this.spawnPosition())
    // Only the translation is recentred; the framing blends from menu to run.
    this.camera.recenter(this.player.position, 0)
    this.time.resetAccumulator()

    this.state = 'playing'
    this.ui.showHud()
    this.updateHud()

    void this.audio.unlock().then(() => {
      this.audio.play('start')
    })
  }

  private pause(): void {
    if (this.state !== 'playing') {
      return
    }

    this.state = 'paused'
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

  private showCharacterSelection(): void {
    this.ui.showCharacterSelection({
      collection: this.playerSave.characterCollection,
      currentCoins: this.progression.snapshot.coins,
    })
  }

  private applyAppearance(): void {
    this.characterModel?.applyAppearance(
      resolveAppearance(this.playerSave.characterCollection.equipped),
    )
  }

  private equipCosmetic(type: CosmeticType, id: string): void {
    if (!this.playerSave.equip(type, id)) {
      this.logger.warn(`Cannot equip ${type} "${id}": not owned.`)
      return
    }
    this.applyAppearance()
    this.audio?.play('ui')
    this.showCharacterSelection()
  }

  /**
   * Buys an item at its catalogue price (never a price sent by the UI), then
   * equips it so the purchase is immediately visible on the runner.
   */
  private purchaseCosmetic(type: CosmeticType, id: string): void {
    const cost = cosmeticCost(type, id)
    if (cost === null || this.playerSave.isOwned(type, id)) {
      return
    }

    const currentCoins = this.progression.snapshot.coins
    if (currentCoins < cost) {
      this.logger.info(`Not enough coins for ${type} "${id}" (${currentCoins}/${cost}).`)
      return
    }

    this.coinBalance = this.progression.debitCoins(cost)
    this.playerSave.purchaseCosmetic(type, id)
    this.audio?.play('reward')
    this.haptics.pulse('reward')
    this.equipCosmetic(type, id)
  }

  private handleSettingsChange(settings: any): void {
    const currentSettings = this.playerSave.settings
    const updatedSettings = {
      ...currentSettings,
      musicVolume: settings.musicVolume ?? currentSettings.musicVolume,
      sfxVolume: settings.sfxVolume ?? currentSettings.sfxVolume,
      quality: settings.graphicsQuality ?? currentSettings.quality,
      controlHints: settings.showHints ?? currentSettings.controlHints,
      vibration: settings.vibrationEnabled ?? currentSettings.vibration,
      muted: settings.muted ?? currentSettings.muted,
      difficulty: settings.difficulty ?? currentSettings.difficulty,
    }
    this.playerSave.updateSettings(updatedSettings)

    if (settings.graphicsQuality) {
      this.renderer.setQualityLevel(settings.graphicsQuality)
    }
    if (typeof settings.musicVolume === 'number') {
      this.audio?.setMusicVolume(updatedSettings.musicVolume)
    }
    if (typeof settings.sfxVolume === 'number') {
      this.audio?.setSfxVolume(updatedSettings.sfxVolume)
    }
    if (typeof settings.muted === 'boolean' && this.audio && settings.muted !== this.audio.isMuted) {
      this.toggleMute()
    }
    if (typeof settings.vibrationEnabled === 'boolean') {
      this.haptics.setEnabled(updatedSettings.vibration)
      // A short buzz confirms the toggle on devices that support it.
      this.haptics.pulse('ui')
    }
    if (typeof settings.showHints === 'boolean') {
      this.ui.setHintsVisible(updatedSettings.controlHints)
    }
  }

  private returnToMenu(): void {
    if (this.disposed) {
      return
    }

    this.clearSummaryTimer()
    this.input.reset()
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
    this.fx.clear()
    this.player.setShieldActive(false)
    this.player.reset(this.spawnPosition())
    // The menu framing blends back in instead of cutting.
    this.camera.recenter(this.player.position, 0)
    this.state = 'menu'
    this.ui.showMenu(this.progression.snapshot, this.audio.isMuted)
    this.audio.play('ui')
  }

  private toggleMute(): void {
    if (!this.audio) {
      return
    }

    const muted = this.audio.toggleMute()
    this.ui.setMuted(muted)
    if (!muted) {
      void this.audio.unlock().then(() => {
        this.audio.play('ui')
      })
    }
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

      this.world.fixedUpdate(fixedDelta)
      this.player.fixedUpdate(fixedDelta, {
        laneChange: this.input.consumeLaneChange(),
        jump: this.queuedJump,
        jumpHeld,
        slide: this.queuedSlide,
        forwardSpeed:
          this.level.speed *
          this.dash.speedMultiplier *
          speedScale *
          this.powerUps.speedMultiplier,
        airJumps: this.powerUps.airJumps,
        gravityScale: this.effects.gravityScale,
        jumpScale: this.effects.jumpScale,
        laneControl: this.effects.laneControl,
      })
      this.queuedJump = false
      this.queuedSlide = false
      this.dash.update(fixedDelta)
      this.physics.step(fixedDelta)
      this.player.syncTransform()
      this.effects.update(fixedDelta)
      this.powerUps.update(fixedDelta)

      this.updateRunProgress(fixedDelta)
    }

    if (this.state !== 'playing') {
      return
    }

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

    const pickups = this.world.collectAt(
      this.player.position,
      GAME_CONFIG.player.radius,
    )
    if (pickups.length > 0) {
      this.handlePickups(pickups)
    }

    this.score =
      Math.floor(this.distance * GAME_CONFIG.scoring.distanceMultiplier) +
      this.pickupScore
  }

  /**
   * Applies one batch of pickups. Each pickup arrives at most once from the
   * collectible manager, so wallet credits and power-up refreshes happen exactly
   * once per object.
   */
  private handlePickups(pickups: readonly CollectiblePickup[]): void {
    for (const pickup of pickups) {
      const isReward = pickup.kind === 'reward'
      this.world.burstAt(
        pickup.x,
        pickup.y,
        pickup.z,
        pickup.color,
        isReward ? 22 : 12,
      )
      this.pickupScore += pickup.score

      if (pickup.coins > 0) {
        this.coins += pickup.coins
        this.coinBalance = this.progression.creditCoins(pickup.coins)
      }

      if (pickup.powerUp) {
        this.fx.emitPowerUp(this.player.position, pickup.powerUp)
        this.powerUps.apply(pickup.powerUp)
        this.player.setShieldActive(this.powerUps.shieldActive)
        this.camera.shake(0.06, 0.1)
      }

      switch (pickup.kind) {
        case 'coin':
          this.audio.play('coin')
          this.ui.pushFeedback(`+${pickup.coins} coin`, 'coin')
          break
        case 'token':
          this.crystals += 1
          this.audio.play('token')
          this.ui.pushFeedback(`+${pickup.coins} · ${pickup.label}`, 'coin')
          break
        case 'reward': {
          const bonus = pickup.powerUp
            ? ` · ${GAME_CONFIG.powerUps[pickup.powerUp].label}`
            : ''
          this.audio.play('reward')
          this.haptics.pulse('reward')
          this.ui.pushFeedback(`+${pickup.coins} · ${pickup.label}${bonus}`, 'reward')
          break
        }
        default: {
          const duration = pickup.powerUp
            ? GAME_CONFIG.powerUps[pickup.powerUp].duration
            : 0
          this.audio.play('powerup')
          this.haptics.pulse('powerup')
          this.ui.pushFeedback(
            duration > 0 ? `${pickup.label} · ${duration}s` : pickup.label,
            'powerup',
          )
          break
        }
      }
    }

    this.updateHud()
  }

  private handlePadTriggers(): void {
    const triggers = this.world.triggerPads(
      this.player.position,
      GAME_CONFIG.player.radius,
    )
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
    this.camera.recenter(this.player.position, this.distance)
    this.effects.apply('recovery')
    this.invulnerabilityTimer = Math.max(
      this.invulnerabilityTimer,
      this.recovery.invulnerability,
    )
    this.audio.play('recover')
    this.camera.shake(0.22, 0.28)
    this.updateHud()
  }

  private handleHazard(): void {
    if (this.effects.invulnerable || this.invulnerabilityTimer > 0) {
      return
    }

    if (this.powerUps.absorbHit()) {
      this.player.setShieldActive(this.powerUps.shieldActive)
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
      this.ui.pushFeedback('Shield absorbed the hit', 'shield')
      this.updateHud()
      return
    }

    this.finishRun(true)
  }

  private updateGameOver(delta: number): void {
    this.world.updateVisuals(delta, this.time.elapsed, this.player.position)
    this.player.updateVisual(delta, this.time.elapsed, false, true)
  }

  private finishRun(crashed: boolean, immediate = false): void {
    if (this.state !== 'playing' && this.state !== 'paused') {
      return
    }

    this.player.syncTransform()
    this.player.playOutcome(crashed ? 'lose' : 'win')
    this.distance = Math.max(this.distance, this.player.position.z * -1)
    this.level.update(this.distance)
    this.score =
      Math.floor(this.distance * GAME_CONFIG.scoring.distanceMultiplier) +
      this.pickupScore

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
    }
    this.player.setShieldActive(false)

    this.state = 'gameover'
    this.queuedJump = false
    this.input.reset()
    this.ui.hideAll()

    if (crashed) {
      this.audio.play('hit')
      this.haptics.pulse('crash')
      this.camera.shake(0.55, 0.5)
    } else {
      this.audio.play('ui')
    }

    const delay = crashed && !immediate ? GAME_CONFIG.timing.gameOverDelay * 1000 : 0
    this.clearSummaryTimer()
    this.summaryTimer = window.setTimeout(() => {
      this.summaryTimer = null
      if (this.state === 'gameover' && !this.disposed) {
        this.ui.showGameOver(summary)
      }
    }, delay)
  }

  private updateHud(): void {
    const effect = this.effects.primary
    const state: HUDState = {
      score: this.score,
      distance: this.distance,
      crystals: this.crystals,
      coins: this.coins,
      coinBalance: this.coinBalance,
      powerUps: this.powerUps.active,
      dashCharge: this.dash.charge,
      dashCooldown: this.dash.cooldownRemainingSeconds,
      dashReady: this.dash.isReady,
      dashActive: this.dash.isActive,
      effectLabel: effect?.label ?? '',
      effectRemaining: effect?.remaining ?? 0,
      effectDuration: effect?.duration ?? 0,
      slideActive: this.player.isSliding,
      slideCooldown: this.player.slideCooldownRemaining,
      levelName: this.level.definition.name,
      levelProgress: this.level.progress,
      targetDistance: this.level.definition.targetDistance,
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
    this.state = 'error'

    if (this.frameHandle !== null) {
      window.cancelAnimationFrame(this.frameHandle)
      this.frameHandle = null
    }

    const message =
      resolved instanceof GameError
        ? resolved.message
        : 'An unexpected error interrupted the run. Reload to try again.'
    this.ui.showError(message)
  }
}

function cosmeticCost(type: CosmeticType, id: string): number | null {
  const catalog: readonly { id: string; unlockCost: number }[] =
    type === 'character'
      ? CHARACTERS
      : type === 'skin'
        ? CHARACTER_SKINS
        : type === 'outfit'
          ? CHARACTER_OUTFITS
          : type === 'accessory'
            ? CHARACTER_ACCESSORIES
            : CHARACTER_COLORS
  return catalog.find((item) => item.id === id)?.unlockCost ?? null
}
