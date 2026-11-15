import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PALETTE } from '../../config/Palette.ts'
import type { LoadedAsset } from '../../assets/ModelLoader.ts'

/** Optional Blender props. When missing, the procedural fallbacks are used. */
export interface ObstacleModels {
  readonly crate?: LoadedAsset | null
  readonly spire?: LoadedAsset | null
}

export interface ObstacleVisual {
  group: THREE.Group
  height: number
  halfWidth: number
  halfDepth: number
  radius: number
  /** Physics box relative to the track top. */
  collider: {
    centerY: number
    halfWidth: number
    halfHeight: number
    halfDepth: number
  }
}

/**
 * Shared art resources for the obstacle prefabs. Geometry is cached by
 * dimensions and materials live for the lifetime of the world, so pooling
 * instances never causes GPU churn. All prefabs use the same rounded shape
 * language and turquoise/sand/coral palette.
 */
export class ObstacleAssets {
  readonly spireMaterial: THREE.MeshStandardMaterial
  readonly hazardMaterial: THREE.MeshStandardMaterial
  readonly barrierTrimMaterial: THREE.MeshStandardMaterial
  readonly mechanismMaterial: THREE.MeshStandardMaterial
  readonly mechanismGlowMaterial: THREE.MeshStandardMaterial
  readonly platformMaterial: THREE.MeshStandardMaterial
  readonly platformTrimMaterial: THREE.MeshStandardMaterial
  readonly warningMaterial: THREE.MeshBasicMaterial
  readonly shadowMaterial: THREE.MeshBasicMaterial
  readonly safeMaterial: THREE.MeshStandardMaterial

  private readonly crateGeometry: THREE.BoxGeometry
  private readonly crateStrapGeometry: THREE.BoxGeometry
  private readonly crateMaterial: THREE.MeshStandardMaterial
  private readonly crateStrapMaterial: THREE.MeshStandardMaterial
  private readonly spireGeometry: THREE.ConeGeometry
  private readonly spireShardGeometry: THREE.ConeGeometry
  private readonly spireRingGeometry: THREE.TorusGeometry
  private readonly spireRingMaterial: THREE.MeshBasicMaterial
  private readonly beamBarGeometry: THREE.BoxGeometry
  private readonly beamPostGeometry: THREE.CylinderGeometry
  private readonly beamCapGeometry: THREE.BoxGeometry
  private readonly beamMaterial: THREE.MeshStandardMaterial
  private readonly beamGlowMaterial: THREE.MeshStandardMaterial
  private readonly geometryCache = new Map<string, THREE.BufferGeometry>()
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly models: ObstacleModels

