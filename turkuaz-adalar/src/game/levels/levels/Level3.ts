import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 3: Sapphire Depths
 * Introduces sliding obstacles and vertical challenges.
 */
export const LEVEL_3: LevelDefinition = {
  id: 'sapphire-depths',
  name: 'Sapphire Depths',
  tagline: 'Dive into the deep blue.',
  theme: {
    id: 'depths',
    name: 'Sapphire Depths',
    skyColor: 0x1565c0,
    fogColor: 0x0891b2,
    sunPosition: 0.6,
    timeOfDay: 0.7,
  },
  baseSpeed: 11,
  maxSpeed: 18,
  rampDistance: 450,
  targetDistance: 700,
  unlockCost: 100,
  completionCoins: 100,
  completionCrystals: 7,
  obstacles: {
    enabledObstacles: ['static-barrier', 'lane-blocker', 'rotating-bar', 'sliding-obstacle'],
    maxDensity: 0.45,
    minObstacleSpacing: 6,
    safeZoneLength: 20,
  },
  collectibles: {
    coinDensity: 0.7,
    tokenChance: 0.15,
    powerUpChance: 0.31,
    rewardInterval: 4,
    clusterSize: 4,
  },
  checkpoints: {
    enabled: true,
    interval: 85,
    minDistance: 60,
  },
}
