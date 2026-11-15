import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 24: Frost Fjord
 * A frozen fjord with brittle ice: disappearing platforms and
 * falling icicles.
 */
export const LEVEL_24: LevelDefinition = {
  id: 'frost-fjord',
  name: 'Frost Fjord',
  tagline: 'Hold the line on the frozen fjord.',
  theme: {
    id: 'fjord',
    name: 'Frost Fjord',
    skyColor: 0xa8d0e8,
    fogColor: 0x6a9ac0,
    sunPosition: 0.3,
    timeOfDay: 0.35,
  },
  mechanic: 'ice',
  baseSpeed: 16.9,
  maxSpeed: 30.299999999999997,
  rampDistance: 1071,
  targetDistance: 2600,
  unlockCost: 2800,
  completionCoins: 650,
  completionCrystals: 37,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'disappearing-platform',
      'sliding-obstacle',
      'falling-object',
      'moving-platform',
    ],
    maxDensity: 0.71,
    minObstacleSpacing: 2.8,
    safeZoneLength: 7,
  },
  collectibles: {
    coinDensity: 0.37,
    tokenChance: 0.27,
    powerUpChance: 0.4,
    rewardInterval: 2,
    clusterSize: 9,
  },
  checkpoints: {
    enabled: true,
    interval: 53,
    minDistance: 142,
  },
}
