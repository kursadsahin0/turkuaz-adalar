import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 11: Sunken Ruins
 * Ancient ruins rising from the lagoon: falling stones, drifting
 * platforms and old gates. Introduces moving platforms.
 */
export const LEVEL_11: LevelDefinition = {
  id: 'sunken-ruins',
  name: 'Sunken Ruins',
  tagline: 'Outrun the crumbling columns.',
  theme: {
    id: 'ruins',
    name: 'Sunken Ruins',
    skyColor: 0x4a7c7e,
    fogColor: 0x2f5d62,
    sunPosition: 0.35,
    timeOfDay: 0.55,
  },
  baseSpeed: 16,
  maxSpeed: 28,
  rampDistance: 800,
  targetDistance: 1400,
  unlockCost: 900,
  completionCoins: 310,
  completionCrystals: 21,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'falling-object',
      'moving-platform',
      'timed-gate',
    ],
    maxDensity: 0.7,
    minObstacleSpacing: 3.5,
    safeZoneLength: 12,
  },
  collectibles: {
    coinDensity: 0.42,
    tokenChance: 0.2,
    powerUpChance: 0.34,
    rewardInterval: 2,
    clusterSize: 8,
  },
  checkpoints: {
    enabled: true,
    interval: 60,
    minDistance: 120,
  },
}
