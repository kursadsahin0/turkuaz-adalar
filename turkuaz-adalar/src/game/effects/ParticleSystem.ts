import * as THREE from 'three'

/**
 * High-performance pooled particle system for game effects.
 * Optimized for mobile with controlled particle counts.
 */
export class ParticleSystem {
  private readonly maxParticles: number
  private readonly geometry: THREE.BufferGeometry
  private readonly material: THREE.PointsMaterial
  private readonly positions: Float32Array
  private readonly velocities: Float32Array
  private readonly colors: Float32Array
  private readonly life: Float32Array
  private readonly sizes: Float32Array
  private readonly scratch = new THREE.Color()
  private cursor = 0
  private disposed = false

  constructor(maxParticles = 256, qualityMultiplier = 1.0) {
    // Adjust particle count based on quality setting
    const adjustedMax = Math.floor(maxParticles * qualityMultiplier)
    this.maxParticles = Math.max(32, Math.floor(adjustedMax))
    this.positions = new Float32Array(this.maxParticles * 3)
    this.velocities = new Float32Array(this.maxParticles * 3)
    this.colors = new Float32Array(this.maxParticles * 3)
    this.life = new Float32Array(this.maxParticles)
    this.sizes = new Float32Array(this.maxParticles)

    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1))
    this.geometry.setDrawRange(0, 0)

    this.material = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      // Normal blending keeps dust readable on the bright white/turquoise deck,
      // where additive particles would wash out to white.
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
    })

    this.points = new THREE.Points(this.geometry, this.material)
    this.points.name = 'ParticleSystem'
    this.points.frustumCulled = false
  }

  readonly points: THREE.Points

  emit(
    x: number,
    y: number,
    z: number,
    color: number,
    count: number,
    options: {
      speed?: number
      lifetime?: number
      size?: number
      spread?: number
      upward?: number
    } = {},
  ): void {
    if (this.disposed) return

    const {
      speed = 2.5,
      lifetime = 0.6,
      size = 0.15,
      spread = 1.0,
      upward = 0.5,
    } = options

    this.scratch.setHex(color)
    const total = Math.min(count, this.maxParticles)

    for (let i = 0; i < total; i++) {
      const slot = this.cursor
      this.cursor = (this.cursor + 1) % this.maxParticles
      const offset = slot * 3

      const theta = Math.random() * Math.PI * 2
      const radius = Math.random() * spread
      const hSpeed = speed * (0.3 + Math.random() * 0.7)

      this.positions[offset] = x
      this.positions[offset + 1] = y
      this.positions[offset + 2] = z
      this.velocities[offset] = Math.cos(theta) * radius * hSpeed
      this.velocities[offset + 1] = speed * upward + Math.random() * speed * 0.5
      this.velocities[offset + 2] = Math.sin(theta) * radius * hSpeed

      this.colors[offset] = this.scratch.r
      this.colors[offset + 1] = this.scratch.g
      this.colors[offset + 2] = this.scratch.b

      this.life[slot] = lifetime * (0.7 + Math.random() * 0.6)
      this.sizes[slot] = size * (0.7 + Math.random() * 0.6)
    }
  }

  emitCone(
    x: number,
    y: number,
    z: number,
    direction: THREE.Vector3,
    color: number,
    count: number,
    options: {
      speed?: number
      lifetime?: number
      size?: number
      spread?: number
    } = {},
  ): void {
    if (this.disposed) return

    const { speed = 3, lifetime = 0.5, size = 0.12, spread = 0.6 } = options
    this.scratch.setHex(color)

    const right = new THREE.Vector3(1, 0, 0)
    const up = new THREE.Vector3(0, 1, 0)
    const forward = direction.clone().normalize()
    right.crossVectors(forward, up).normalize()
    up.crossVectors(right, forward).normalize()

    const total = Math.min(count, this.maxParticles)
    for (let i = 0; i < total; i++) {
      const slot = this.cursor
      this.cursor = (this.cursor + 1) % this.maxParticles
      const offset = slot * 3

      const u = (Math.random() - 0.5) * spread
      const v = (Math.random() - 0.5) * spread
      const w = Math.random()

      const vx = right.x * u + up.x * v + direction.x * w
      const vy = right.y * u + up.y * v + direction.y * w
      const vz = right.z * u + up.z * v + direction.z * w

      this.positions[offset] = x
      this.positions[offset + 1] = y
      this.positions[offset + 2] = z
      this.velocities[offset] = vx * speed
      this.velocities[offset + 1] = vy * speed
      this.velocities[offset + 2] = vz * speed

      this.colors[offset] = this.scratch.r
      this.colors[offset + 1] = this.scratch.g
      this.colors[offset + 2] = this.scratch.b

      this.life[slot] = lifetime * (0.8 + Math.random() * 0.4)
      this.sizes[slot] = size * (0.8 + Math.random() * 0.4)
    }
  }

  update(delta: number): void {
    if (this.disposed) return

    let write = 0
    for (let slot = 0; slot < this.maxParticles; slot++) {
      const remaining = this.life[slot] - delta
      this.life[slot] = remaining
      if (remaining <= 0) continue

      const read = slot * 3
      const target = write * 3

      this.velocities[read + 1] -= 8 * delta
      this.positions[read] += this.velocities[read] * delta
      this.positions[read + 1] += this.velocities[read + 1] * delta
      this.positions[read + 2] += this.velocities[read + 2] * delta

      const fade = Math.min(1, remaining / 0.1)
      this.positions[target] = this.positions[read]
      this.positions[target + 1] = this.positions[read + 1]
      this.positions[target + 2] = this.positions[read + 2]
      this.colors[target] = this.colors[read] * fade
      this.colors[target + 1] = this.colors[read + 1] * fade
      this.colors[target + 2] = this.colors[read + 2] * fade
      this.sizes[write] = this.sizes[slot] * fade
      write++
    }

    this.geometry.setDrawRange(0, write)
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.color.needsUpdate = true
    this.geometry.attributes.size.needsUpdate = true
  }

  clear(): void {
    this.life.fill(0)
    this.geometry.setDrawRange(0, 0)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.points.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }
}
