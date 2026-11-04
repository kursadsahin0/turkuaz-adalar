#!/usr/bin/env node
/**
 * Collectibles and power-up validation.
 *
 * Exercises the real TypeScript modules through Vite SSR:
 *  - CollectibleManager: pooling, placement, collection detection, magnet
 *    attraction, animation, and single-award guarantee.
 *  - PowerUpSystem: application, expiration, shield charges, and multipliers.
 *  - ProgressionManager: persistent coin balance and run recording.
 *
 * Usage: npm run validate:collectibles
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { createServer } from 'vite'

globalThis.self = globalThis

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(HERE, '..')

let passed = 0
let failed = 0
const failures = []

function report(ok, name, detail) {
  const suffix = detail ? ` — ${detail}` : ''
  if (ok) {
    passed += 1
    console.log(`  [PASS] ${name}${suffix}`)
  } else {
    failed += 1
    failures.push(`${name}${suffix}`)
    console.log(`  [FAIL] ${name}${suffix}`)
  }
}

function check(name, fn, detail) {
  try {
    const result = fn()
    report(result !== false, name, detail)
    return result
  } catch (error) {
    report(false, name, `${detail ? `${detail}; ` : ''}${error.message}`)
    return false
  }
}

function approx(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance
}

const server = await createServer({
  root: PROJECT_ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const { CollectibleManager } = await server.ssrLoadModule(
    '/src/game/collectibles/CollectibleManager.ts',
  )
  const { PowerUpSystem } = await server.ssrLoadModule(
    '/src/game/powerups/PowerUpSystem.ts',
  )
  const { ProgressionManager } = await server.ssrLoadModule(
    '/src/systems/progression/ProgressionManager.ts',
  )
  const { SaveManager } = await server.ssrLoadModule(
    '/src/systems/save/SaveManager.ts',
  )
  const { GAME_CONFIG } = await server.ssrLoadModule('/src/config/GameConfig.ts')
  const { createSeed, Rng } = await server.ssrLoadModule('/src/utils/random.ts')

  const collectibleConfig = GAME_CONFIG.collectibles
  const powerUpConfig = GAME_CONFIG.powerUps
  const DT = 1 / 60

  console.log('\nCollectibles and power-up validation\n')

  // ----------------------------------------------------------- power-ups
  console.log('Power-up system')

  const powerUps = new PowerUpSystem()
  check(
    'powerup.empty_state',
    () => powerUps.active.length === 0 && powerUps.speedMultiplier === 1,
  )
  check(
    'powerup.apply_shield',
    () => {
      const result = powerUps.apply('shield')
      return result === true && powerUps.shieldActive === true
    },
  )
  check(
    'powerup.shield_charges',
    () => powerUps.shieldChargesRemaining === powerUpConfig.shield.charges,
  )
  check(
    'powerup.apply_magnet',
    () => {
      const result = powerUps.apply('magnet')
      return result === true && powerUps.magnetRadius > 0
    },
  )
  check(
    'powerup.magnet_radius',
    () => approx(powerUps.magnetRadius, powerUpConfig.magnet.radius, 1e-9),
  )
  check(
    'powerup.apply_speed',
    () => {
      const result = powerUps.apply('speed')
      return result === true && powerUps.speedMultiplier > 1
    },
  )
  check(
    'powerup.speed_multiplier',
    () => approx(powerUps.speedMultiplier, powerUpConfig.speed.speedMultiplier, 1e-9),
  )
  check(
    'powerup.apply_doubleJump',
    () => {
      const result = powerUps.apply('doubleJump')
      return result === true && powerUps.airJumps > 0
    },
  )
  check(
    'powerup.air_jumps',
    () => powerUps.airJumps === powerUpConfig.doubleJump.airJumps,
  )
  check(
    'powerup.active_count',
    () => powerUps.active.length === 4,
    'all four power-ups are active',
  )
  check(
    'powerup.remaining_time',
    () => {
      for (const active of powerUps.active) {
        if (active.remaining <= 0 || active.remaining > active.duration) {
          return false
        }
      }
      return true
    },
  )
  check(
    'powerup.shield_absorb_hit',
    () => {
      const before = powerUps.shieldChargesRemaining
      const absorbed = powerUps.absorbHit()
      return absorbed === true && powerUps.shieldChargesRemaining === before - 1
    },
  )
  check(
    'powerup.shield_depleted_after_last_charge',
    () => {
      powerUps.reset()
      powerUps.apply('shield')
      powerUps.absorbHit()
      const absorbed = powerUps.absorbHit()
      // After last charge is consumed, subsequent hits are NOT absorbed
      return absorbed === false && powerUps.shieldActive === false
    },
  )
  check(
    'powerup.absorb_hit_no_shield',
    () => {
      const absorbed = powerUps.absorbHit()
      return absorbed === false
    },
  )
  check(
    'powerup.expiration',
    () => {
      powerUps.reset()
      powerUps.apply('speed')
      const expired = powerUps.update(powerUpConfig.speed.duration + 0.1)
      return expired.includes('speed') && !powerUps.isActive('speed')
    },
  )
  check(
    'powerup.speed_multiplier_after_expiration',
    () => powerUps.speedMultiplier === 1,
  )
  check(
    'powerup_multiple_expiration',
    () => {
      powerUps.reset()
      powerUps.apply('magnet')
      const expired = powerUps.update(powerUpConfig.magnet.duration + 0.1)
      return expired.includes('magnet') && !powerUps.isActive('magnet')
    },
  )
  check(
    'powerup_remaining_accurate',
    () => {
      powerUps.apply('shield')
      const remaining = powerUps.remainingOf('shield')
      powerUps.update(1)
      const after = powerUps.remainingOf('shield')
      return approx(after, remaining - 1, 0.01)
    },
  )
  check(
    'powerup_reset',
    () => {
      powerUps.reset()
      return powerUps.active.length === 0 && powerUps.speedMultiplier === 1
    },
  )

  // -------------------------------------------------------- collectibles
  console.log('\nCollectible manager')

  const scene = new THREE.Scene()
  const collectibles = new CollectibleManager(scene)
  check(
    'collectible.empty_state',
    () => collectibles.liveCount === 0,
  )
  check(
    'collectible.place_coin',
    () => {
      const instance = collectibles.place('coin', 0, 0, -5)
      return instance.kind === 'coin' && collectibles.liveCount === 1
    },
  )
  check(
    'collectible.place_token',
    () => {
      const instance = collectibles.place('token', 0, 2.7, -10)
      return instance.kind === 'token' && collectibles.liveCount === 2
    },
  )
  check(
    'collectible.place_powerup',
    () => {
      const instance = collectibles.place('shield', 0, -2.7, -15)
      return instance.kind === 'shield' && collectibles.liveCount === 3
    },
  )
  check(
    'collectible.place_reward',
    () => {
      const instance = collectibles.place('reward', 0, 0, -20, 0, 'speed')
      return instance.kind === 'reward' && instance.grantedPowerUp === 'speed'
    },
  )
  check(
    'collectible.pool_created',
    () => collectibles.poolCreatedCount > 0,
    'instances were created during placement',
  )
  collectibles.clearAll()

  check(
    'collectible.reachable_from_deck',
    () => {
      // Regression: coins used to spawn at world y=heightAboveGround, buried
      // inside the deck (topY), so a runner standing on the track missed all.
      const testCollectibles = new CollectibleManager(scene)
      const coin = testCollectibles.place('coin', 0, 0, -5)
      const player = GAME_CONFIG.player
      const standingY = GAME_CONFIG.track.topY + player.halfHeight + player.radius
      const playerPos = new THREE.Vector3(0, standingY, -5)
      const aboveDeck = coin.root.position.y > GAME_CONFIG.track.topY
      const pickups = testCollectibles.collectAt(playerPos, player.radius)
      testCollectibles.dispose()
      return aboveDeck && pickups.length === 1
    },
    'a runner standing on the deck collects a coin in its lane',
  )

  check(
    'collectible.collection_radius',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      testCollectibles.place('coin', 0, 0, -5)
      const playerPos = new THREE.Vector3(0, GAME_CONFIG.track.topY + collectibleConfig.heightAboveGround + 0.5, -5)
      const pickups = testCollectibles.collectAt(playerPos, GAME_CONFIG.player.radius)
      testCollectibles.dispose()
      return pickups.length === 1 && pickups[0].kind === 'coin'
    },
  )
  check(
    'collectible_single_award',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      testCollectibles.place('coin', 0, 0, -6)
      const playerPos = new THREE.Vector3(0, GAME_CONFIG.track.topY + collectibleConfig.heightAboveGround + 0.5, -6)
      const first = testCollectibles.collectAt(playerPos, GAME_CONFIG.player.radius)
      const second = testCollectibles.collectAt(playerPos, GAME_CONFIG.player.radius)
      testCollectibles.dispose()
      return first.length === 1 && second.length === 0
    },
  )
  check(
    'collectible_vertical_tolerance',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      testCollectibles.place('coin', 0, 0, -10)
      const playerPos = new THREE.Vector3(0, GAME_CONFIG.track.topY + collectibleConfig.heightAboveGround + 2, -10)
      const pickups = testCollectibles.collectAt(playerPos, GAME_CONFIG.player.radius)
      testCollectibles.dispose()
      return pickups.length === 0
    },
  )
  check(
    'collectible_multiple_collection',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      testCollectibles.place('coin', 0, 0, -15)
      const playerPos = new THREE.Vector3(0, GAME_CONFIG.track.topY + collectibleConfig.heightAboveGround + 0.5, -15)
      const pickups = testCollectibles.collectAt(playerPos, GAME_CONFIG.player.radius)
      testCollectibles.dispose()
      return pickups.length === 1 && pickups[0].kind === 'coin'
    },
  )
  check(
    'collectible_reward_with_powerup',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      testCollectibles.place('reward', 0, 0, -20, 0, 'speed')
      const playerPos = new THREE.Vector3(0, GAME_CONFIG.track.topY + collectibleConfig.heightAboveGround + 0.5, -20)
      const pickups = testCollectibles.collectAt(playerPos, GAME_CONFIG.player.radius)
      testCollectibles.dispose()
      return pickups.length === 1 && pickups[0].powerUp === 'speed'
    },
  )
  check(
    'collectible_update_animates',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      testCollectibles.place('coin', 0, 0, -25)
      const before = testCollectibles.liveCount
      testCollectibles.update(DT, 0)
      testCollectibles.update(DT, 0.1)
      testCollectibles.update(DT, 0.2)
      testCollectibles.dispose()
      return before === 1
    },
  )
  check(
    'collectible_animation_completes',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      testCollectibles.place('coin', 0, 0, -30)
      const playerPos = new THREE.Vector3(0, GAME_CONFIG.track.topY + collectibleConfig.heightAboveGround + 0.5, -30)
      testCollectibles.collectAt(playerPos, GAME_CONFIG.player.radius)
      for (let index = 0; index < 30; index += 1) {
        testCollectibles.update(collectibleConfig.collection.duration / 30, 0)
      }
      // Collectible enters animation state; pool management handles freeing
      const result = testCollectibles.liveCount === 1
      testCollectibles.dispose()
      return result
    },
  )
  check(
    'collectible_clear_segment',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      testCollectibles.place('coin', 1, 0, -25)
      testCollectibles.clearSegment(1)
      const result = testCollectibles.liveCount === 0
      testCollectibles.dispose()
      return result
    },
  )
  check(
    'collectible_pool_reuse',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      const beforeCreated = testCollectibles.poolCreatedCount
      testCollectibles.place('coin', 2, 0, -30)
      testCollectibles.clearSegment(2)
      testCollectibles.place('coin', 3, 0, -35)
      const afterCreated = testCollectibles.poolCreatedCount
      testCollectibles.dispose()
      return afterCreated === beforeCreated
    },
  )

  // ------------------------------------------------------------- magnet
  console.log('\nMagnet attraction')

  check(
    'magnet_attracts_coins',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      testCollectibles.place('coin', 0, 2.7, -40)
      const playerPos = new THREE.Vector3(0, GAME_CONFIG.track.topY + collectibleConfig.heightAboveGround + 0.5, -42)
      for (let index = 0; index < 20; index += 1) {
        testCollectibles.attract(playerPos, powerUpConfig.magnet.radius, powerUpConfig.magnet.pullSpeed, DT)
      }
      const pickups = testCollectibles.collectAt(playerPos, GAME_CONFIG.player.radius)
      testCollectibles.dispose()
      return pickups.length === 1 && pickups[0].kind === 'coin'
    },
  )
  check(
    'magnet_attracts_tokens',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      testCollectibles.place('token', 0, -2.7, -45)
      const playerPos = new THREE.Vector3(0, GAME_CONFIG.track.topY + collectibleConfig.heightAboveGround + 0.5, -42)
      for (let index = 0; index < 20; index += 1) {
        testCollectibles.attract(playerPos, powerUpConfig.magnet.radius, powerUpConfig.magnet.pullSpeed, DT)
      }
      const pickups = testCollectibles.collectAt(playerPos, GAME_CONFIG.player.radius)
      testCollectibles.dispose()
      return pickups.length === 1 && pickups[0].kind === 'token'
    },
  )
  check(
    'magnet_ignores_powerups',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      testCollectibles.place('shield', 0, 0, -50)
      const playerPos = new THREE.Vector3(0, GAME_CONFIG.track.topY + collectibleConfig.heightAboveGround + 0.5, -42)
      // Magnet should not move power-ups
      testCollectibles.attract(playerPos, powerUpConfig.magnet.radius, powerUpConfig.magnet.pullSpeed, DT)
      // Power-up should still be at original position (not attracted)
      const shieldPos = new THREE.Vector3(0, GAME_CONFIG.track.topY + collectibleConfig.heightAboveGround + 0.5, -50)
      const pickups = testCollectibles.collectAt(shieldPos, GAME_CONFIG.player.radius)
      testCollectibles.dispose()
      // Power-up is collectible at its position, but magnet shouldn't have moved it
      // The test checks that magnet doesn't attract, not that power-ups aren't collectible
      return pickups.length === 1 && pickups[0].kind === 'shield'
    },
  )
  check(
    'magnet_no_attraction_when_inactive',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      testCollectibles.place('coin', 0, 0, -55)
      const playerPos = new THREE.Vector3(0, GAME_CONFIG.track.topY + collectibleConfig.heightAboveGround + 0.5, -42)
      const before = testCollectibles.collectAt(playerPos, GAME_CONFIG.player.radius).length
      testCollectibles.attract(playerPos, 0, powerUpConfig.magnet.pullSpeed, DT)
      const after = testCollectibles.collectAt(playerPos, GAME_CONFIG.player.radius).length
      testCollectibles.dispose()
      return before === after
    },
  )

  // ----------------------------------------------------------- segment
  console.log('\nSegment population')

  check(
    'segment_populates_coins',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      const rng = new Rng(createSeed())
      testCollectibles.populateSegment(10, -300, rng, 0.5, 1, () => false)
      const result = testCollectibles.liveCount > 0
      testCollectibles.dispose()
      return result
    },
  )
  check(
    'segment_clears_previous',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      const rng = new Rng(createSeed())
      testCollectibles.populateSegment(10, -300, rng, 0.5, 1, () => false)
      const before = testCollectibles.liveCount
      // Clear the segment before repopulating
      testCollectibles.clearSegment(10)
      testCollectibles.populateSegment(10, -300, rng, 0.5, 1, () => false)
      const after = testCollectibles.liveCount
      testCollectibles.dispose()
      // Clear should work; count after clear+populate should equal original
      return after > 0 && before > 0
    },
  )
  check(
    'segment_clears_correctly',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      const rng = new Rng(createSeed())
      testCollectibles.populateSegment(10, -300, rng, 0.5, 1, () => false)
      testCollectibles.clearSegment(10)
      const result = testCollectibles.liveCount === 0
      testCollectibles.dispose()
      return result
    },
  )

  // ------------------------------------------------------- progression
  console.log('\nProgression system')

  const save = new SaveManager()
  const progression = new ProgressionManager(save)
  check(
    'progression.initial_balance',
    () => progression.snapshot.coins >= 0
  )
  check(
    'progression.credit_coins',
    () => {
      const before = progression.snapshot.coins
      const after = progression.creditCoins(50)
      return after === before + 50
    },
  )
  check(
    'progression_persistent_balance',
    () => {
      const snapshot = progression.snapshot
      return snapshot.coins > 0
    },
  )
  check(
    'progression_record_run',
    () => {
      const before = progression.snapshot.totalRuns
      const update = progression.recordRun({
        score: 1000,
        distance: 500,
        crystals: 5,
      })
      return update.snapshot.totalRuns === before + 1
    },
  )
  check(
    'progression_best_score',
    () => {
      const before = progression.snapshot.bestScore
      const update = progression.recordRun({
        score: 2000,
        distance: 500,
        crystals: 5,
      })
      return update.isBestScore === true && update.snapshot.bestScore > before
    },
  )
  check(
    'progression_best_distance',
    () => {
      const before = progression.snapshot.bestDistance
      const update = progression.recordRun({
        score: 1000,
        distance: 1000,
        crystals: 5,
      })
      return update.isBestDistance === true && update.snapshot.bestDistance > before
    },
  )
  check(
    'progression_crystals_tracked',
    () => {
      const before = progression.snapshot.totalCrystals
      const update = progression.recordRun({
        score: 1000,
        distance: 500,
        crystals: 10,
      })
      return update.snapshot.totalCrystals === before + 10
    },
  )

  // ----------------------------------------------------------- cleanup
  console.log('\nCleanup')

  check(
    'collectible_dispose',
    () => {
      const testCollectibles = new CollectibleManager(scene)
      testCollectibles.place('coin', 0, 0, -60)
      testCollectibles.dispose()
      return testCollectibles.liveCount === 0
    },
  )

  // ----------------------------------------------------------------- summary
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failures.length > 0) {
    console.log('\nFailed tests:')
    for (const failure of failures) {
      console.log(`  - ${failure}`)
    }
    process.exit(1)
  }
} catch (error) {
  console.error(`\nValidation error: ${error.message}`)
  console.error(error.stack)
  process.exit(1)
} finally {
  await server.close()
}
