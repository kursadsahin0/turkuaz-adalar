/**
 * Validation script for level configurations.
 * Tests level data integrity, unlocks progression, and completion conditions.
 */

import { createServer } from 'vite'

const LEVEL_VALIDATION_ISSUES = []

function assert(condition, message) {
  if (!condition) {
    LEVEL_VALIDATION_ISSUES.push(message)
  }
}

function assertRange(value, min, max, name) {
  assert(value >= min && value <= max, `${name} must be between ${min} and ${max}, got ${value}`)
}

function assertPositive(value, name) {
  assert(value > 0, `${name} must be positive, got ${value}`)
}

function assertNonEmpty(value, name) {
  assert(value && value.length > 0, `${name} must not be empty`)
}

function assertArray(value, name) {
  assert(Array.isArray(value), `${name} must be an array`)
}

function assertType(value, type, name) {
  assert(typeof value === type, `${name} must be a ${type}, got ${typeof value}`)
}

async function main() {
  console.log('Starting level configuration validation...\n')

  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    server: { hmr: false },
  })

  const { LEVEL_CATALOG } = await server.ssrLoadModule('/src/game/levels/LevelCatalog.ts')
  const { ISLAND_LOOKS } = await server.ssrLoadModule('/src/game/levels/IslandLooks.ts')
  const { ISLAND_STYLES } = await server.ssrLoadModule('/src/systems/audio/MusicSequencer.ts')
  const { spawnRulesFor } = await server.ssrLoadModule('/src/game/levels/SpawnRules.ts')
  const levels = [...LEVEL_CATALOG]
  assert(levels.length >= 30, `expected at least 30 islands, got ${levels.length}`)

  console.log('Validating level definitions...\n')

  // Validate each level
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]
    const levelNum = i + 1
    console.log(`Level ${levelNum}: ${level.name}`)

    // Basic structure
    assertType(level.id, 'string', 'id')
    assertNonEmpty(level.id, 'id')
    assertType(level.name, 'string', 'name')
    assertNonEmpty(level.name, 'name')
    assertType(level.tagline, 'string', 'tagline')
    assertNonEmpty(level.tagline, 'tagline')

    // Speed values
    assertPositive(level.baseSpeed, 'baseSpeed')
    assertPositive(level.maxSpeed, 'maxSpeed')
    assert(level.maxSpeed > level.baseSpeed, 'maxSpeed must be greater than baseSpeed')

    // Distance values
    assertPositive(level.rampDistance, 'rampDistance')
    assertPositive(level.targetDistance, 'targetDistance')
    assert(
      level.targetDistance > level.rampDistance,
      'targetDistance must be greater than rampDistance',
    )

    // Unlock cost (first level should be free)
    if (levelNum === 1) {
      assert(level.unlockCost === 0, 'First level unlockCost must be 0')
    } else {
      assert(level.unlockCost >= 0, 'unlockCost must be non-negative')
    }

    // Completion requirements
    assertPositive(level.completionCoins, 'completionCoins')
    assertPositive(level.completionCrystals, 'completionCrystals')

    // Theme
    assertType(level.theme, 'object', 'theme')
    assertType(level.theme.id, 'string', 'theme.id')
    assertType(level.theme.name, 'string', 'theme.name')
    assertType(level.theme.skyColor, 'number', 'theme.skyColor')
    assertType(level.theme.fogColor, 'number', 'theme.fogColor')
    assertRange(level.theme.sunPosition, 0, 1, 'theme.sunPosition')
    assertRange(level.theme.timeOfDay, 0, 1, 'theme.timeOfDay')

    // Obstacles
    assertType(level.obstacles, 'object', 'obstacles')
    assertArray(level.obstacles.enabledObstacles, 'obstacles.enabledObstacles')
    assert(
      level.obstacles.enabledObstacles.length > 0,
      'obstacles.enabledObstacles must not be empty',
    )
    assertRange(level.obstacles.maxDensity, 0, 1, 'obstacles.maxDensity')
    assertPositive(level.obstacles.minObstacleSpacing, 'obstacles.minObstacleSpacing')
    assertPositive(level.obstacles.safeZoneLength, 'obstacles.safeZoneLength')

    // Collectibles
    assertType(level.collectibles, 'object', 'collectibles')
    assertRange(level.collectibles.coinDensity, 0, 1, 'collectibles.coinDensity')
    assertRange(level.collectibles.tokenChance, 0, 1, 'collectibles.tokenChance')
    assertRange(level.collectibles.powerUpChance, 0, 1, 'collectibles.powerUpChance')
    assertPositive(level.collectibles.rewardInterval, 'collectibles.rewardInterval')
    assertPositive(level.collectibles.clusterSize, 'collectibles.clusterSize')

    // Checkpoints
    assertType(level.checkpoints, 'object', 'checkpoints')
    assertType(level.checkpoints.enabled, 'boolean', 'checkpoints.enabled')
    if (level.checkpoints.enabled) {
      assertPositive(level.checkpoints.interval, 'checkpoints.interval')
      assertPositive(level.checkpoints.minDistance, 'checkpoints.minDistance')
      assert(
        level.checkpoints.interval <= level.targetDistance,
        'checkpoints.interval must be <= targetDistance',
      )
    }

    // Every island has its own look and music.
    assert(
      ISLAND_LOOKS[level.theme.id] !== undefined || levelNum === 1,
      `${level.id}: no island look`,
    )
    assert(ISLAND_STYLES[level.theme.id] !== undefined, `${level.id}: no music style`)

    // Spawn rules derived from the definition stay in sensible bounds.
    const rules = spawnRulesFor(level)
    assert(rules.safeStartDistance < level.targetDistance / 4, `${level.id}: safe zone too long`)
    assertRange(rules.tokenChance, 0.05, 0.4, `${level.id}: tokenChance`)
    assertRange(rules.powerUpChance, 0.1, 0.6, `${level.id}: powerUpChance`)
    assert(rules.checkpointEverySegments >= 1, `${level.id}: checkpoint spacing`)

    console.log(`  ✓ Basic structure validated`)
  }

  console.log('\nValidating level progression...\n')

  // Validate progression logic
  for (let i = 1; i < levels.length; i++) {
    const prevLevel = levels[i - 1]
    const currLevel = levels[i]

    // Difficulty trends upward; a calmer "breather" island may dip, but only a little.
    assert(
      currLevel.maxSpeed >= prevLevel.maxSpeed - 6,
      `Level ${i + 1} maxSpeed drops too far below Level ${i}`,
    )
    assert(
      currLevel.obstacles.maxDensity >= prevLevel.obstacles.maxDensity - 0.2,
      `Level ${i + 1} obstacle density drops too far below Level ${i}`,
    )
    assert(currLevel.maxSpeed <= 36, `Level ${i + 1} maxSpeed is beyond what a runner can react to`)
    assert(
      currLevel.unlockCost >= prevLevel.unlockCost,
      `Level ${i + 1} unlockCost should >= Level ${i}`,
    )
    assert(
      currLevel.completionCoins >= prevLevel.completionCoins,
      `Level ${i + 1} completionCoins should >= Level ${i}`,
    )
    assert(
      currLevel.completionCrystals >= prevLevel.completionCrystals,
      `Level ${i + 1} completionCrystals should >= Level ${i}`,
    )

    console.log(`  ✓ Level ${i + 1} progression validated against Level ${i}`)
  }

  console.log('\nValidating level uniqueness...\n')

  // Check for duplicate IDs
  const ids = levels.map((l) => l.id)
  const uniqueIds = new Set(ids)
  assert(ids.length === uniqueIds.size, 'All level IDs must be unique')
  console.log(`  ✓ All level IDs are unique`)

  // Check for duplicate names
  const names = levels.map((l) => l.name)
  const uniqueNames = new Set(names)
  assert(names.length === uniqueNames.size, 'All level names must be unique')
  console.log(`  ✓ All level names are unique`)

  console.log('\nValidating obstacle availability...\n')

  const allObstacles = [
    'moving-platform',
    'static-barrier',
    'lane-blocker',
    'rotating-bar',
    'sliding-obstacle',
    'moving-block',
    'disappearing-platform',
    'falling-object',
    'timed-gate',
    'bounce-trap',
  ]

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]
    for (const obstacle of level.obstacles.enabledObstacles) {
      assert(allObstacles.includes(obstacle), `Level ${i + 1} has unknown obstacle: ${obstacle}`)
    }
    console.log(`  ✓ Level ${i + 1} obstacles validated`)
  }

  console.log('\nValidation complete.\n')

  if (LEVEL_VALIDATION_ISSUES.length === 0) {
    console.log('✅ All level configurations are valid!')
    process.exit(0)
  } else {
    console.log(`❌ Found ${LEVEL_VALIDATION_ISSUES.length} issue(s):\n`)
    for (const issue of LEVEL_VALIDATION_ISSUES) {
      console.log(`  - ${issue}`)
    }
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Validation script error:', error)
  process.exit(1)
})
