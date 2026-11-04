import * as THREE from 'three'
import { PALETTE } from '../../config/Palette.ts'

/**
 * Shared GPU resources for streaming track interactions. Spawning only creates
 * meshes; geometry and materials live for the lifetime of the world.
 */
export class InteractionAssets {
  readonly padMaterial: THREE.MeshStandardMaterial
  readonly speedMaterial: THREE.MeshStandardMaterial
  readonly ringMaterial: THREE.MeshBasicMaterial
  readonly platformMaterial: THREE.MeshStandardMaterial
  readonly platformTrimMaterial: THREE.MeshStandardMaterial
  readonly checkpointMaterial: THREE.MeshStandardMaterial

  private readonly padGeometry: THREE.CylinderGeometry
  private readonly ringGeometry: THREE.TorusGeometry
  private readonly speedArrowGeometry: THREE.ConeGeometry
  private readonly platformGeometry: THREE.BoxGeometry
  private readonly platformTrimGeometry: THREE.BoxGeometry
  private readonly postGeometry: THREE.CylinderGeometry
  private readonly checkpointRingGeometry: THREE.TorusGeometry
  private readonly beaconGeometry: THREE.ConeGeometry
  private readonly baseGeometry: THREE.CylinderGeometry
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []

  constructor() {
    this.padGeometry = this.trackGeometry(new THREE.CylinderGeometry(0.72, 0.8, 0.14, 16))
    this.ringGeometry = this.trackGeometry(new THREE.TorusGeometry(0.68, 0.028, 8, 24))
    this.speedArrowGeometry = this.trackGeometry(new THREE.ConeGeometry(0.18, 0.42, 3))
    this.padMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.playerGlow,
        emissive: PALETTE.playerGlow,
        emissiveIntensity: 0.46,
        roughness: 0.32,
        metalness: 0.18,
        transparent: true,
        opacity: 0.92,
      }),
    )
    this.speedMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.mechanismYellow,
        emissive: PALETTE.mechanismYellow,
        emissiveIntensity: 0.52,
        roughness: 0.28,
        metalness: 0.16,
        transparent: true,
        opacity: 0.94,
      }),
    )
    this.ringMaterial = this.trackMaterial(
      new THREE.MeshBasicMaterial({
        color: PALETTE.playerGlow,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )

    this.platformGeometry = this.trackGeometry(new THREE.BoxGeometry(2.3, 0.32, 2.4))
    this.platformTrimGeometry = this.trackGeometry(new THREE.BoxGeometry(2.34, 0.08, 0.16))
    this.postGeometry = this.trackGeometry(new THREE.CylinderGeometry(0.12, 0.14, 0.8, 8))
    this.platformMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.platformTurquoise,
        emissive: PALETTE.playerDeep,
        emissiveIntensity: 0.14,
        roughness: 0.42,
        metalness: 0.12,
      }),
    )
    this.platformTrimMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.mechanismYellow,
        roughness: 0.4,
        metalness: 0.1,
      }),
    )

    this.checkpointRingGeometry = this.trackGeometry(new THREE.TorusGeometry(0.34, 0.026, 8, 20))
    this.beaconGeometry = this.trackGeometry(new THREE.ConeGeometry(0.24, 0.7, 6))
    this.baseGeometry = this.trackGeometry(new THREE.CylinderGeometry(0.32, 0.38, 0.16, 12))
    this.checkpointMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.crystal,
        emissive: PALETTE.crystalCore,
        emissiveIntensity: 0.72,
        roughness: 0.22,
        metalness: 0.28,
      }),
    )
  }

  createBounce(): { group: THREE.Group; spin: THREE.Object3D } {
    const group = new THREE.Group()
    const pad = new THREE.Mesh(this.padGeometry, this.padMaterial)
    pad.castShadow = true
    pad.receiveShadow = true
    group.add(pad)

    const ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.09
    group.add(ring)
    return { group, spin: ring }
  }

  createSpeed(): { group: THREE.Group; spin: THREE.Object3D } {
    const group = new THREE.Group()
    const pad = new THREE.Mesh(this.padGeometry, this.speedMaterial)
    pad.castShadow = true
    pad.receiveShadow = true
    group.add(pad)

    const arrow = new THREE.Mesh(this.speedArrowGeometry, this.speedMaterial)
    arrow.rotation.x = -Math.PI / 2
    arrow.position.y = 0.1
    arrow.scale.x = 0.7
    arrow.castShadow = true
    group.add(arrow)
    return { group, spin: arrow }
  }

  createPlatform(): THREE.Group {
    const group = new THREE.Group()
    const slab = new THREE.Mesh(this.platformGeometry, this.platformMaterial)
    slab.castShadow = true
    slab.receiveShadow = true
    group.add(slab)

    const trim = new THREE.Mesh(this.platformTrimGeometry, this.platformTrimMaterial)
    trim.position.y = 0.12
    trim.castShadow = true
    group.add(trim)

    for (const z of [-0.95, 0.95]) {
      const post = new THREE.Mesh(this.postGeometry, this.platformMaterial)
      post.position.set(0, -0.4, z)
      post.castShadow = true
      group.add(post)
    }
    return group
  }

  createCheckpoint(): { group: THREE.Group; spin: THREE.Object3D } {
    const group = new THREE.Group()
    const base = new THREE.Mesh(this.baseGeometry, this.checkpointMaterial)
    base.position.y = 0.08
    base.castShadow = true
    base.receiveShadow = true
    group.add(base)

    const beacon = new THREE.Mesh(this.beaconGeometry, this.checkpointMaterial)
    beacon.position.y = 0.52
    beacon.castShadow = true
    group.add(beacon)

    const ring = new THREE.Mesh(this.checkpointRingGeometry, this.ringMaterial)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.36
    group.add(ring)
    return { group, spin: beacon }
  }

  update(elapsed: number): void {
    this.padMaterial.emissiveIntensity = 0.38 + Math.sin(elapsed * 2.6) * 0.16
    this.speedMaterial.emissiveIntensity = 0.42 + Math.sin(elapsed * 3.1) * 0.14
  }

  dispose(): void {
    for (const geometry of this.geometries) {
      geometry.dispose()
    }
    for (const material of this.materials) {
      material.dispose()
    }
    this.geometries.length = 0
    this.materials.length = 0
  }

  private trackGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry)
    return geometry
  }

  private trackMaterial<T extends THREE.Material>(material: T): T {
    this.materials.push(material)
    return material
  }
}
