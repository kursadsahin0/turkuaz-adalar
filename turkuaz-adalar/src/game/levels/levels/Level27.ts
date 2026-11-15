import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 27: Tidal Citadel
 * A sea fortress: gates, crushers and walls in tight sequences.
 */
export const LEVEL_27: LevelDefinition = {
  id: 'tidal-citadel',
  name: 'Tidal Citadel',
  tagline: 'Storm the fortress before high tide.',
  theme: {
    id: 'citadel',
    name: 'Tidal Citadel',
    skyColor: 0x7a8aa0,
    fogColor: 0x4a5a70,
    sunPosition: 0.55,
    timeOfDay: 0.6,
  },
  baseSpeed: 18.2,
  maxSpeed: 33.1,
  rampDistance: 1135,
  targetDistance: 2900,
  unlockCost: 3250,
  completionCoins: 725,
  completionCrystals: 40,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'timed-gate',
      'moving-block',
      'sliding-obstacle',
      'rotating-bar',
      'falling-object',
    ],
    maxDensity: 0.81,
    minObstacleSpacing: 2.6,
    safeZoneLength: 5,
  },
  collectibles: {
    coinDensity: 0.36,
    tokenChance: 0.28,
    powerUpChance: 0.41,
    rewardInterval: 2,
    clusterSize: 10,
  },
  checkpoints: {
    enabled: true,
    interval: 50,
    minDistance: 151,
  },
}
