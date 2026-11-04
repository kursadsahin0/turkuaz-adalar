import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 9: Coral Core
 * Expert level with maximum obstacle density and tight spacing.
 */
export const LEVEL_9: LevelDefinition = {
  id: 'coral-core',
  name: 'Coral Core',
  tagline: 'Survive the heart of the reef.',
  theme: {
    id: 'core',
    name: 'Coral Core',
    skyColor: 0xff6b6b,
    fogColor: 0xff5252,
    sunPosition: 0.5,
    timeOfDay: 0.5,
  },
  baseSpeed: 17,
  maxSpeed: 30,
  rampDistance: 750,
  targetDistance: 1300,
  unlockCost: 700,
  completionCoins: 250,
  completionCrystals: 18,
  minRowsPerSegment: 3,
  maxRowsPerSegment: 5,
  obstacleDensity: 0.8,
  crystalDensity: 0.3,
  platforms: {
    width: 2.5,
    gapRange: [4, 6],
    heightVariation: 2.5,
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
    maxDensity: 0.75,
    minObstacleSpacing: 3,
    threeLane: true,
    safeZoneLength: 5,
  },
  collectibles: {
    coinDensity: 0.4,
    tokenChance: 0.5,
    powerUpChance: 0.25,
    rewardInterval: 2,
    clusterSize: 8,
  },
  checkpoints: {
    enabled: true,
    interval: 55,
    minDistance: 120,
  },
}
