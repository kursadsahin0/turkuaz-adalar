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

  await server.moduleGraph.ensureEntryFromUrl('/src/game/levels/levels/Level1.ts')
  await server.moduleGraph.ensureEntryFromUrl('/src/game/levels/levels/Level2.ts')
  await server.moduleGraph.ensureEntryFromUrl('/src/game/levels/levels/Level3.ts')
  await server.moduleGraph.ensureEntryFromUrl('/src/game/levels/levels/Level4.ts')
  await server.moduleGraph.ensureEntryFromUrl('/src/game/levels/levels/Level5.ts')
  await server.moduleGraph.ensureEntryFromUrl('/src/game/levels/levels/Level6.ts')
  await server.moduleGraph.ensureEntryFromUrl('/src/game/levels/levels/Level7.ts')
  await server.moduleGraph.ensureEntryFromUrl('/src/game/levels/levels/Level8.ts')
  await server.moduleGraph.ensureEntryFromUrl('/src/game/levels/levels/Level9.ts')
  await server.moduleGraph.ensureEntryFromUrl('/src/game/levels/levels/Level10.ts')

  const level1 = (await server.ssrLoadModule('/src/game/levels/levels/Level1.ts')).LEVEL_1
  const level2 = (await server.ssrLoadModule('/src/game/levels/levels/Level2.ts')).LEVEL_2
  const level3 = (await server.ssrLoadModule('/src/game/levels/levels/Level3.ts')).LEVEL_3
  const level4 = (await server.ssrLoadModule('/src/game/levels/levels/Level4.ts')).LEVEL_4
  const level5 = (await server.ssrLoadModule('/src/game/levels/levels/Level5.ts')).LEVEL_5
  const level6 = (await server.ssrLoadModule('/src/game/levels/levels/Level6.ts')).LEVEL_6
  const level7 = (await server.ssrLoadModule('/src/game/levels/levels/Level7.ts')).LEVEL_7
  const level8 = (await server.ssrLoadModule('/src/game/levels/levels/Level8.ts')).LEVEL_8
  const level9 = (await server.ssrLoadModule('/src/game/levels/levels/Level9.ts')).LEVEL_9
  const level10 = (await server.ssrLoadModule('/src/game/levels/levels/Level10.ts')).LEVEL_10

  const levels = [level1, level2, level3, level4, level5, level6, level7, level8, level9, level10]

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
    assert(level.targetDistance > level.rampDistance, 'targetDistance must be greater than rampDistance')

    // Unlock cost (first level should be free)
    if (levelNum === 1) {
      assert(level.unlockCost === 0, 'First level unlockCost must be 0')
    } else {
      assert(level.unlockCost >= 0, 'unlockCost must be non-negative')
    }

    // Completion requirements
    assertPositive(level.completionCoins, 'completionCoins')
    assertPositive(level.completionCrystals, 'completionCrystals')

    // Segment configuration
    assertPositive(level.minRowsPerSegment, 'minRowsPerSegment')
    assertPositive(level.maxRowsPerSegment, 'maxRowsPerSegment')
    assert(level.maxRowsPerSegment >= level.minRowsPerSegment, 'maxRowsPerSegment must be >= minRowsPerSegment')

    // Density values
    assertRange(level.obstacleDensity, 0, 1, 'obstacleDensity')
    assertRange(level.crystalDensity, 0, 1, 'crystalDensity')

    // Theme
    assertType(level.theme, 'object', 'theme')
    assertType(level.theme.id, 'string', 'theme.id')
    assertType(level.theme.name, 'string', 'theme.name')
    assertType(level.theme.skyColor, 'number', 'theme.skyColor')
    assertType(level.theme.fogColor, 'number', 'theme.fogColor')
    assertRange(level.theme.sunPosition, 0, 1, 'theme.sunPosition')
    assertRange(level.theme.timeOfDay, 0, 1, 'theme.timeOfDay')

    // Platforms
    assertType(level.platforms, 'object', 'platforms')
    assertPositive(level.platforms.width, 'platforms.width')
    assertArray(level.platforms.gapRange, 'platforms.gapRange')
    assert(level.platforms.gapRange.length === 2, 'platforms.gapRange must have 2 elements')
    assert(level.platforms.gapRange[0] >= 0, 'platforms.gapRange[0] must be non-negative')
    assert(level.platforms.gapRange[1] >= level.platforms.gapRange[0], 'platforms.gapRange[1] must be >= gapRange[0]')
    assertPositive(level.platforms.heightVariation, 'platforms.heightVariation')
    assertPositive(level.platforms.segmentLength, 'platforms.segmentLength')
    assertType(level.platforms.floating, 'boolean', 'platforms.floating')

    // Obstacles
    assertType(level.obstacles, 'object', 'obstacles')
    assertArray(level.obstacles.enabledObstacles, 'obstacles.enabledObstacles')
    assert(level.obstacles.enabledObstacles.length > 0, 'obstacles.enabledObstacles must not be empty')
    assertRange(level.obstacles.maxDensity, 0, 1, 'obstacles.maxDensity')
    assertPositive(level.obstacles.minObstacleSpacing, 'obstacles.minObstacleSpacing')
    assertType(level.obstacles.threeLane, 'boolean', 'obstacles.threeLane')
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
      assert(level.checkpoints.interval <= level.targetDistance, 'checkpoints.interval must be <= targetDistance')
    }

    console.log(`  ✓ Basic structure validated`)
  }

  console.log('\nValidating level progression...\n')

  // Validate progression logic
  for (let i = 1; i < levels.length; i++) {
    const prevLevel = levels[i - 1]
    const currLevel = levels[i]

    // Difficulty should increase
    assert(currLevel.baseSpeed >= prevLevel.baseSpeed, `Level ${i + 1} baseSpeed should >= Level ${i}`)
    assert(currLevel.maxSpeed >= prevLevel.maxSpeed, `Level ${i + 1} maxSpeed should >= Level ${i}`)
    assert(currLevel.targetDistance >= prevLevel.targetDistance, `Level ${i + 1} targetDistance should >= Level ${i}`)
    assert(currLevel.obstacleDensity >= prevLevel.obstacleDensity, `Level ${i + 1} obstacleDensity should >= Level ${i}`)
    assert(currLevel.unlockCost >= prevLevel.unlockCost, `Level ${i + 1} unlockCost should >= Level ${i}`)
    assert(currLevel.completionCoins >= prevLevel.completionCoins, `Level ${i + 1} completionCoins should >= Level ${i}`)
    assert(currLevel.completionCrystals >= prevLevel.completionCrystals, `Level ${i + 1} completionCrystals should >= Level ${i}`)

    console.log(`  ✓ Level ${i + 1} progression validated against Level ${i}`)
  }

  console.log('\nValidating level uniqueness...\n')

  // Check for duplicate IDs
  const ids = levels.map(l => l.id)
  const uniqueIds = new Set(ids)
  assert(ids.length === uniqueIds.size, 'All level IDs must be unique')
  console.log(`  ✓ All level IDs are unique`)

  // Check for duplicate names
  const names = levels.map(l => l.name)
  const uniqueNames = new Set(names)
  assert(names.length === uniqueNames.size, 'All level names must be unique')
  console.log(`  ✓ All level names are unique`)

  console.log('\nValidating obstacle availability...\n')

  const allObstacles = [
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
