import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 1: Turkuaz Shallows
 * Beginner level with gentle introduction to mechanics.
 */
export const LEVEL_1: LevelDefinition = {
  id: 'turkuaz-shallows',
  name: 'Turkuaz Shallows',
  tagline: 'Skim the emerald tide.',
  theme: {
    id: 'shallows',
    name: 'Emerald Tide',
    skyColor: 0x4ade80,
    fogColor: 0x2d7a4e,
    sunPosition: 0.2,
    timeOfDay: 0.3,
  },
  baseSpeed: 9.5,
  maxSpeed: 14,
  rampDistance: 300,
  targetDistance: 500,
  unlockCost: 0,
  completionCoins: 50,
  completionCrystals: 3,
  obstacles: {
    enabledObstacles: ['static-barrier', 'lane-blocker'],
    maxDensity: 0.25,
    minObstacleSpacing: 8,
    safeZoneLength: 30,
  },
  collectibles: {
    coinDensity: 0.8,
    tokenChance: 0.14,
    powerUpChance: 0.3,
    rewardInterval: 5,
    clusterSize: 3,
  },
  checkpoints: {
    enabled: true,
    interval: 100,
    minDistance: 40,
  },
}
