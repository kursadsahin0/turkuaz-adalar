import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 7: Mint Archipelago
 * Introduces timed gates and complex obstacle combinations.
 */
export const LEVEL_7: LevelDefinition = {
  id: 'mint-archipelago',
  name: 'Mint Archipelago',
  tagline: 'Master the island maze.',
  theme: {
    id: 'archipelago',
    name: 'Mint Archipelago',
    skyColor: 0x00b894,
    fogColor: 0x00cec9,
    sunPosition: 0.5,
    timeOfDay: 0.55,
  },
  baseSpeed: 15,
  maxSpeed: 26,
  rampDistance: 650,
  targetDistance: 1100,
  unlockCost: 500,
  completionCoins: 200,
  completionCrystals: 14,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'rotating-bar',
      'sliding-obstacle',
      'moving-block',
      'disappearing-platform',
      'falling-object',
      'timed-gate',
    ],
    maxDensity: 0.65,
    minObstacleSpacing: 4,
    safeZoneLength: 8,
  },
  collectibles: {
    coinDensity: 0.5,
    tokenChance: 0.17,
    powerUpChance: 0.32,
    rewardInterval: 2,
    clusterSize: 6,
  },
  checkpoints: {
    enabled: true,
    interval: 65,
    minDistance: 100,
  },
}
