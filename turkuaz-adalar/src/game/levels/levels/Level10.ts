import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 10: Void Walker
 * Master level with all obstacles at maximum difficulty.
 */
export const LEVEL_10: LevelDefinition = {
  id: 'void-walker',
  name: 'Void Walker',
  tagline: 'Conquer the infinite abyss.',
  theme: {
    id: 'void',
    name: 'Void Walker',
    skyColor: 0x1a1a2e,
    fogColor: 0x16213e,
    sunPosition: 0.5,
    timeOfDay: 0.1,
  },
  chase: true,
  baseSpeed: 18,
  maxSpeed: 32,
  rampDistance: 800,
  targetDistance: 1500,
  unlockCost: 800,
  completionCoins: 300,
  completionCrystals: 20,
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
      'bounce-trap',
    ],
    maxDensity: 0.8,
    minObstacleSpacing: 2.5,
    safeZoneLength: 3,
  },
  collectibles: {
    coinDensity: 0.35,
    tokenChance: 0.19,
    powerUpChance: 0.34,
    rewardInterval: 2,
    clusterSize: 10,
  },
  checkpoints: {
    enabled: true,
    interval: 50,
    minDistance: 130,
  },
}
