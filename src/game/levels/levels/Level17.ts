import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 17: Pearl Bay
 * A coin-rich bay of pearl-white decks with spinning bars and
 * bounce traps.
 */
export const LEVEL_17: LevelDefinition = {
  id: 'pearl-bay',
  name: 'Pearl Bay',
  tagline: 'Collect the shine before the tide turns.',
  theme: {
    id: 'pearl',
    name: 'Pearl Bay',
    skyColor: 0xf3e3d3,
    fogColor: 0xd9c2b0,
    sunPosition: 0.4,
    timeOfDay: 0.5,
  },
  mechanic: 'wind',
  baseSpeed: 17.1,
  maxSpeed: 30.3,
  rampDistance: 921,
  targetDistance: 1900,
  unlockCost: 1750,
  completionCoins: 475,
  completionCrystals: 30,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'rotating-bar',
      'bounce-trap',
      'timed-gate',
    ],
    maxDensity: 0.73,
    minObstacleSpacing: 3.3,
    safeZoneLength: 11,
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
    interval: 59,
    minDistance: 122,
  },
}
