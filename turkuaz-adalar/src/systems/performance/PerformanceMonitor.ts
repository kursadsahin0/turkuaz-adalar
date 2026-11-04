/**
 * Performance monitoring system for tracking FPS and memory usage.
 * Helps identify performance bottlenecks during gameplay.
 */

export interface PerformanceMetrics {
  fps: number
  frameTime: number
  memoryUsed: number
  memoryTotal: number
  memoryLimit: number
  memoryFraction: number
}

export class PerformanceMonitor {
  private fps = 0
  private frameTime = 0
  private frameCount = 0
  private lastTime = performance.now()
  private lastFpsUpdate = performance.now()
  private updateInterval = 1000 // Update FPS every second
  private disposed = false

  private metrics: PerformanceMetrics = {
    fps: 0,
    frameTime: 0,
    memoryUsed: 0,
    memoryTotal: 0,
    memoryLimit: 0,
    memoryFraction: 0,
  }

  constructor() {
    this.startMonitoring()
  }

  tick(): void {
    if (this.disposed) return

    const now = performance.now()
    const delta = now - this.lastTime
    this.lastTime = now
    this.frameTime = delta
    this.frameCount++

    // Update FPS every second
    if (now - this.lastFpsUpdate >= this.updateInterval) {
      this.fps = (this.frameCount * 1000) / (now - this.lastFpsUpdate)
      this.frameCount = 0
      this.lastFpsUpdate = now
      this.updateMemoryMetrics()
    }
  }

  getMetrics(): PerformanceMetrics {
    return {
      fps: this.fps,
      frameTime: this.frameTime,
      memoryUsed: this.metrics.memoryUsed,
      memoryTotal: this.metrics.memoryTotal,
      memoryLimit: this.metrics.memoryLimit,
      memoryFraction: this.metrics.memoryFraction,
    }
  }

  getFPS(): number {
    return this.fps
  }

  getFrameTime(): number {
    return this.frameTime
  }

  private updateMemoryMetrics(): void {
    if ((performance as any).memory) {
      const memory = (performance as any).memory
      this.metrics.memoryUsed = memory.usedJSHeapSize / (1024 * 1024) // MB
      this.metrics.memoryTotal = memory.totalJSHeapSize / (1024 * 1024) // MB
      this.metrics.memoryLimit = memory.jsHeapSizeLimit / (1024 * 1024) // MB
      this.metrics.memoryFraction = memory.usedJSHeapSize / memory.jsHeapSizeLimit
    }
  }

  private startMonitoring(): void {
    this.lastTime = performance.now()
    this.lastFpsUpdate = performance.now()
  }

  dispose(): void {
    this.disposed = true
  }

  reset(): void {
    this.fps = 0
    this.frameTime = 0
    this.frameCount = 0
    this.lastTime = performance.now()
    this.lastFpsUpdate = performance.now()
  }
}
