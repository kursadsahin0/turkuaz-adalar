/**
 * A level is pure data. Runtime can introduce new chapters by appending
 * definitions to the catalogue without touching gameplay systems.
 */
export interface LevelDefinition {
  id: string
  name: string
  tagline: string
  /** Visual theme for the level (environment colors, lighting, etc.) */
  theme: LevelTheme
  /** A rule that only this island plays by (ice, wind, ember rain). */
  mechanic?: IslandMechanic
  /** A tidal wave chases the runner (the last island of each chapter). */
  chase?: boolean
  /** Set on the weekly event island: the regular island it is based on. */
  eventOf?: string
  baseSpeed: number
  maxSpeed: number
  /** Distance in metres over which difficulty reaches its maximum. */
  rampDistance: number
  /** Target distance to complete the level (in metres). */
  targetDistance: number
  /** Required coins to unlock the level (0 for first level). */
  unlockCost: number
  /** Required coins to complete the level. */
  completionCoins: number
  /** Minimum crystals to complete the level. */
  completionCrystals: number
  /** Obstacle placement rules for this level. */
  obstacles: LevelObstacleConfig
  /** Collectible placement rules for this level. */
  collectibles: LevelCollectibleConfig
  /** Checkpoint configuration for this level. */
  checkpoints: LevelCheckpointConfig
}

/**
 * - ice: lane changes are slow and slippery.
 * - wind: telegraphed gusts push the runner one lane (only into a clear lane).
 * - embers: falling hazards are far more common.
 */
export type IslandMechanic = 'ice' | 'wind' | 'embers'

export interface LevelTheme {
  id: string
  name: string
  /** Primary sky color */
  skyColor: number
  /** Ocean/fog color */
  fogColor: number
  /** Sun/moon position (0-1 along horizon) */
  sunPosition: number
  /** Time of day (0=dawn, 0.5=noon, 1=dusk) */
  timeOfDay: number
}

export interface LevelObstacleConfig {
  /** Which obstacles are enabled in this level. */
  enabledObstacles: string[]
  /** Maximum obstacle density (0-1). */
  maxDensity: number
  /** Minimum distance between obstacles in metres. */
  minObstacleSpacing: number
  /** Safe zone at the start in metres. */
  safeZoneLength: number
}

export interface LevelCollectibleConfig {
  /** Coin trail density (0-1). */
  coinDensity: number
  /** Token spawn chance (0-1). */
  tokenChance: number
  /** Power-up spawn chance (0-1). */
  powerUpChance: number
  /** Reward cache spawn interval (in segments). */
  rewardInterval: number
  /** Collectible clustering (group size). */
  clusterSize: number
}

export interface LevelCheckpointConfig {
  /** Whether checkpoints are enabled. */
  enabled: boolean
  /** Distance between checkpoints in metres. */
  interval: number
  /** Minimum distance before first checkpoint. */
  minDistance: number
}
