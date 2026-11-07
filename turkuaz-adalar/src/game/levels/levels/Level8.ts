import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 8: Laventa Twilight
 * High-speed level with bounce traps and moving platforms.
 */
export const LEVEL_8: LevelDefinition = {
  id: 'laventa-twilight',
  name: 'Laventa Twilight',
  tagline: 'Dash through the purple dusk.',
  theme: {
    id: 'twilight',
    name: 'Laventa Twilight',
    skyColor: 0x6c5ce7,
    fogColor: 0x5b4cdb,
    sunPosition: 0.9,
    timeOfDay: 0.9,
  },
  baseSpeed: 16,
  maxSpeed: 28,
  rampDistance: 700,
  targetDistance: 1200,
  unlockCost: 600,
  completionCoins: 225,
  completionCrystals: 16,
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
    maxDensity: 0.7,
    minObstacleSpacing: 3.5,
    safeZoneLength: 6,
  },
  collectibles: {
    coinDensity: 0.45,
    tokenChance: 0.18,
    powerUpChance: 0.33,
    rewardInterval: 2,
    clusterSize: 7,
  },
  checkpoints: {
    enabled: true,
    interval: 60,
    minDistance: 110,
  },
}
