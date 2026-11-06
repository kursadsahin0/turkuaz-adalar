import { easeOutCubic, smoothstep } from '../../utils/math.ts'
import type { LevelDefinition } from './LevelDefinition.ts'
import { LEVEL_CATALOG } from './LevelCatalog.ts'
import { DEFAULT_SPAWN_RULES, spawnRulesFor, type SpawnRules } from './SpawnRules.ts'

/**
 * Turns a level definition plus travelled distance into live difficulty
 * parameters (speed, obstacle density, crystal density).
 */
export class LevelManager {
  private current: LevelDefinition
  /** Endless runs use the first level's pacing with no finish line. */
  private endless = true
  private currentDistance = 0
  private difficultyMultiplier = 1.0

  constructor(definition: LevelDefinition = LEVEL_CATALOG[0]) {
    this.current = definition
  }

  get definition(): LevelDefinition {
    return this.current
  }

  get isEndless(): boolean {
    return this.endless
  }

  /** Selects a catalogue level, or `null` for the endless run. */
  setLevel(level: LevelDefinition | null): void {
    this.endless = level === null
    this.current = level ?? LEVEL_CATALOG[0]
  }

  /** Spawning rules for this run (the island's, or the endless defaults). */
  get spawnRules(): SpawnRules {
    return this.endless ? DEFAULT_SPAWN_RULES : spawnRulesFor(this.current)
  }

  /** Obstacle kinds this run may spawn; `null` allows every kind. */
  get allowedObstacles(): readonly string[] | null {
    return this.endless ? null : this.current.obstacles.enabledObstacles
  }

  /** 0..1 progress toward the finish line (levels only). */
  get completion(): number {
    return this.endless ? 0 : Math.min(1, this.currentDistance / this.current.targetDistance)
  }

  get reachedTarget(): boolean {
    return !this.endless && this.currentDistance >= this.current.targetDistance
  }

  get distance(): number {
    return this.currentDistance
  }

  get progress(): number {
    return smoothstep(0, this.definition.rampDistance, this.currentDistance)
  }

  get speed(): number {
    const baseSpeed =
      this.definition.baseSpeed +
      (this.definition.maxSpeed - this.definition.baseSpeed) * easeOutCubic(this.progress)
    return baseSpeed * this.difficultyMultiplier
  }

  get difficulty(): number {
    return this.progress * this.difficultyMultiplier
  }

  get obstacleDensity(): number {
    return (
      this.definition.obstacles.maxDensity * (0.7 + this.progress * 0.3) * this.difficultyMultiplier
    )
  }

  get crystalDensity(): number {
    return (
      this.definition.collectibles.coinDensity *
      (1 - this.progress * 0.2) *
      this.difficultyMultiplier
    )
  }

  get targetDistance(): number {
    return this.definition.targetDistance
  }

  get theme() {
    return this.definition.theme
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
        // Was 5.0, which made speed and obstacle density five times higher
        // and the game effectively unplayable.
        this.difficultyMultiplier = 1.3
        break
    }
  }

  update(distance: number): void {
    this.currentDistance = Math.max(0, distance)
  }

  /** Run speed when the runner reaches `distance` (for spawning ahead of it). */
  speedForDistance(distance: number): number {
    const progress = smoothstep(0, this.definition.rampDistance, Math.max(0, distance))
    const base =
      this.definition.baseSpeed +
      (this.definition.maxSpeed - this.definition.baseSpeed) * easeOutCubic(progress)
    return base * this.difficultyMultiplier
  }

  difficultyForDistance(distance: number): number {
    return (
      smoothstep(0, this.definition.rampDistance, Math.max(0, distance)) * this.difficultyMultiplier
    )
  }
}
