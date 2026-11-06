import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 22: Jade Temple
 * Temple steps of jade: timed gates and spinning bars guard the
 * way.
 */
export const LEVEL_22: LevelDefinition = {
  id: 'jade-temple',
  name: 'Jade Temple',
  tagline: 'Mind the gates of the old temple.',
  theme: {
    id: 'jade',
    name: 'Jade Temple',
    skyColor: 0x5aa88a,
    fogColor: 0x2f7060,
    sunPosition: 0.45,
    timeOfDay: 0.5,
  },
  baseSpeed: 17.6,
  maxSpeed: 31.7,
  rampDistance: 1028,
  targetDistance: 2400,
  unlockCost: 2500,
  completionCoins: 600,
  completionCrystals: 35,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'timed-gate',
      'rotating-bar',
      'sliding-obstacle',
      'falling-object',
    ],
    maxDensity: 0.77,
    minObstacleSpacing: 3.0,
    safeZoneLength: 8,
  },
  collectibles: {
    coinDensity: 0.39,
    tokenChance: 0.26,
    powerUpChance: 0.39,
    rewardInterval: 2,
    clusterSize: 9,
  },
  checkpoints: {
    enabled: true,
    interval: 54,
    minDistance: 137,
  },
}
