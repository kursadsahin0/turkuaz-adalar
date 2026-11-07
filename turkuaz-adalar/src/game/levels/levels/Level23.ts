import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 23: Sunset Lagoon
 * A golden-hour lagoon: bounce traps and moving platforms for
 * flowing, airy runs.
 */
export const LEVEL_23: LevelDefinition = {
  id: 'sunset-lagoon',
  name: 'Sunset Lagoon',
  tagline: 'Chase the last light over the water.',
  theme: {
    id: 'sunset',
    name: 'Sunset Lagoon',
    skyColor: 0xff9a6a,
    fogColor: 0xe0705a,
    sunPosition: 0.85,
    timeOfDay: 0.88,
  },
  baseSpeed: 17.8,
  maxSpeed: 32,
  rampDistance: 1050,
  targetDistance: 2500,
  unlockCost: 2650,
  completionCoins: 625,
  completionCrystals: 36,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'bounce-trap',
      'moving-platform',
      'moving-block',
      'rotating-bar',
    ],
    maxDensity: 0.78,
    minObstacleSpacing: 2.9,
    safeZoneLength: 8,
  },
  collectibles: {
    coinDensity: 0.38,
    tokenChance: 0.26,
    powerUpChance: 0.39,
    rewardInterval: 2,
    clusterSize: 9,
  },
  checkpoints: {
    enabled: true,
    interval: 54,
    minDistance: 140,
  },
}
