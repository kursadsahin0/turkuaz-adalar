import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 13: Glacier Drift
 * Ice floes that vanish and drift underfoot. A footing level:
 * disappearing and moving platforms with sliding hazards.
 */
export const LEVEL_13: LevelDefinition = {
  id: 'glacier-drift',
  name: 'Glacier Drift',
  tagline: 'Keep your footing on shifting ice.',
  theme: {
    id: 'glacier',
    name: 'Glacier Drift',
    skyColor: 0xbfe6ff,
    fogColor: 0x8ec9e8,
    sunPosition: 0.25,
    timeOfDay: 0.45,
  },
  mechanic: 'ice',
  baseSpeed: 17,
  maxSpeed: 31,
  rampDistance: 860,
  targetDistance: 1600,
  unlockCost: 1100,
  completionCoins: 355,
  completionCrystals: 24,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'sliding-obstacle',
      'disappearing-platform',
      'moving-platform',
      'falling-object',
    ],
    maxDensity: 0.75,
    minObstacleSpacing: 3.0,
    safeZoneLength: 8,
  },
  collectibles: {
    coinDensity: 0.38,
    tokenChance: 0.21,
    powerUpChance: 0.35,
    rewardInterval: 2,
    clusterSize: 9,
  },
  checkpoints: {
    enabled: true,
    interval: 55,
    minDistance: 125,
  },
}
