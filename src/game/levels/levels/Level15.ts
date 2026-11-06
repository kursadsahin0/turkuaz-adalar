import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 15: Aurora Crown
 * End of chapter two: every obstacle in the game under the aurora.
 */
export const LEVEL_15: LevelDefinition = {
  id: 'aurora-crown',
  name: 'Aurora Crown',
  tagline: 'The end of chapter two, beneath the northern lights.',
  theme: {
    id: 'aurora',
    name: 'Aurora Crown',
    skyColor: 0x0b1d3a,
    fogColor: 0x123a5c,
    sunPosition: 0.5,
    timeOfDay: 0.05,
  },
  baseSpeed: 18,
  maxSpeed: 33,
  rampDistance: 1000,
  targetDistance: 2000,
  unlockCost: 1500,
  completionCoins: 450,
  completionCrystals: 28,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'rotating-bar',
      'sliding-obstacle',
      'moving-block',
      'disappearing-platform',
      'moving-platform',
      'falling-object',
      'timed-gate',
      'bounce-trap',
    ],
    maxDensity: 0.8,
    minObstacleSpacing: 2.5,
    safeZoneLength: 5,
  },
  collectibles: {
    coinDensity: 0.35,
    tokenChance: 0.22,
    powerUpChance: 0.36,
    rewardInterval: 2,
    clusterSize: 10,
  },
  checkpoints: {
    enabled: true,
    interval: 50,
    minDistance: 140,
  },
}
