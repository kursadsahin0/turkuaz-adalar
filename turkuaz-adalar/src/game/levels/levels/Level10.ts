import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 10: Void Walker
 * Master level with all obstacles at maximum difficulty.
 */
export const LEVEL_10: LevelDefinition = {
  id: 'void-walker',
  name: 'Void Walker',
  tagline: 'Conquer the infinite abyss.',
  theme: {
    id: 'void',
    name: 'Void Walker',
    skyColor: 0x1a1a2e,
    fogColor: 0x16213e,
    sunPosition: 0.5,
    timeOfDay: 0.1,
  },
  baseSpeed: 18,
  maxSpeed: 32,
  rampDistance: 800,
  targetDistance: 1500,
  unlockCost: 800,
  completionCoins: 300,
  completionCrystals: 20,
  minRowsPerSegment: 3,
  maxRowsPerSegment: 5,
  obstacleDensity: 0.85,
  crystalDensity: 0.25,
  platforms: {
    width: 2,
    gapRange: [5, 7],
    heightVariation: 3.0,
    segmentLength: 30,
    floating: true,
  },
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'rotating-bar',
      'sliding-obstacle',
      'moving-block',
      'disappearing-platform',
      'falling-object',
      'timed-gate',
      'bounce-trap',
    ],
    maxDensity: 0.8,
    minObstacleSpacing: 2.5,
    threeLane: true,
    safeZoneLength: 3,
  },
  collectibles: {
    coinDensity: 0.35,
    tokenChance: 0.55,
    powerUpChance: 0.3,
    rewardInterval: 2,
    clusterSize: 10,
  },
  checkpoints: {
    enabled: true,
    interval: 50,
    minDistance: 130,
  },
}