  constructor(models: ObstacleModels = {}) {
    this.models = models
    this.crateGeometry = this.trackGeometry(new THREE.BoxGeometry(1.2, 1.15, 1.2))
    this.crateStrapGeometry = this.trackGeometry(new THREE.BoxGeometry(1.24, 0.1, 1.24))
    this.crateMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.crate,
        roughness: 0.8,
        metalness: 0,
      }),
    )
    this.crateStrapMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.crateStrap,
        roughness: 0.52,
        metalness: 0.12,
      }),
    )

    this.spireGeometry = this.trackGeometry(new THREE.ConeGeometry(0.66, 2.5, 5))
    this.spireShardGeometry = this.trackGeometry(new THREE.ConeGeometry(0.25, 1.2, 4))
    this.spireMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.spire,
        emissive: PALETTE.spireGlow,
        emissiveIntensity: 0.35,
        roughness: 0.32,
        metalness: 0.18,
      }),
    )
    this.spireRingGeometry = this.trackGeometry(new THREE.TorusGeometry(0.58, 0.035, 6, 22))
    this.spireRingMaterial = this.trackMaterial(
      new THREE.MeshBasicMaterial({
        color: PALETTE.spireGlow,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )

    this.beamBarGeometry = this.trackGeometry(new THREE.BoxGeometry(2.8, 0.32, 0.24))
    this.beamPostGeometry = this.trackGeometry(new THREE.CylinderGeometry(0.12, 0.14, 1.0, 8))
    this.beamCapGeometry = this.trackGeometry(new THREE.BoxGeometry(0.34, 0.44, 0.32))
    this.beamMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.crateStrap,
        roughness: 0.44,
        metalness: 0.12,
      }),
    )
    this.beamGlowMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.playerGlow,
        emissive: PALETTE.playerGlow,
        emissiveIntensity: 0.42,
        roughness: 0.28,
        metalness: 0.16,
      }),
    )

    this.hazardMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.crate,
        emissive: PALETTE.crateDark,
        emissiveIntensity: 0.12,
        roughness: 0.62,
        metalness: 0.04,
      }),
    )
    this.barrierTrimMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.crateStrap,
        roughness: 0.46,
        metalness: 0.16,
      }),
    )
    this.mechanismMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.mechanismGold,
        roughness: 0.48,
        metalness: 0.22,
      }),
    )
    this.mechanismGlowMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.mechanismYellow,
        emissive: PALETTE.mechanismGlow,
        emissiveIntensity: 0.65,
        roughness: 0.3,
        metalness: 0.08,
      }),
    )
    this.platformMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.platformTurquoise,
        roughness: 0.42,
        metalness: 0.12,
      }),
    )
    this.platformTrimMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.platformWhite,
        roughness: 0.5,
        metalness: 0.04,
      }),
    )
    this.safeMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.grassLight,
        emissive: PALETTE.grassDark,
        emissiveIntensity: 0.16,
        roughness: 0.58,
        metalness: 0.04,
      }),
    )
    this.warningMaterial = this.trackMaterial(
      new THREE.MeshBasicMaterial({
        color: PALETTE.mechanismGlow,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    )
    this.shadowMaterial = this.trackMaterial(
      new THREE.MeshBasicMaterial({
        color: PALETTE.rockDark,
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
      }),
    )
  }

  /** Legacy static-barrier factory kept for the beam/slide validation rigs. */
  create(kind: 'crate' | 'spire' | 'beam'): ObstacleVisual {
    if (kind === 'crate') {
      return this.createCrate()
    }
    if (kind === 'beam') {
      return this.createBeam()
    }
    return this.createSpire()
  }

  update(elapsed: number): void {
    this.spireMaterial.emissiveIntensity = 0.32 + Math.sin(elapsed * 2.2) * 0.1
  }

  roundedBox(width: number, height: number, depth: number, radius = 0.12): THREE.BufferGeometry {
    const safeRadius = Math.min(radius, Math.min(width, height, depth) * 0.45)
    const key = `box:${width}:${height}:${depth}:${safeRadius}`
    const cached = this.geometryCache.get(key)
    if (cached) {
      return cached
    }
    const geometry = new RoundedBoxGeometry(width, height, depth, 2, safeRadius)
    this.geometryCache.set(key, geometry)
    this.geometries.push(geometry)
    return geometry
  }

  cylinder(
    radiusTop: number,
    radiusBottom: number,
    height: number,
    segments = 12,
  ): THREE.BufferGeometry {
    const key = `cyl:${radiusTop}:${radiusBottom}:${height}:${segments}`
    const cached = this.geometryCache.get(key)
    if (cached) {
      return cached
    }
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments)
    this.geometryCache.set(key, geometry)
    this.geometries.push(geometry)
    return geometry
  }

  torus(
    radius: number,
    tube: number,
    radialSegments = 8,
    tubularSegments = 24,
  ): THREE.BufferGeometry {
    const key = `torus:${radius}:${tube}:${radialSegments}:${tubularSegments}`
    const cached = this.geometryCache.get(key)
    if (cached) {
      return cached
    }
    const geometry = new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments)
    this.geometryCache.set(key, geometry)
    this.geometries.push(geometry)
    return geometry
  }

  cone(radius: number, height: number, segments = 8): THREE.BufferGeometry {
    const key = `cone:${radius}:${height}:${segments}`
    const cached = this.geometryCache.get(key)
    if (cached) {
      return cached
    }
    const geometry = new THREE.ConeGeometry(radius, height, segments)
    this.geometryCache.set(key, geometry)
    this.geometries.push(geometry)
    return geometry
  }

  dispose(): void {
    for (const geometry of this.geometries) {
      geometry.dispose()
    }
    for (const material of this.materials) {
      material.dispose()
    }
    this.geometryCache.clear()
    this.geometries.length = 0
    this.materials.length = 0
  }

  /**
   * Wraps a GLB clone so its base sits on the deck. Clones share geometry and
   * materials with the cached template, so pooling stays allocation-free.
   */
  private modelGroup(asset: LoadedAsset): THREE.Group {
    const group = new THREE.Group()
    const instance = asset.createInstance({ castShadow: true, receiveShadow: true })
    instance.root.position.y = -Math.min(0, asset.bounds.min.y)
    group.add(instance.root)
    return group
  }

  private createCrate(): ObstacleVisual {
    const group = this.models.crate ? this.modelGroup(this.models.crate) : this.buildCrateGroup()
    return {
      group,
      height: 1.15,
      halfWidth: 0.62,
      halfDepth: 0.62,
      radius: 0.9,
      collider: {
        centerY: 0.575,
        halfWidth: 0.62,
        halfHeight: 0.575,
        halfDepth: 0.62,
      },
    }
  }

  private buildCrateGroup(): THREE.Group {
    const group = new THREE.Group()

    const body = new THREE.Mesh(this.crateGeometry, this.crateMaterial)
    body.position.y = 0.575
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    for (const y of [0.34, 0.82]) {
      const strap = new THREE.Mesh(this.crateStrapGeometry, this.crateStrapMaterial)
      strap.position.y = y
      strap.castShadow = true
      group.add(strap)
    }

    const cap = new THREE.Mesh(this.crateStrapGeometry, this.crateStrapMaterial)
    cap.position.y = 1.12
    cap.scale.set(0.82, 0.55, 0.82)
    cap.castShadow = true
    group.add(cap)
    return group
  }

  private createSpire(): ObstacleVisual {
    const group = this.models.spire ? this.modelGroup(this.models.spire) : this.buildSpireGroup()
    return {
      group,
      height: 2.5,
      halfWidth: 0.48,
      halfDepth: 0.48,
      radius: 0.7,
      collider: {
        centerY: 1.25,
        halfWidth: 0.48,
        halfHeight: 1.25,
        halfDepth: 0.48,
      },
    }
  }

  private buildSpireGroup(): THREE.Group {
    const group = new THREE.Group()

    const crystal = new THREE.Mesh(this.spireGeometry, this.spireMaterial)
    crystal.position.y = 1.25
    crystal.castShadow = true
    crystal.receiveShadow = true
    group.add(crystal)

    for (const side of [-1, 1]) {
      const shard = new THREE.Mesh(this.spireShardGeometry, this.spireMaterial)
      shard.position.set(side * 0.34, 0.55, side * 0.08)
      shard.rotation.z = side * 0.38
      shard.rotation.y = side * 0.4
      shard.castShadow = true
      group.add(shard)
    }

    const ring = new THREE.Mesh(this.spireRingGeometry, this.spireRingMaterial)
    ring.position.y = 0.08
    ring.rotation.x = Math.PI / 2
    group.add(ring)
    return group
  }

  /**
   * Low overhead beam. Only the bar is physical: the posts are visual, which
   * gives the player a clean lane-width window to slide through.
   */
  private createBeam(): ObstacleVisual {
    const group = new THREE.Group()

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(this.beamPostGeometry, this.beamMaterial)
      post.position.set(side * 1.12, 0.5, 0)
      post.castShadow = true
      post.receiveShadow = true
      group.add(post)
    }

    const bar = new THREE.Mesh(this.beamBarGeometry, this.beamGlowMaterial)
    bar.position.y = 1.26
    bar.castShadow = true
    bar.receiveShadow = true
    group.add(bar)

    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(this.beamCapGeometry, this.beamMaterial)
      cap.position.set(side * 1.12, 1.26, 0)
      cap.castShadow = true
      group.add(cap)
    }

    return {
      group,
      height: 1.42,
      halfWidth: 1.4,
      halfDepth: 0.2,
      radius: 1.35,
      collider: {
        centerY: 1.26,
        halfWidth: 1.34,
        halfHeight: 0.16,
        halfDepth: 0.16,
      },
    }
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
