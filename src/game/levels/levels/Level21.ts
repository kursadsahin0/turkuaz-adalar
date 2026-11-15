import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 21: Moonlit Atoll
 * A night run around a ring-shaped atoll under the moon.
 */
export const LEVEL_21: LevelDefinition = {
  id: 'moonlit-atoll',
  name: 'Moonlit Atoll',
  tagline: 'Race the moon across the reef ring.',
  theme: {
    id: 'atoll',
    name: 'Moonlit Atoll',
    skyColor: 0x1f2f5a,
    fogColor: 0x18264a,
    sunPosition: 0.5,
    timeOfDay: 0.08,
  },
  baseSpeed: 16.5,
  maxSpeed: 29.4,
  rampDistance: 1007,
  targetDistance: 2300,
  unlockCost: 2350,
  completionCoins: 575,
  completionCrystals: 34,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'disappearing-platform',
      'moving-platform',
      'timed-gate',
    ],
    maxDensity: 0.68,
    minObstacleSpacing: 3.0,
    safeZoneLength: 9,
  },
  collectibles: {
    coinDensity: 0.39,
    tokenChance: 0.25,
    powerUpChance: 0.38,
    rewardInterval: 2,
    clusterSize: 9,
  },
  checkpoints: {
    enabled: true,
    interval: 55,
    minDistance: 134,
  },
}
