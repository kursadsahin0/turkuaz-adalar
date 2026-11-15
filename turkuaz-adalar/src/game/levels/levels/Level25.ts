import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 25: Ember Isles
 * Islands of cooling lava: embers fall while the gates keep time.
 */
export const LEVEL_25: LevelDefinition = {
  id: 'ember-isles',
  name: 'Ember Isles',
  tagline: 'Cross the smouldering stepping stones.',
  theme: {
    id: 'ember',
    name: 'Ember Isles',
    skyColor: 0x6a2a1a,
    fogColor: 0x3a140c,
    sunPosition: 0.7,
    timeOfDay: 0.82,
  },
  mechanic: 'embers',
  baseSpeed: 18,
  maxSpeed: 32.6,
  rampDistance: 1092,
  targetDistance: 2700,
  unlockCost: 2950,
  completionCoins: 675,
  completionCrystals: 38,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'falling-object',
      'bounce-trap',
      'timed-gate',
      'moving-block',
      'rotating-bar',
    ],
    maxDensity: 0.8,
    minObstacleSpacing: 2.8,
    safeZoneLength: 6,
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
    interval: 52,
    minDistance: 145,
  },
}
