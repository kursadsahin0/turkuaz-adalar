import { GAME_CONFIG } from '../../config/GameConfig.ts'

export type MovementEffectKind = keyof typeof GAME_CONFIG.effects

export interface MovementEffectDefinition {
  readonly label: string
  readonly duration: number
  readonly speedMultiplier: number
  readonly gravityScale: number
  readonly jumpScale: number
  readonly laneControl: number
  readonly invulnerable: boolean
}

export interface ActiveMovementEffect {
  readonly kind: string
  readonly label: string
  readonly remaining: number
  readonly duration: number
}

/**
 * Small, data-driven bundle of temporary movement modifiers.
 *
 * Effects never move the player themselves. They expose multipliers that
 * `Game`/`Player` read during a fixed step, which keeps every rule in the
 * existing controller and makes the system trivial to test in isolation.
 */
export class MovementEffects {
  private readonly definitions: Readonly<Record<string, MovementEffectDefinition>>
  private readonly timers = new Map<string, number>()

  constructor(
    definitions: Readonly<Record<string, MovementEffectDefinition>> = GAME_CONFIG.effects,
  ) {
    this.definitions = definitions
  }

  apply(kind: MovementEffectKind | string): boolean {
    const definition = this.definitions[kind]
    if (!definition || definition.duration <= 0) {
      return false
    }
    this.timers.delete(kind)
    this.timers.set(kind, definition.duration)
    return true
  }

  update(delta: number): void {
    if (delta <= 0) {
      return
    }
    for (const [kind, remaining] of [...this.timers.entries()]) {
      const next = remaining - delta
      if (next <= 0) {
        this.timers.delete(kind)
      } else {
        this.timers.set(kind, next)
      }
    }
  }

  isActive(kind: MovementEffectKind | string): boolean {
    return (this.timers.get(kind) ?? 0) > 0
  }

  get active(): readonly ActiveMovementEffect[] {
    const result: ActiveMovementEffect[] = []
    for (const [kind, remaining] of this.timers) {
      const definition = this.definitions[kind]
      if (!definition) {
        continue
      }
      result.push({
        kind,
        label: definition.label,
        remaining,
        duration: definition.duration,
      })
    }
    return result
  }

  get primary(): ActiveMovementEffect | null {
    return this.active[0] ?? null
  }

  get speedMultiplier(): number {
    return this.product('speedMultiplier')
  }

  get gravityScale(): number {
    return this.product('gravityScale')
  }

  get jumpScale(): number {
    return this.product('jumpScale')
  }

  get laneControl(): number {
    return this.product('laneControl')
  }

  get invulnerable(): boolean {
    for (const kind of this.timers.keys()) {
      if (this.definitions[kind]?.invulnerable) {
        return true
      }
    }
    return false
  }

  reset(): void {
    this.timers.clear()
  }

  private product(field: keyof MovementEffectDefinition): number {
    let value = 1
    for (const kind of this.timers.keys()) {
      const definition = this.definitions[kind]
      const factor = definition?.[field]
      if (typeof factor === 'number') {
        value *= factor
      }
    }
    return value
  }
}
