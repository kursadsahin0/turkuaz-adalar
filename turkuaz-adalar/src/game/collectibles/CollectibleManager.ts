import * as THREE from 'three'
import type { LoadedAsset } from '../../assets/ModelLoader.ts'
import { GAME_CONFIG } from '../../config/GameConfig.ts'
import { smoothstep } from '../../utils/math.ts'
import type { Rng } from '../../utils/random.ts'
import type { Collectible } from './Collectible.ts'
import type { CollectibleKind, CollectiblePickup, PowerUpKind } from './CollectibleKind.ts'
import {
  COLLECTIBLE_KINDS,
  POWER_UP_KINDS,
} from './CollectibleKind.ts'
import { CollectionBurstField } from './CollectionBurst.ts'
import { CollectiblePool } from './CollectiblePool.ts'
import { CollectiblePrefabs } from './CollectiblePrefabs.ts'

const TAU = Math.PI * 2

/**
 * Owns every pickup in the streamed track.
 *
 * - Coins, relic tokens, power-ups and level caches are placed per segment from
 *   the segment RNG, so generation stays deterministic and recyclable.
 * - Pickups are pooled per prefab. A collected instance plays its pop animation
 *   and is then returned to the pool; no geometry is created mid-run.
 * - Collection detection is a per-instance check that sets `collected` before
 *   returning an event. That flag is the single-award guarantee.
 */
export class CollectibleManager {
  private readonly scene: THREE.Scene
  private readonly prefabs: CollectiblePrefabs
  private readonly pools = new Map<CollectibleKind, CollectiblePool>()
  private readonly bySegment = new Map<number, Collectible[]>()
  private readonly bursts: CollectionBurstField
  private nextId = 1
  private disposed = false

  constructor(scene: THREE.Scene, qualityMultiplier = 1.0, crystalModel: LoadedAsset | null = null) {
    this.scene = scene
    this.prefabs = new CollectiblePrefabs(crystalModel)
    this.bursts = new CollectionBurstField(192, qualityMultiplier)
    const poolConfig = GAME_CONFIG.collectibles.pool

    for (const kind of COLLECTIBLE_KINDS) {
      this.pools.set(
        kind,
        new CollectiblePool(kind, this.prefabs, poolConfig.prewarmPerKind, poolConfig.maxIdlePerKind),
      )
    }

    scene.add(this.bursts.points)
  }

  /** Live pickups, including ones still playing their collection animation. */
  get liveCount(): number {
    let count = 0
    for (const collectibles of this.bySegment.values()) {
      count += collectibles.length
    }
    return count
  }

  /** Instances currently instantiated across all pools (for diagnostics/tests). */
  get poolCreatedCount(): number {
    let count = 0
    for (const pool of this.pools.values()) {
      count += pool.createdCount
    }
    return count
  }

  populateSegment(
    segmentId: number,
    centerZ: number,
    rng: Rng,
    difficulty: number,
    density: number,
    isBlocked: (x: number, z: number, radius: number) => boolean,
  ): void {
    this.clearSegment(segmentId)
    console.log(`[CollectibleManager] Populating segment ${segmentId}, density: ${density}, difficulty: ${difficulty}`)

    const track = GAME_CONFIG.track
    const config = GAME_CONFIG.collectibles
    const halfLength = track.segmentLength / 2
    const margin = 4.5
    const segmentIndex = Math.round(-centerZ / track.segmentLength)
    const withinBounds = (z: number): boolean =>
      z <= centerZ + halfLength - margin && z >= centerZ - halfLength + margin
    const place = (
      kind: CollectibleKind,
      lane: number,
      z: number,
      grantedPowerUp: PowerUpKind | null = null,
    ): void => {
      if (!withinBounds(z) || isBlocked(lane, z, 0.55)) {
        return
      }
      this.place(kind, segmentId, lane, z, rng.range(0, TAU), grantedPowerUp)
    }

    // ------------------------------------------------------------ coin trails
    const trails = Math.max(
      3,
      Math.min(
        config.coins.trailsMax + 1,
        rng.int(config.coins.trailsMin, config.coins.trailsMax) +
          (difficulty > 0.5 ? 1 : 0),
      ),
    )
    const trailLength = Math.max(
      5,
      Math.round(
        rng.int(config.coins.trailLengthMin, config.coins.trailLengthMax) *
          (0.75 + Math.max(0.5, density) * 0.5),
      ),
    )

    console.log(`[CollectibleManager] Placing ${trails} coin trails, each with ${trailLength} coins`)

    for (let trail = 0; trail < trails; trail += 1) {
      const lane = rng.pick(track.lanePositions)
      const startZ = rng.range(centerZ - halfLength + margin, centerZ + halfLength - margin)
      const direction = rng.chance(0.5) ? 1 : -1
      for (let index = 0; index < trailLength; index += 1) {
        place('coin', lane, startZ + direction * index * config.coins.spacing)
      }
    }

    // ---------------------------------------------------------- relic tokens
    if (rng.chance(config.tokens.chance * (0.8 + density * 0.4))) {
      place(
        'token',
        rng.pick(track.lanePositions),
        rng.range(centerZ - halfLength + margin, centerZ + halfLength - margin),
      )
    }

    // ------------------------------------------------------------- power-ups
    if (rng.chance(config.powerUps.chance)) {
      place(
        rng.pick(POWER_UP_KINDS),
        rng.pick(track.lanePositions),
        rng.range(centerZ - halfLength + margin, centerZ + halfLength - margin),
      )
    }

    // --------------------------------------------------------- level rewards
    const rewardConfig = config.rewards
    if (
      segmentIndex >= rewardConfig.minSegmentIndex &&
      segmentIndex % rewardConfig.everySegments === 0
    ) {
      const grantedPowerUp = rng.chance(0.5) ? null : rng.pick(POWER_UP_KINDS)
      place('reward', 0, centerZ, grantedPowerUp)
    }
  }

