import * as THREE from 'three'
import type { LoadedAsset } from '../../assets/ModelLoader.ts'
import { GAME_CONFIG } from '../../config/GameConfig.ts'
import { RENDER_CONFIG } from '../../config/RenderConfig.ts'
import { FinishLine } from './FinishLine.ts'
import { ISLAND_LOOKS } from '../levels/IslandLooks.ts'
import type { PhysicsWorld } from '../../systems/physics/PhysicsWorld.ts'
import { createSeed, mixSeed, Rng } from '../../utils/random.ts'
import type { CollectiblePickup } from '../collectibles/CollectibleKind.ts'
import { CollectibleManager } from '../collectibles/CollectibleManager.ts'
import type { BouncePad, Checkpoint, SpeedPad } from '../interactions/Interaction.ts'
import type { PadTrigger } from '../interactions/InteractionManager.ts'
import { InteractionManager } from '../interactions/InteractionManager.ts'
import { InstancedObjects } from './InstancedObjects.ts'
import type { LevelManager } from '../levels/LevelManager.ts'
import type { Obstacle } from '../obstacles/Obstacle.ts'
import { ObstacleManager } from '../obstacles/ObstacleManager.ts'
import { IslandField } from '../platforms/IslandField.ts'
import type { IslandSegment } from '../platforms/IslandSegment.ts'
import { Environment } from './Environment.ts'
import { DistantIslands } from './islands/DistantIslands.ts'
import { IslandScenery } from './islands/IslandScenery.ts'
import { Ocean } from './Ocean.ts'
import { WorldAssets } from './WorldAssets.ts'

/** Blender props loaded before the world is built. Any may be missing. */
export interface WorldPropModels {
  readonly crate?: LoadedAsset | null
  readonly spire?: LoadedAsset | null
  readonly crystal?: LoadedAsset | null
  readonly beacon?: LoadedAsset | null
}

/**
 * World composition root. Owns the environment, shared art assets, track
 * streamer, decorative archipelago and all spawned content. Gameplay code talks
 * to this class, never to sub-systems directly.
 */
export class World {
  readonly environment: Environment
  private readonly finishLine: FinishLine
  private obstaclesEnabled = true
  readonly ocean: Ocean
  readonly obstacles: ObstacleManager
  readonly collectibles: CollectibleManager
  readonly interactions: InteractionManager
  readonly instancedObjects: InstancedObjects

  private readonly scene: THREE.Scene
  private readonly level: LevelManager
  private readonly assets: WorldAssets
  private readonly field: IslandField
  private readonly scenery: IslandScenery
  private readonly distant: DistantIslands
  private readonly cameraBoxPool: THREE.Box3[] = []
  private readonly cameraBoxCenter = new THREE.Vector3()
  private readonly cameraBoxSize = new THREE.Vector3()
  private runSeed = createSeed()

  constructor(
    scene: THREE.Scene,
    physics: PhysicsWorld,
    level: LevelManager,
    props: WorldPropModels = {},
  ) {
    this.scene = scene
    this.level = level
    this.assets = new WorldAssets()
    this.environment = new Environment()
    this.ocean = new Ocean()
    this.field = new IslandField(scene, physics, this.assets)
    this.scenery = new IslandScenery(scene, this.assets)
    this.distant = new DistantIslands(scene, this.assets.floating)
    this.obstacles = new ObstacleManager(scene, physics, { crate: props.crate, spire: props.spire })
    this.collectibles = new CollectibleManager(scene, 1, props.crystal ?? null)
    this.interactions = new InteractionManager(scene, physics)
    this.instancedObjects = new InstancedObjects(scene)
    this.finishLine = new FinishLine(scene, props.beacon ?? null)
  }

  init(): void {
    this.scene.add(this.environment.root, this.ocean.mesh)
    this.reset()
  }

  reset(seed = createSeed()): void {
    this.runSeed = seed
    this.obstacles.clearAll()
    this.collectibles.clearAll()
    this.interactions.clearAll()
    this.field.reset(seed)
    this.scenery.reset(seed)

    for (const segment of this.field.all) {
      this.populateSegment(segment)
    }
  }

  stream(playerZ: number): void {
    const recycled = this.field.stream(playerZ)
    for (const segment of recycled) {
      this.obstacles.clearSegment(segment.id)
      this.collectibles.clearSegment(segment.id)
      this.interactions.clearSegment(segment.id)
      this.populateSegment(segment)
    }
  }

  fixedUpdate(delta: number): void {
    this.obstacles.fixedUpdate(delta)
    this.interactions.fixedUpdate(delta)
  }

  /**
   * Turns obstacle spawning off (tutorial) or back on. Affects segments as
   * they are (re)populated; call before reset() for a clean start.
   */
  setObstaclesEnabled(enabled: boolean): void {
    this.obstaclesEnabled = enabled
  }

  /** Shows the finish line at a world Z, or hides it (`null`) for the endless run. */
  setFinishLine(z: number | null): void {
    this.finishLine.setPosition(z)
  }

  updateVisuals(delta: number, elapsed: number, playerPosition: THREE.Vector3): void {
    this.finishLine.update(elapsed)
    this.assets.update(elapsed)
    this.environment.update(delta, elapsed, playerPosition)
    this.ocean.update(playerPosition, elapsed)
    this.field.update(elapsed)
    this.scenery.update(playerPosition, elapsed)
    this.distant.update(playerPosition)
    this.obstacles.update(elapsed)
    this.collectibles.update(delta, elapsed)
    this.interactions.updateVisuals(elapsed)
  }

