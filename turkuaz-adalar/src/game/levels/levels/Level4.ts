import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 4: Crystal Peaks
 * Introduces moving platforms and precision jumping.
 */
export const LEVEL_4: LevelDefinition = {
  id: 'crystal-peaks',
  name: 'Crystal Peaks',
  tagline: 'Scale the glimmering heights.',
  theme: {
    id: 'peaks',
    name: 'Crystal Peaks',
    skyColor: 0x9b59b6,
    fogColor: 0x7e57c2,
    sunPosition: 0.7,
    timeOfDay: 0.35,
  },
  baseSpeed: 12,
  maxSpeed: 20,
  rampDistance: 500,
  targetDistance: 800,
  unlockCost: 200,
  completionCoins: 125,
  completionCrystals: 9,
  minRowsPerSegment: 2,
  maxRowsPerSegment: 3,
  obstacleDensity: 0.55,
  crystalDensity: 0.55,
  platforms: {
    width: 5,
    gapRange: [2, 3],
    heightVariation: 1.0,
    segmentLength: 30,
    floating: true,
  },
  obstacles: {
    enabledObstacles: ['static-barrier', 'lane-blocker', 'rotating-bar', 'sliding-obstacle', 'moving-block'],
    maxDensity: 0.5,
    minObstacleSpacing: 5.5,
    threeLane: true,
    safeZoneLength: 15,
  },
  collectibles: {
    coinDensity: 0.65,
    tokenChance: 0.25,
    powerUpChance: 0.12,
    rewardInterval: 3,
    clusterSize: 5,
  },
  checkpoints: {
    enabled: true,
    interval: 80,
    minDistance: 70,
  },
}
