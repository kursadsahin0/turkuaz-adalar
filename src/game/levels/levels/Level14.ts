import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 14: Volcano Rim
 * The rim of an active volcano: falling embers, spinning bars and
 * timed gates at high speed.
 */
export const LEVEL_14: LevelDefinition = {
  id: 'volcano-rim',
  name: 'Volcano Rim',
  tagline: 'Dash along the edge of the fire.',
  theme: {
    id: 'volcano',
    name: 'Volcano Rim',
    skyColor: 0x7a2e1f,
    fogColor: 0x4a1a12,
    sunPosition: 0.75,
    timeOfDay: 0.85,
  },
  mechanic: 'embers',
  baseSpeed: 18,
  maxSpeed: 32,
  rampDistance: 900,
  targetDistance: 1700,
  unlockCost: 1250,
  completionCoins: 380,
  completionCrystals: 26,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'rotating-bar',
      'moving-block',
      'falling-object',
      'timed-gate',
      'bounce-trap',
    ],
    maxDensity: 0.78,
    minObstacleSpacing: 2.8,
    safeZoneLength: 6,
  },
  collectibles: {
    coinDensity: 0.36,
    tokenChance: 0.21,
    powerUpChance: 0.35,
    rewardInterval: 2,
    clusterSize: 10,
  },
  checkpoints: {
    enabled: true,
    interval: 52,
    minDistance: 130,
  },
}
