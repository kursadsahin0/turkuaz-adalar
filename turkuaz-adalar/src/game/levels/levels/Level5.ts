import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 5: Amber Horizon
 * Introduces disappearing platforms and timing hazards.
 */
export const LEVEL_5: LevelDefinition = {
  id: 'amber-horizon',
  name: 'Amber Horizon',
  tagline: 'Race the setting sun.',
  theme: {
    id: 'horizon',
    name: 'Amber Horizon',
    skyColor: 0xffa726,
    fogColor: 0xff7043,
    sunPosition: 0.8,
    timeOfDay: 0.85,
  },
  baseSpeed: 13,
  maxSpeed: 22,
  rampDistance: 550,
  targetDistance: 900,
  unlockCost: 300,
  completionCoins: 150,
  completionCrystals: 10,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'rotating-bar',
      'sliding-obstacle',
      'moving-block',
      'disappearing-platform',
    ],
    maxDensity: 0.55,
    minObstacleSpacing: 5,
    safeZoneLength: 12,
  },
  collectibles: {
    coinDensity: 0.6,
    tokenChance: 0.16,
    powerUpChance: 0.32,
    rewardInterval: 3,
    clusterSize: 5,
  },
  checkpoints: {
    enabled: true,
    interval: 75,
    minDistance: 80,
  },
}
