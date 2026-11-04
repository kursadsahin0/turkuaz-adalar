import { easeOutCubic, smoothstep } from '../../utils/math.ts'
import type { LevelDefinition } from './LevelDefinition.ts'
import { LEVEL_CATALOG } from './LevelCatalog.ts'

/**
 * Turns a level definition plus travelled distance into live difficulty
 * parameters (speed, obstacle density, crystal density).
 */
export class LevelManager {
  readonly definition: LevelDefinition

  private currentDistance = 0
  private difficultyMultiplier = 1.0

  constructor(definition: LevelDefinition = LEVEL_CATALOG[0]) {
    this.definition = definition
  }

  get distance(): number {
    return this.currentDistance
  }

  get progress(): number {
    return smoothstep(0, this.definition.rampDistance, this.currentDistance)
  }

  get speed(): number {
    const baseSpeed = this.definition.baseSpeed + (this.definition.maxSpeed - this.definition.baseSpeed) * easeOutCubic(this.progress)
    return baseSpeed * this.difficultyMultiplier
  }

  get difficulty(): number {
    return this.progress * this.difficultyMultiplier
  }

  get obstacleDensity(): number {
    return this.definition.obstacles.maxDensity * (0.7 + this.progress * 0.3) * this.difficultyMultiplier
  }

  get crystalDensity(): number {
    return this.definition.collectibles.coinDensity * (1 - this.progress * 0.2) * this.difficultyMultiplier
  }

  get targetDistance(): number {
    return this.definition.targetDistance
  }

  get theme() {
    return this.definition.theme
  }

  get platforms() {
    return this.definition.platforms
  }

  get obstacles() {
    return this.definition.obstacles
  }

  get collectibles() {
    return this.definition.collectibles
  }

  get checkpoints() {
    return this.definition.checkpoints
  }

  reset(difficulty: 'easy' | 'medium' | 'hard' = 'medium'): void {
    this.currentDistance = 0
    switch (difficulty) {
      case 'easy':
        this.difficultyMultiplier = 0.6
        break
      case 'medium':
        this.difficultyMultiplier = 1.0
        break
      case 'hard':
        this.difficultyMultiplier = 5.0
        break
    }
  }

  update(distance: number): void {
    this.currentDistance = Math.max(0, distance)
  }

  difficultyForDistance(distance: number): number {
    return smoothstep(0, this.definition.rampDistance, Math.max(0, distance)) * this.difficultyMultiplier
  }
}
