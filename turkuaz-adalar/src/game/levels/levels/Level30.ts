import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 30: Turquoise Throne
 * The grand finale back in turquoise waters: every obstacle over
 * the longest course in the game.
 */
export const LEVEL_30: LevelDefinition = {
  id: 'turkuaz-throne',
  name: 'Turquoise Throne',
  tagline: 'Claim the throne of the islands.',
  theme: {
    id: 'throne',
    name: 'Turquoise Throne',
    skyColor: 0x2ab8b0,
    fogColor: 0x138a85,
    sunPosition: 0.5,
    timeOfDay: 0.5,
  },
  chase: true,
  baseSpeed: 18.5,
  maxSpeed: 34,
  rampDistance: 1200,
  targetDistance: 3500,
  unlockCost: 4000,
  completionCoins: 900,
  completionCrystals: 45,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'rotating-bar',
      'sliding-obstacle',
      'moving-block',
      'disappearing-platform',
      'moving-platform',
      'falling-object',
      'timed-gate',
      'bounce-trap',
    ],
    maxDensity: 0.84,
    minObstacleSpacing: 2.4,
    safeZoneLength: 4,
  },
  collectibles: {
    coinDensity: 0.34,
    tokenChance: 0.3,
    powerUpChance: 0.42,
    rewardInterval: 2,
    clusterSize: 11,
  },
  checkpoints: {
    enabled: true,
    interval: 48,
    minDistance: 160,
  },
}
