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
  minRowsPerSegment: 3,
  maxRowsPerSegment: 4,
  obstacleDensity: 0.75,
  crystalDensity: 0.35,
  platforms: {
    width: 3,
    gapRange: [3.5, 5],
    heightVariation: 2.0,
    segmentLength: 30,
    floating: true,
  },
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
    threeLane: true,
    safeZoneLength: 6,
  },
  collectibles: {
    coinDensity: 0.45,
    tokenChance: 0.45,
    powerUpChance: 0.22,
    rewardInterval: 2,
    clusterSize: 7,
  },
  checkpoints: {
    enabled: true,
    interval: 60,
    minDistance: 110,
  },
}
