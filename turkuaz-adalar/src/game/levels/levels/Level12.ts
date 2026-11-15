import type { LevelDefinition } from '../LevelDefinition.ts'

/**
 * Level 12: Storm Reef
 * A reef in a thunderstorm: swinging bars, sliding walls and bounce
 * traps keep the runner moving sideways and up.
 */
export const LEVEL_12: LevelDefinition = {
  id: 'storm-reef',
  name: 'Storm Reef',
  tagline: 'Ride the lightning over the reef.',
  theme: {
    id: 'storm',
    name: 'Storm Reef',
    skyColor: 0x5d6d7e,
    fogColor: 0x34495e,
    sunPosition: 0.6,
    timeOfDay: 0.62,
  },
  mechanic: 'wind',
  baseSpeed: 17,
  maxSpeed: 30,
  rampDistance: 820,
  targetDistance: 1500,
  unlockCost: 1000,
  completionCoins: 330,
  completionCrystals: 22,
  obstacles: {
    enabledObstacles: [
      'static-barrier',
      'lane-blocker',
      'rotating-bar',
      'sliding-obstacle',
      'moving-block',
      'bounce-trap',
    ],
    maxDensity: 0.74,
    minObstacleSpacing: 3.2,
    safeZoneLength: 10,
  },
  collectibles: {
    coinDensity: 0.4,
    tokenChance: 0.2,
    powerUpChance: 0.35,
    rewardInterval: 2,
    clusterSize: 8,
  },
  checkpoints: {
    enabled: true,
    interval: 58,
    minDistance: 120,
  },
}
