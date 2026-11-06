import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 20: Thunder Cliffs
 * Sea cliffs in a storm, wide gaps and timed gates; a step up
 * after the kelp forest.
 */
export const LEVEL_20: LevelDefinition = {
  id: 'thunder-cliffs',
  name: 'Thunder Cliffs',
  tagline: 'Leap the gaps as the sky cracks.',
  theme: {
    id: 'cliffs',
    name: 'Thunder Cliffs',
    skyColor: 0x4f5a6e,
    fogColor: 0x2c3445,
    sunPosition: 0.65,
    timeOfDay: 0.7,
  },
  chase: true,
  baseSpeed: 17.4,
  maxSpeed: 31.1,
  rampDistance: 985,
  targetDistance: 2200,
  unlockCost: 2200,
  completionCoins: 550,
  completionCrystals: 33,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'rotating-bar',
      'falling-object',
      'timed-gate',
      'bounce-trap',
      'moving-block',
    ],
    maxDensity: 0.75,
    minObstacleSpacing: 3.1,
    safeZoneLength: 9,
  },
  collectibles: {
    coinDensity: 0.4,
    tokenChance: 0.24,
    powerUpChance: 0.38,
    rewardInterval: 2,
    clusterSize: 8,
  },
  checkpoints: {
    enabled: true,
    interval: 56,
    minDistance: 131,
  },
}
