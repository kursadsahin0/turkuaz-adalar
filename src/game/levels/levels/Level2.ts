import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 2: Azure Rapids
 * Introduces moving obstacles and timing challenges.
 */
export const LEVEL_2: LevelDefinition = {
  id: 'azure-rapids',
  name: 'Azure Rapids',
  tagline: 'Navigate the swift currents.',
  theme: {
    id: 'rapids',
    name: 'Azure Rapids',
    skyColor: 0x0ea5e9,
    fogColor: 0x1e90ff,
    sunPosition: 0.4,
    timeOfDay: 0.5,
  },
  baseSpeed: 10,
  maxSpeed: 16,
  rampDistance: 400,
  targetDistance: 600,
  unlockCost: 0,
  completionCoins: 75,
  completionCrystals: 5,
  obstacles: {
    enabledObstacles: ['static-barrier', 'lane-blocker', 'rotating-bar'],
    maxDensity: 0.35,
    minObstacleSpacing: 7,
    safeZoneLength: 25,
  },
  collectibles: {
    coinDensity: 0.75,
    tokenChance: 0.15,
    powerUpChance: 0.3,
    rewardInterval: 4,
    clusterSize: 4,
  },
  checkpoints: {
    enabled: true,
    interval: 90,
    minDistance: 50,
  },
}
