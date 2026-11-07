import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 18: Sandstorm Dunes
 * Hot desert islands under a sandstorm: falling rocks and sliding
 * walls at speed.
 */
export const LEVEL_18: LevelDefinition = {
  id: 'sandstorm-dunes',
  name: 'Sandstorm Dunes',
  tagline: 'Run blind through the swirling sand.',
  theme: {
    id: 'dunes',
    name: 'Sandstorm Dunes',
    skyColor: 0xe0b070,
    fogColor: 0xb8864a,
    sunPosition: 0.6,
    timeOfDay: 0.6,
  },
  baseSpeed: 17.2,
  maxSpeed: 30.6,
  rampDistance: 942,
  targetDistance: 2000,
  unlockCost: 1900,
  completionCoins: 500,
  completionCrystals: 31,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'falling-object',
      'sliding-obstacle',
      'moving-block',
      'bounce-trap',
    ],
    maxDensity: 0.74,
    minObstacleSpacing: 3.3,
    safeZoneLength: 10,
  },
  collectibles: {
    coinDensity: 0.41,
    tokenChance: 0.23,
    powerUpChance: 0.37,
    rewardInterval: 2,
    clusterSize: 8,
  },
  checkpoints: {
    enabled: true,
    interval: 58,
    minDistance: 125,
  },
}
