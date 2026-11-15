import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 4: Crystal Peaks
 * Introduces moving platforms and precision jumping.
 */
export const LEVEL_4: LevelDefinition = {
  id: 'crystal-peaks',
  name: 'Crystal Peaks',
  tagline: 'Scale the glimmering heights.',
  theme: {
    id: 'peaks',
    name: 'Crystal Peaks',
    skyColor: 0x9b59b6,
    fogColor: 0x7e57c2,
    sunPosition: 0.7,
    timeOfDay: 0.35,
  },
  baseSpeed: 12,
  maxSpeed: 20,
  rampDistance: 500,
  targetDistance: 800,
  unlockCost: 200,
  completionCoins: 125,
  completionCrystals: 9,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'rotating-bar',
      'sliding-obstacle',
      'moving-block',
    ],
    maxDensity: 0.5,
    minObstacleSpacing: 5.5,
    safeZoneLength: 15,
  },
  collectibles: {
    coinDensity: 0.65,
    tokenChance: 0.16,
    powerUpChance: 0.31,
    rewardInterval: 3,
    clusterSize: 5,
  },
  checkpoints: {
    enabled: true,
    interval: 80,
    minDistance: 70,
  },
}
