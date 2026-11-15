import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 26: Starfall Reef
 * Shooting stars rain onto a night reef; many falling objects.
 */
export const LEVEL_26: LevelDefinition = {
  id: 'starfall-reef',
  name: 'Starfall Reef',
  tagline: 'Dodge the shooting stars.',
  theme: {
    id: 'starfall',
    name: 'Starfall Reef',
    skyColor: 0x141a40,
    fogColor: 0x0e1230,
    sunPosition: 0.5,
    timeOfDay: 0.03,
  },
  baseSpeed: 18.1,
  maxSpeed: 32.9,
  rampDistance: 1114,
  targetDistance: 2800,
  unlockCost: 3100,
  completionCoins: 700,
  completionCrystals: 39,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'falling-object',
      'rotating-bar',
      'disappearing-platform',
      'moving-platform',
      'bounce-trap',
    ],
    maxDensity: 0.81,
    minObstacleSpacing: 2.7,
    safeZoneLength: 6,
  },
  collectibles: {
    coinDensity: 0.36,
    tokenChance: 0.28,
    powerUpChance: 0.4,
    rewardInterval: 2,
    clusterSize: 10,
  },
  checkpoints: {
    enabled: true,
    interval: 51,
    minDistance: 148,
  },
}
