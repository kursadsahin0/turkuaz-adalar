import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 6: Rose Valley
 * Introduces falling objects and increased speed.
 */
export const LEVEL_6: LevelDefinition = {
  id: 'rose-valley',
  name: 'Rose Valley',
  tagline: 'Navigate the blooming danger.',
  theme: {
    id: 'valley',
    name: 'Rose Valley',
    skyColor: 0xec407a,
    fogColor: 0xd81b60,
    sunPosition: 0.3,
    timeOfDay: 0.4,
  },
  baseSpeed: 14,
  maxSpeed: 24,
  rampDistance: 600,
  targetDistance: 1000,
  unlockCost: 400,
  completionCoins: 175,
  completionCrystals: 12,
  minRowsPerSegment: 2,
  maxRowsPerSegment: 4,
  obstacleDensity: 0.65,
  crystalDensity: 0.45,
  platforms: {
    width: 4,
    gapRange: [2.5, 4],
    heightVariation: 1.5,
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
    ],
    maxDensity: 0.6,
    minObstacleSpacing: 4.5,
    threeLane: true,
    safeZoneLength: 10,
  },
  collectibles: {
    coinDensity: 0.55,
    tokenChance: 0.35,
    powerUpChance: 0.18,
    rewardInterval: 3,
    clusterSize: 6,
  },
  checkpoints: {
    enabled: true,
    interval: 70,
    minDistance: 90,
  },
}
