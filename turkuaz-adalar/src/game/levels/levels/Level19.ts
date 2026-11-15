import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 19: Kelp Forest
 * A sunken kelp forest: everything sways. Moving and vanishing
 * platforms test timing more than speed.
 */
export const LEVEL_19: LevelDefinition = {
  id: 'kelp-forest',
  name: 'Kelp Forest',
  tagline: 'Slip through the swaying green.',
  theme: {
    id: 'kelp',
    name: 'Kelp Forest',
    skyColor: 0x2f7a6a,
    fogColor: 0x1d4f45,
    sunPosition: 0.35,
    timeOfDay: 0.45,
  },
  baseSpeed: 16.3,
  maxSpeed: 28.9,
  rampDistance: 964,
  targetDistance: 2100,
  unlockCost: 2050,
  completionCoins: 525,
  completionCrystals: 32,
  obstacles: {
    enabledObstacles: [
      'lane-blocker',
      'sliding-obstacle',
      'moving-block',
      'disappearing-platform',
      'moving-platform',
    ],
    maxDensity: 0.67,
    minObstacleSpacing: 3.2,
    safeZoneLength: 10,
  },
  collectibles: {
    coinDensity: 0.4,
    tokenChance: 0.24,
    powerUpChance: 0.37,
    rewardInterval: 2,
    clusterSize: 8,
  },
  checkpoints: {
    enabled: true,
    interval: 57,
    minDistance: 128,
  },
}
