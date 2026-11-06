import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 29: Obsidian Spire
 * The penultimate island: almost every hazard at top speed.
 */
export const LEVEL_29: LevelDefinition = {
  id: 'obsidian-spire',
  name: 'Obsidian Spire',
  tagline: 'Climb the black glass tower.',
  theme: {
    id: 'obsidian',
    name: 'Obsidian Spire',
    skyColor: 0x2a2a35,
    fogColor: 0x15151d,
    sunPosition: 0.6,
    timeOfDay: 0.75,
  },
  baseSpeed: 18.4,
  maxSpeed: 33.7,
  rampDistance: 1178,
  targetDistance: 3100,
  unlockCost: 3550,
  completionCoins: 775,
  completionCrystals: 42,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'rotating-bar',
      'sliding-obstacle',
      'moving-block',
      'falling-object',
      'timed-gate',
      'bounce-trap',
    ],
    maxDensity: 0.83,
    minObstacleSpacing: 2.5,
    safeZoneLength: 4,
  },
  collectibles: {
    coinDensity: 0.35,
    tokenChance: 0.29,
    powerUpChance: 0.42,
    rewardInterval: 2,
    clusterSize: 10,
  },
  checkpoints: {
    enabled: true,
    interval: 48,
    minDistance: 157,
  },
}
