import { GAME_CONFIG } from '../../config/GameConfig.ts'
import { PALETTE } from '../../config/Palette.ts'

/** Every pickup the streaming track can place. */
export type CollectibleKind =
  'coin' | 'token' | 'shield' | 'magnet' | 'speed' | 'doubleJump' | 'glide' | 'slowMo' | 'reward'

/** Power-ups that apply a timed modifier to the run. */
export type PowerUpKind = 'shield' | 'magnet' | 'speed' | 'doubleJump' | 'glide' | 'slowMo'

export const COLLECTIBLE_KINDS: readonly CollectibleKind[] = [
  'coin',
  'token',
  'shield',
  'magnet',
  'speed',
  'doubleJump',
  'glide',
  'slowMo',
  'reward',
]

export const POWER_UP_KINDS: readonly PowerUpKind[] = [
  'shield',
  'magnet',
  'speed',
  'doubleJump',
  'glide',
  'slowMo',
]

export function isPowerUpKind(kind: CollectibleKind): kind is PowerUpKind {
  return (POWER_UP_KINDS as readonly string[]).includes(kind)
}

export interface CollectibleDefinition {
  readonly kind: CollectibleKind
  readonly label: string
  /** Wallet reward on pickup. */
  readonly coins: number
  /** Score reward on pickup, independent of the wallet. */
  readonly score: number
  /** Power-up granted by this pickup, if any. */
  readonly powerUp: PowerUpKind | null
  readonly color: number
  readonly accent: number
  /** Relative idle spin speed, in radians per second. */
  readonly spin: number
}

const collectibleConfig = GAME_CONFIG.collectibles
const powerUpConfig = GAME_CONFIG.powerUps

/**
 * Single source of truth for pickup behaviour. Prefabs, spawning, HUD feedback
 * and audio all read this table, so a new pickup only needs one entry here plus
 * one prefab branch.
 */
export const COLLECTIBLE_DEFINITIONS: Readonly<Record<CollectibleKind, CollectibleDefinition>> = {
  coin: {
    kind: 'coin',
    label: collectibleConfig.coins.label,
    coins: collectibleConfig.coins.value,
    score: collectibleConfig.coins.scoreValue,
    powerUp: null,
    color: PALETTE.coin,
    accent: PALETTE.coinLight,
    spin: 3.4,
  },
  token: {
    kind: 'token',
    label: collectibleConfig.tokens.label,
    coins: collectibleConfig.tokens.value,
    score: collectibleConfig.tokens.scoreValue,
    powerUp: null,
    color: PALETTE.crystal,
    accent: PALETTE.crystalCore,
    spin: 1.7,
  },
  shield: {
    kind: 'shield',
    label: powerUpConfig.shield.label,
    coins: 0,
    score: collectibleConfig.powerUps.scoreValue,
    powerUp: 'shield',
    color: PALETTE.powerShield,
    accent: PALETTE.crystal,
    spin: 1.2,
  },
  magnet: {
    kind: 'magnet',
    label: powerUpConfig.magnet.label,
    coins: 0,
    score: collectibleConfig.powerUps.scoreValue,
    powerUp: 'magnet',
    color: PALETTE.powerMagnet,
    accent: PALETTE.coinLight,
    spin: 1.4,
  },
  speed: {
    kind: 'speed',
    label: powerUpConfig.speed.label,
    coins: 0,
    score: collectibleConfig.powerUps.scoreValue,
    powerUp: 'speed',
    color: PALETTE.powerSpeed,
    accent: PALETTE.coin,
    spin: 2.2,
  },
  doubleJump: {
    kind: 'doubleJump',
    label: powerUpConfig.doubleJump.label,
    coins: 0,
    score: collectibleConfig.powerUps.scoreValue,
    powerUp: 'doubleJump',
    color: PALETTE.powerDoubleJump,
    accent: PALETTE.crystal,
    spin: 1.6,
  },
  glide: {
    kind: 'glide',
    label: powerUpConfig.glide.label,
    coins: 0,
    score: collectibleConfig.powerUps.scoreValue,
    powerUp: 'glide',
    color: PALETTE.powerGlide,
    accent: PALETTE.crystal,
    spin: 1.3,
  },
  slowMo: {
    kind: 'slowMo',
    label: powerUpConfig.slowMo.label,
    coins: 0,
    score: collectibleConfig.powerUps.scoreValue,
    powerUp: 'slowMo',
    color: PALETTE.powerSlowMo,
    accent: PALETTE.coinLight,
    spin: 0.9,
  },
  reward: {
    kind: 'reward',
    label: collectibleConfig.rewards.label,
    coins: collectibleConfig.rewards.value,
    score: collectibleConfig.rewards.scoreValue,
    powerUp: null,
    color: PALETTE.reward,
    accent: PALETTE.coinLight,
    spin: 0.8,
  },
}

/** A pickup that has just been touched. Emitted once per instance. */
export interface CollectiblePickup {
  readonly kind: CollectibleKind
  readonly label: string
  readonly coins: number
  readonly score: number
  readonly powerUp: PowerUpKind | null
  readonly x: number
  readonly y: number
  readonly z: number
  readonly color: number
}
