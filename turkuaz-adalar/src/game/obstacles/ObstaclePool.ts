import { GAME_CONFIG } from '../../config/GameConfig.ts'
import type { Obstacle } from './Obstacle.ts'

/**
 * Small generic pool used by the obstacle manager. Acquired instances keep
 * their Rapier body/collider; releasing only disables and detaches them. This
 * avoids body churn while the streamer recycles islands.
 */
export class ObstaclePool {
  private readonly factory: () => Obstacle
  private readonly free: Obstacle[] = []
  private readonly all = new Set<Obstacle>()
  private readonly maxIdle: number

  constructor(factory: () => Obstacle) {
    this.factory = factory
    this.maxIdle = GAME_CONFIG.obstacles.pool.maxIdle
    const prewarm = GAME_CONFIG.obstacles.pool.prewarm
    for (let index = 0; index < prewarm; index += 1) {
      const obstacle = this.factory()
      this.all.add(obstacle)
      this.free.push(obstacle)
    }
  }

  acquire(): Obstacle {
    const pooled = this.free.pop()
    if (pooled) {
      return pooled
    }
    const obstacle = this.factory()
    this.all.add(obstacle)
    return obstacle
  }

  release(obstacle: Obstacle): void {
    obstacle.release()
    if (this.free.length >= this.maxIdle) {
      this.all.delete(obstacle)
      obstacle.dispose()
      return
    }
    this.free.push(obstacle)
  }

  get idleCount(): number {
    return this.free.length
  }

  get size(): number {
    return this.all.size
  }

  dispose(): void {
    for (const obstacle of this.all) {
      obstacle.dispose()
    }
    this.all.clear()
    this.free.length = 0
  }
}