  /** Applies a level's sky and fog tint; `null` restores the default look. */
  applyTheme(
    theme: { readonly id: string; readonly skyColor: number; readonly fogColor: number } | null,
  ): void {
    this.environment.setTheme(theme?.skyColor ?? null, theme?.fogColor ?? null)
    // Track tiles, sea and foliage change per island too, not just the sky.
    const look = theme ? (ISLAND_LOOKS[theme.id] ?? null) : null
    this.assets.platform.setTrackAccent(look?.trackAccent ?? null)
    this.ocean.setColors(look?.oceanDeep ?? null, look?.oceanShallow ?? null)
    this.assets.vegetation.setFoliageTint(look?.foliage ?? null)
    const fog = this.scene.fog
    if (fog instanceof THREE.Fog) {
      fog.color.set(RENDER_CONFIG.fogColor)
      if (theme) {
        fog.color.lerp(new THREE.Color(theme.fogColor), 0.35)
      }
    }
  }

  /** Hides pickups for the character showcase; gameplay state is untouched. */
  setCollectiblesVisible(visible: boolean): void {
    this.collectibles.setVisible(visible)
  }

  collectAt(position: THREE.Vector3, playerRadius: number): CollectiblePickup[] {
    return this.collectibles.collectAt(position, playerRadius)
  }

  attractCollectibles(
    delta: number,
    position: THREE.Vector3,
    radius: number,
    pullSpeed: number,
  ): void {
    this.collectibles.attract(position, radius, pullSpeed, delta)
  }

  burstAt(x: number, y: number, z: number, color: number, count = 12): void {
    this.collectibles.burstAt(x, y, z, color, count)
  }

  findObstacle(colliderHandle: number): Obstacle | undefined {
    return this.obstacles.findByCollider(colliderHandle)
  }

  obstaclePlatformVelocity(handle: number): { x: number; y: number; z: number } | null {
    return this.obstacles.platformVelocity(handle)
  }

  findBounce(colliderHandle: number): BouncePad | undefined {
    return this.interactions.findBounce(colliderHandle)
  }

  consumeBounce(colliderHandle: number): BouncePad | null {
    return this.interactions.consumeBounce(colliderHandle)
  }

  consumeSpeed(colliderHandle: number): SpeedPad | null {
    return this.interactions.consumeSpeed(colliderHandle)
  }

  triggerPads(position: THREE.Vector3, playerRadius: number): PadTrigger {
    return this.interactions.triggerPads(position, playerRadius)
  }

  platformVelocity(colliderHandle: number): { x: number; y: number; z: number } | null {
    return this.interactions.platformVelocity(colliderHandle)
  }

  latestCheckpoint(distanceTravelled: number): Checkpoint | null {
    return this.interactions.latestCheckpoint(distanceTravelled)
  }

  /**
   * Solid track volumes used by the camera occlusion test. The boxes are
   * pooled and rewritten in place, so the per-frame camera query allocates
   * nothing and never touches render geometry.
   */
  cameraOccluders(): readonly THREE.Box3[] {
    const track = GAME_CONFIG.track
    const height = 8
    const width = track.width + 3.2
    const pool = this.cameraBoxPool

    for (let index = 0; index < this.field.all.length; index += 1) {
      const segment = this.field.all[index]
      const box = pool[index] ?? new THREE.Box3()
      this.cameraBoxCenter.set(0, track.topY - height / 2, segment.centerZ)
      this.cameraBoxSize.set(width, height, track.segmentLength)
      box.setFromCenterAndSize(this.cameraBoxCenter, this.cameraBoxSize)
      pool[index] = box
    }
    pool.length = this.field.all.length
    return pool
  }

  dispose(): void {
    this.finishLine.dispose()
    this.instancedObjects.dispose()
    this.ocean.dispose()
    this.environment.dispose()
    this.obstacles.dispose()
    this.collectibles.dispose()
    this.interactions.dispose()
    this.field.dispose()
    this.scenery.dispose()
    this.distant.dispose()
    this.assets.dispose()
  }

  private populateSegment(segment: IslandSegment): void {
    const distance = Math.max(0, -segment.centerZ)
    const difficulty = this.level.difficultyForDistance(distance)
    const random = new Rng(mixSeed(this.runSeed, segment.id, segment.generation))
    const rules = this.level.spawnRules

    // The first segment stays obstacle-free so the player can settle in.
    if (segment.centerZ < -12 && this.obstaclesEnabled) {
      this.obstacles.populateSegment(
        segment.id,
        segment.centerZ,
        random,
        difficulty,
        this.level.obstacleDensity,
        this.level.allowedObstacles,
        rules,
        this.level.speedForDistance(distance),
      )
      this.interactions.populateSegment(
        segment.id,
        segment.centerZ,
        random,
        difficulty,
        (x, z, radius) => this.obstacles.isBlocked(x, z, radius),
        rules,
      )
    }

    this.collectibles.populateSegment(
      segment.id,
      segment.centerZ,
      random,
      difficulty,
      this.level.crystalDensity,
      (x, z, radius) =>
        this.obstacles.isBlocked(x, z, radius) || this.interactions.isBlocked(x, z, radius),
      rules,
    )
  }
}
