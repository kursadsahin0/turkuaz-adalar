/**
 * Small deterministic PRNG (mulberry32). Deterministic seeds make level
 * generation reproducible while keeping generation cheap.
 */
export class Rng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1))
  }

  chance(probability: number): boolean {
    return this.next() < probability
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty array.')
    }
    return items[Math.floor(this.next() * items.length)] as T
  }

  shuffled<T>(items: readonly T[]): T[] {
    const result = [...items]
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(this.next() * (index + 1))
      const value = result[index] as T
      result[index] = result[swapIndex] as T
      result[swapIndex] = value
    }
    return result
  }
}

export function createSeed(): number {
  const time = Date.now() >>> 0
  const random = Math.floor(Math.random() * 0xffffffff) >>> 0
  return (time ^ random) >>> 0
}

/** Mixes three integer values into a stable 32-bit seed. */
export function mixSeed(a: number, b: number, c = 0): number {
  let hash = (a ^ 0x9e3779b9) >>> 0
  hash = Math.imul(hash ^ (b + 0x85ebca6b), 0xcc9e2d51) >>> 0
  hash = Math.imul(hash ^ (c + 0xc2b2ae35), 0x1b873593) >>> 0
  return (hash ^ (hash >>> 15)) >>> 0
}