  /**
   * Adds one pickup at an explicit position. Public so validation scripts can
   * exercise collection in isolation; segment generation uses it internally.
   */
  place(
    kind: CollectibleKind,
    segmentId: number,
    x: number,
    z: number,
    phase = 0,
    grantedPowerUp: PowerUpKind | null = null,
  ): Collectible {
    const pool = this.pools.get(kind)
    if (!pool) {
      throw new Error(`No collectible pool registered for "${kind}".`)
    }

    const instance = pool.acquire()
    instance.id = this.nextId
    this.nextId += 1
    instance.segmentId = segmentId
    instance.phase = phase
    instance.grantedPowerUp = grantedPowerUp
    instance.collectElapsed = 0
    instance.baseX = x
    // heightAboveGround is measured from the deck surface, not from world zero.
    instance.baseY = GAME_CONFIG.track.topY + GAME_CONFIG.collectibles.heightAboveGround
    instance.baseZ = z
    instance.root.position.set(instance.baseX, instance.baseY, instance.baseZ)
    instance.root.rotation.set(0, phase, 0)
    instance.root.scale.setScalar(1)
    instance.root.visible = true
    this.scene.add(instance.root)

    let bucket = this.bySegment.get(segmentId)
    if (!bucket) {
      bucket = []
      this.bySegment.set(segmentId, bucket)
    }
    bucket.push(instance)
    return instance
  }

  clearSegment(segmentId: number): void {
    const collectibles = this.bySegment.get(segmentId)
    if (!collectibles) {
      return
    }

    for (const collectible of [...collectibles]) {
      this.retire(collectible)
    }
    this.bySegment.delete(segmentId)
  }

  clearAll(): void {
    for (const segmentId of [...this.bySegment.keys()]) {
      this.clearSegment(segmentId)
    }
    this.bursts.clear()
  }

  /**
   * Tests every live pickup against the runner. Each instance can only be
   * awarded once: the first hit flips `collected` and starts the pop animation.
   */
  collectAt(position: THREE.Vector3, playerRadius: number): CollectiblePickup[] {
    const pickups: CollectiblePickup[] = []
    const config = GAME_CONFIG.collectibles
    const verticalTolerance = config.verticalTolerance
    const threshold = playerRadius + config.pickupRadius * 0.75

    for (const collectibles of this.bySegment.values()) {
      for (const collectible of collectibles) {
        if (collectible.state !== 'active' || collectible.collected) {
          continue
        }

        const root = collectible.root
        const deltaX = root.position.x - position.x
        const deltaY = root.position.y - position.y
        const deltaZ = root.position.z - position.z
        if (Math.abs(deltaY) > verticalTolerance) {
          continue
        }

        if (deltaX * deltaX + deltaZ * deltaZ > threshold * threshold) {
          continue
        }

        collectible.state = 'collecting'
        collectible.collected = true
        collectible.collectElapsed = 0
        collectible.collectStartY = root.position.y
        collectible.attracted = false

        pickups.push({
          kind: collectible.kind,
          label: collectible.definition.label,
          coins: collectible.definition.coins,
          score: collectible.definition.score,
          powerUp:
            collectible.kind === 'reward'
              ? collectible.grantedPowerUp
              : collectible.definition.powerUp,
          x: root.position.x,
          y: root.position.y,
          z: root.position.z,
          color: collectible.definition.color,
        })
      }
    }

    return pickups
  }

