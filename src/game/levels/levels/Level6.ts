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
    safeZoneLength: 10,
  },
  collectibles: {
    coinDensity: 0.55,
    tokenChance: 0.17,
    powerUpChance: 0.32,
    rewardInterval: 3,
    clusterSize: 6,
  },
  checkpoints: {
    enabled: true,
    interval: 70,
    minDistance: 90,
  },
}
