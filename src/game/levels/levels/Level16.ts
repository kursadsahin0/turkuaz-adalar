import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 16: Mangrove Maze
 * A breather after the Aurora Crown: winding lanes and drifting
 * platforms, fewer hazards per stretch.
 */
export const LEVEL_16: LevelDefinition = {
  id: 'mangrove-maze',
  name: 'Mangrove Maze',
  tagline: 'Weave through the tangled roots.',
  theme: {
    id: 'mangrove',
    name: 'Mangrove Maze',
    skyColor: 0x6a9a6b,
    fogColor: 0x3e6b4a,
    sunPosition: 0.3,
    timeOfDay: 0.4,
  },
  baseSpeed: 16,
  maxSpeed: 28,
  rampDistance: 900,
  targetDistance: 1800,
  unlockCost: 1600,
  completionCoins: 450,
  completionCrystals: 29,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'sliding-obstacle',
      'moving-platform',
      'falling-object',
    ],
    maxDensity: 0.64,
    minObstacleSpacing: 3.4,
    safeZoneLength: 12,
  },
  collectibles: {
    coinDensity: 0.42,
    tokenChance: 0.22,
    powerUpChance: 0.36,
    rewardInterval: 2,
    clusterSize: 8,
  },
  checkpoints: {
    enabled: true,
    interval: 60,
    minDistance: 120,
  },
}