  /**
   * Pulls coins and relic tokens toward the runner while a magnet is active.
   * Power-ups and reward caches deliberately ignore the magnet.
   */
  attract(
    position: THREE.Vector3,
    radius: number,
    pullSpeed: number,
    delta: number,
  ): void {
    if (radius <= 0) {
      this.settleAttracted()
      return
    }

    const radiusSquared = radius * radius
    const releaseSquared = (radius * 1.6) * (radius * 1.6)
    const stepMax = pullSpeed * delta

    for (const collectibles of this.bySegment.values()) {
      for (const collectible of collectibles) {
        if (
          collectible.state !== 'active' ||
          collectible.collected ||
          (collectible.kind !== 'coin' && collectible.kind !== 'token')
        ) {
          continue
        }

        const root = collectible.root
        const deltaX = position.x - root.position.x
        const deltaY = position.y - root.position.y
        const deltaZ = position.z - root.position.z
        const distanceSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ

        if (!collectible.attracted && distanceSquared > radiusSquared) {
          continue
        }
        if (collectible.attracted && distanceSquared > releaseSquared) {
          collectible.attracted = false
          collectible.baseX = root.position.x
          collectible.baseY = root.position.y
          collectible.baseZ = root.position.z
          continue
        }

        const distance = Math.sqrt(distanceSquared)
        if (distance < 1e-4) {
          continue
        }

        const step = Math.min(stepMax, distance)
        root.position.x += (deltaX / distance) * step
        root.position.y += (deltaY / distance) * step
        root.position.z += (deltaZ / distance) * step
        collectible.attracted = true
      }
    }
  }

  /** Advances idle animation, collection pops and particles. */
  update(delta: number, elapsed: number): void {
    const config = GAME_CONFIG.collectibles
    const animation = config.collection

    this.bursts.update(delta)

    for (const collectibles of [...this.bySegment.values()]) {
      for (const collectible of [...collectibles]) {
        if (collectible.state === 'idle') {
          continue
        }

        const root = collectible.root
        const definition = collectible.definition

        if (collectible.state === 'active') {
          if (!collectible.attracted) {
            root.position.y =
              collectible.baseY +
              Math.sin(elapsed * 2.1 + collectible.phase) * config.bobHeight
            root.position.x = collectible.baseX
            root.position.z = collectible.baseZ
          }
          root.rotation.y = elapsed * definition.spin + collectible.phase
          if (collectible.halo) {
            collectible.halo.rotation.z = elapsed * 2.4 + collectible.phase
          }
          const pulse = 1 + Math.sin(elapsed * 3 + collectible.phase) * 0.05
          root.scale.setScalar(pulse)
          continue
        }

        collectible.collectElapsed += delta
        const progress = Math.min(1, collectible.collectElapsed / animation.duration)
        const pop = 1 + Math.sin(Math.min(1, progress * 2.4) * Math.PI) * 0.5
        const fade = 1 - smoothstep(0.35, 1, progress)
        root.scale.setScalar(Math.max(0.001, pop * fade))
        root.position.y =
          collectible.collectStartY + animation.rise * smoothstep(0, 1, progress)
        root.rotation.y += animation.spin * delta

        if (progress >= 1) {
          this.retire(collectible)
        }
      }
    }
  }

  /** Emits the collection spark burst for a pickup. */
  burstAt(
    x: number,
    y: number,
    z: number,
    color: number,
    count = 12,
    speed = 3.2,
  ): void {
    this.bursts.emit(x, y, z, color, count, speed)
  }

  get burstParticleCount(): number {
    return this.bursts.activeCount
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.clearAll()
    for (const pool of this.pools.values()) {
      pool.dispose()
    }
    this.pools.clear()
    this.prefabs.dispose()
    this.bursts.dispose()
  }

  private retire(collectible: Collectible): void {
    const bucket = this.bySegment.get(collectible.segmentId)
    if (bucket) {
      const index = bucket.indexOf(collectible)
      if (index >= 0) {
        bucket.splice(index, 1)
      }
      if (bucket.length === 0) {
        this.bySegment.delete(collectible.segmentId)
      }
    }

    collectible.collected = true
    const pool = this.pools.get(collectible.kind)
    pool?.release(collectible)
  }

  private settleAttracted(): void {
    for (const collectibles of this.bySegment.values()) {
      for (const collectible of collectibles) {
        if (!collectible.attracted) {
          continue
        }
        collectible.attracted = false
        collectible.baseX = collectible.root.position.x
        collectible.baseY = collectible.root.position.y
        collectible.baseZ = collectible.root.position.z
      }
    }
  }
}
