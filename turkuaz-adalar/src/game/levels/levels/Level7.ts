import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 7: Mint Archipelago
 * Introduces timed gates and complex obstacle combinations.
 */
export const LEVEL_7: LevelDefinition = {
  id: 'mint-archipelago',
  name: 'Mint Archipelago',
  tagline: 'Master the island maze.',
  theme: {
    id: 'archipelago',
    name: 'Mint Archipelago',
    skyColor: 0x00b894,
    fogColor: 0x00cec9,
    sunPosition: 0.5,
    timeOfDay: 0.55,
  },
  baseSpeed: 15,
  maxSpeed: 26,
  rampDistance: 650,
  targetDistance: 1100,
  unlockCost: 500,
  completionCoins: 200,
  completionCrystals: 14,
  minRowsPerSegment: 3,
  maxRowsPerSegment: 4,
  obstacleDensity: 0.7,
  crystalDensity: 0.4,
  platforms: {
    width: 3.5,
    gapRange: [3, 4.5],
    heightVariation: 1.8,
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
    ],
    maxDensity: 0.65,
    minObstacleSpacing: 4,
    threeLane: true,
    safeZoneLength: 8,
  },
  collectibles: {
    coinDensity: 0.5,
    tokenChance: 0.4,
    powerUpChance: 0.2,
    rewardInterval: 2,
    clusterSize: 6,
  },
  checkpoints: {
    enabled: true,
    interval: 65,
    minDistance: 100,
  },
}
