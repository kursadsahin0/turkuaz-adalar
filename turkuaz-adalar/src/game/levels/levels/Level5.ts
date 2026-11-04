import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 5: Amber Horizon
 * Introduces disappearing platforms and timing hazards.
 */
export const LEVEL_5: LevelDefinition = {
  id: 'amber-horizon',
  name: 'Amber Horizon',
  tagline: 'Race the setting sun.',
  theme: {
    id: 'horizon',
    name: 'Amber Horizon',
    skyColor: 0xffa726,
    fogColor: 0xff7043,
    sunPosition: 0.8,
    timeOfDay: 0.85,
  },
  baseSpeed: 13,
  maxSpeed: 22,
  rampDistance: 550,
  targetDistance: 900,
  unlockCost: 300,
  completionCoins: 150,
  completionCrystals: 10,
  minRowsPerSegment: 2,
  maxRowsPerSegment: 4,
  obstacleDensity: 0.6,
  crystalDensity: 0.5,
  platforms: {
    width: 4.5,
    gapRange: [2, 3.5],
    heightVariation: 1.2,
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
    ],
    maxDensity: 0.55,
    minObstacleSpacing: 5,
    threeLane: true,
    safeZoneLength: 12,
  },
  collectibles: {
    coinDensity: 0.6,
    tokenChance: 0.3,
    powerUpChance: 0.15,
    rewardInterval: 3,
    clusterSize: 5,
  },
  checkpoints: {
    enabled: true,
    interval: 75,
    minDistance: 80,
  },
}
