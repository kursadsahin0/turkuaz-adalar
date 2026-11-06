import * as THREE from 'three'

/**
 * Pooled spark burst used for every collection. A single `Points` object owns
 * all particles: emitting rewrites a ring-buffer slot, updating compacts the
 * live particles into the same attribute buffers and adjusts the draw range.
 * No geometry is allocated during a run.
 */
export class CollectionBurstField {
  readonly points: THREE.Points

  private readonly capacity: number
  private readonly geometry: THREE.BufferGeometry
  private readonly material: THREE.PointsMaterial
  private readonly positions: Float32Array
  private readonly colors: Float32Array
  private readonly velocities: Float32Array
  private readonly life: Float32Array
  private readonly maxLife: Float32Array
  private readonly baseColor: Float32Array
  private readonly scratch = new THREE.Color()
  private cursor = 0
  private live = 0
  private disposed = false

  constructor(capacity = 192, qualityMultiplier = 1.0) {
    const adjustedCapacity = Math.floor(capacity * qualityMultiplier)
    this.capacity = Math.max(16, Math.floor(adjustedCapacity))
    this.positions = new Float32Array(this.capacity * 3)
    this.colors = new Float32Array(this.capacity * 3)
    this.velocities = new Float32Array(this.capacity * 3)
    this.life = new Float32Array(this.capacity)
    this.maxLife = new Float32Array(this.capacity)
    this.baseColor = new Float32Array(this.capacity * 3)

    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))
    this.geometry.setDrawRange(0, 0)

    this.material = new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })

    this.points = new THREE.Points(this.geometry, this.material)
    this.points.visible = false
    this.points.name = 'CollectionBurst'
    this.points.frustumCulled = false
  }

  get activeCount(): number {
    return this.live
  }

  emit(
    x: number,
    y: number,
    z: number,
    color: number,
    count = 12,
    speed = 3.2,
    lifetime = 0.55,
  ): void {
    if (this.disposed) {
      return
    }

    this.scratch.setHex(color)
    const total = Math.max(1, Math.min(count, this.capacity))
    for (let index = 0; index < total; index += 1) {
      const slot = this.cursor
      this.cursor = (this.cursor + 1) % this.capacity
      const offset = slot * 3

      // Random direction on a squashed sphere so sparks fan upward and out.
      const theta = Math.random() * Math.PI * 2
      const spread = Math.random()
      const horizontal = speed * (0.35 + spread * 0.65)
      this.positions[offset] = x
      this.positions[offset + 1] = y
      this.positions[offset + 2] = z
      this.velocities[offset] = Math.cos(theta) * horizontal
      this.velocities[offset + 1] = speed * (0.35 + Math.random() * 0.75)
      this.velocities[offset + 2] = Math.sin(theta) * horizontal

      this.baseColor[offset] = this.scratch.r
      this.baseColor[offset + 1] = this.scratch.g
      this.baseColor[offset + 2] = this.scratch.b
      this.colors[offset] = this.scratch.r
      this.colors[offset + 1] = this.scratch.g
      this.colors[offset + 2] = this.scratch.b

      const life = lifetime * (0.7 + Math.random() * 0.6)
      this.life[slot] = life
      this.maxLife[slot] = life
    }
  }

  update(delta: number): void {
    if (this.disposed) {
      return
    }

    let write = 0
    for (let slot = 0; slot < this.capacity; slot += 1) {
      const remaining = this.life[slot] - delta
      this.life[slot] = remaining
      if (remaining <= 0) {
        continue
      }

      const read = slot * 3
      const target = write * 3

      this.velocities[read + 1] -= 9.5 * delta
      this.positions[read] += this.velocities[read] * delta
      this.positions[read + 1] += this.velocities[read + 1] * delta
      this.positions[read + 2] += this.velocities[read + 2] * delta

      const fade = Math.min(1, remaining / Math.max(0.0001, this.maxLife[slot]))
      this.positions[target] = this.positions[read]
      this.positions[target + 1] = this.positions[read + 1]
      this.positions[target + 2] = this.positions[read + 2]
      this.colors[target] = this.baseColor[read] * fade
      this.colors[target + 1] = this.baseColor[read + 1] * fade
      this.colors[target + 2] = this.baseColor[read + 2] * fade
      write += 1
    }

    this.live = write
    this.geometry.setDrawRange(0, write)
    // A 0-count draw call costs a frame slot and logs a WebGL warning on Android.
    this.points.visible = write > 0
    const positionAttribute = this.geometry.getAttribute('position')
    const colorAttribute = this.geometry.getAttribute('color')
    positionAttribute.needsUpdate = true
    colorAttribute.needsUpdate = true
  }

  clear(): void {
    this.life.fill(0)
    this.live = 0
    this.geometry.setDrawRange(0, 0)
    this.points.visible = false
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.points.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }
}
