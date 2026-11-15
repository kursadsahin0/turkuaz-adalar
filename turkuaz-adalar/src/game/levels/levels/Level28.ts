import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 28: Nebula Shoals
 * A dreamlike shoal under a nebula: shifting platforms and
 * bounce traps.
 */
export const LEVEL_28: LevelDefinition = {
  id: 'nebula-shoals',
  name: 'Nebula Shoals',
  tagline: 'Run where the sea meets the stars.',
  theme: {
    id: 'nebula',
    name: 'Nebula Shoals',
    skyColor: 0x3a1a5a,
    fogColor: 0x2a1048,
    sunPosition: 0.5,
    timeOfDay: 0.1,
  },
  baseSpeed: 18.3,
  maxSpeed: 33.4,
  rampDistance: 1157,
  targetDistance: 3000,
  unlockCost: 3400,
  completionCoins: 750,
  completionCrystals: 41,
  obstacles: {
    enabledObstacles: [
      'lane-blocker',
      'rotating-bar',
      'sliding-obstacle',
      'disappearing-platform',
      'moving-platform',
      'bounce-trap',
      'timed-gate',
    ],
    maxDensity: 0.82,
    minObstacleSpacing: 2.5,
    safeZoneLength: 5,
  },
  collectibles: {
    coinDensity: 0.35,
    tokenChance: 0.29,
    powerUpChance: 0.41,
    rewardInterval: 2,
    clusterSize: 10,
  },
  checkpoints: {
    enabled: true,
    interval: 49,
    minDistance: 154,
  },
}
