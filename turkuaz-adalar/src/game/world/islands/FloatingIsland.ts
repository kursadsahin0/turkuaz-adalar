import * as THREE from 'three'
import { PALETTE } from '../../../config/Palette.ts'
import { WORLD_CONFIG } from '../../../config/WorldConfig.ts'
import type { Rng } from '../../../utils/random.ts'
import type { VegetationAssets } from '../vegetation/VegetationAssets.ts'
import type { Waterfall, WaterfallAssets } from '../waterfalls/Waterfall.ts'
import { Waterfall as WaterfallInstance } from '../waterfalls/Waterfall.ts'
import { buildGeometry } from '../geometry/AssetGeometry.ts'
import type { GeometryPart } from '../geometry/AssetGeometry.ts'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { createCheckerTexture } from '../../platforms/PlatformAssets.ts'

type FloatingPropKind = 'tree' | 'bush' | 'grass' | 'flower' | 'rock'

interface FloatingProp {
  object: THREE.Object3D
  kind: FloatingPropKind
  crown: THREE.Group | null
  phase: number
  minScale: number
  maxScale: number
}

/**
 * Shared floating-island art. The terrain of each variant is a single merged,
 * vertex-coloured mesh (grass cap, sand band, faceted rock keel), which keeps
 * distant scenery to one draw call per island plus its vegetation.
 */
export class FloatingIslandAssets {
  readonly terrainMaterial: THREE.MeshStandardMaterial
  readonly padCheckerMaterial: THREE.MeshStandardMaterial
  readonly padDetailMaterial: THREE.MeshStandardMaterial

  readonly distantNearMaterial: THREE.MeshBasicMaterial
  readonly distantFarMaterial: THREE.MeshBasicMaterial

  private readonly terrainGeometries: THREE.BufferGeometry[] = []
  private readonly checkerGeometry: THREE.BufferGeometry
  private readonly checkerTexture: THREE.CanvasTexture
  private readonly padDetailGeometry: THREE.BufferGeometry
  private readonly materials: THREE.Material[] = []

  constructor() {
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
      flatShading: true,
    })
    this.checkerTexture = createCheckerTexture(2, 2)
    this.padCheckerMaterial = new THREE.MeshStandardMaterial({
      map: this.checkerTexture,
      roughness: 0.46,
      metalness: 0.04,
    })
    this.padDetailMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.06,
    })
    this.distantNearMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.horizonIsland,
      fog: false,
    })
    this.distantFarMaterial = new THREE.MeshBasicMaterial({
      color: 0x8fd3cd,
      fog: false,
    })
    this.materials.push(
      this.terrainMaterial,
      this.padCheckerMaterial,
      this.padDetailMaterial,
      this.distantNearMaterial,
      this.distantFarMaterial,
    )

    for (let variant = 0; variant < 3; variant += 1) {
      this.terrainGeometries.push(buildFloatingTerrain(variant))
    }

    this.checkerGeometry = new RoundedBoxGeometry(3.2, 0.22, 3.2, 2, 0.1)
    this.checkerGeometry.translate(0, -0.11, 0)
    this.checkerGeometry.computeBoundingSphere()

    this.padDetailGeometry = buildPadDetails()
  }

  createTerrain(variant: number): THREE.Mesh {
    const geometry = this.terrainGeometries[variant % this.terrainGeometries.length]
    if (!geometry) {
      throw new Error('Floating island terrain variant is missing.')
    }
    const mesh = new THREE.Mesh(geometry, this.terrainMaterial)
    mesh.name = 'FloatingIslandTerrain'
    mesh.receiveShadow = true
    return mesh
  }

  createPadChecker(): THREE.Mesh {
    const mesh = new THREE.Mesh(this.checkerGeometry, this.padCheckerMaterial)
    mesh.name = 'FloatingPadChecker'
    mesh.receiveShadow = true
    return mesh
  }

  createPadDetails(): THREE.Mesh {
    const mesh = new THREE.Mesh(this.padDetailGeometry, this.padDetailMaterial)
    mesh.name = 'FloatingPadFrame'
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }

  createDistantIsland(variant: number, near: boolean): THREE.Mesh {
    const geometry = this.terrainGeometries[variant % this.terrainGeometries.length]
    if (!geometry) {
      throw new Error('Distant island terrain variant is missing.')
    }
    const mesh = new THREE.Mesh(
      geometry,
      near ? this.distantNearMaterial : this.distantFarMaterial,
    )
    mesh.name = 'DistantIsland'
    return mesh
  }

  dispose(): void {
    for (const geometry of this.terrainGeometries) {
      geometry.dispose()
    }
    this.checkerGeometry.dispose()
    this.padDetailGeometry.dispose()
    for (const material of this.materials) {
      material.dispose()
    }
    this.checkerTexture.dispose()
    this.terrainGeometries.length = 0
    this.materials.length = 0
  }
}

function buildFloatingTerrain(variant: number): THREE.BufferGeometry {
  const seed = variant * 4.73 + 1.31
  const depth = [1.5, 1.85, 1.28][variant] ?? 1.5
  const topRadius = [1, 0.97, 1.02][variant] ?? 1

  const rock = new THREE.CylinderGeometry(0.94 * topRadius, 0.1, depth, 10, 4)
  roughenRock(rock, depth, seed)

  const parts: GeometryPart[] = [
    {
      geometry: new THREE.CylinderGeometry(topRadius, 0.96 * topRadius, 0.34, 12, 1),
      color: PALETTE.grass,
      position: new THREE.Vector3(0, -0.17, 0),
    },
    {
      geometry: new THREE.CylinderGeometry(
        0.66 * topRadius,
        0.62 * topRadius,
        0.025,
        12,
        1,
      ),
      color: PALETTE.grassLight,
      position: new THREE.Vector3(0, 0.006, 0),
    },
    {
      geometry: new THREE.CylinderGeometry(0.99 * topRadius, 0.95 * topRadius, 0.42, 12, 1),
      color: PALETTE.sand,
      position: new THREE.Vector3(0, -0.33, 0),
    },
    {
      geometry: rock,
      color: PALETTE.rock,
      position: new THREE.Vector3(0, -0.5 - depth / 2, 0),
    },
  ]

  const boulderGeometry = new THREE.DodecahedronGeometry(0.16, 0)
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2 + 0.3
    parts.push({
      geometry: boulderGeometry.clone(),
      color: index % 2 === 0 ? PALETTE.rockLight : PALETTE.rockDark,
      position: new THREE.Vector3(
        Math.cos(angle) * 0.9 * topRadius,
        -0.24,
        Math.sin(angle) * 0.9 * topRadius,
      ),
      scale: new THREE.Vector3(1, 0.8, 1.1),
      rotation: new THREE.Euler(angle * 0.7, angle, 0.3),
    })
  }

  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * Math.PI * 2 + 1.1
    parts.push({
      geometry: boulderGeometry.clone(),
      color: PALETTE.rockLight,
      position: new THREE.Vector3(
        Math.cos(angle) * 0.7 * topRadius,
        0.03,
        Math.sin(angle) * 0.7 * topRadius,
      ),
      scale: new THREE.Vector3(0.7, 0.55, 0.8),
      rotation: new THREE.Euler(0, angle, 0),
    })
  }

  boulderGeometry.dispose()
  return buildGeometry(parts, true)
}

function roughenRock(
  geometry: THREE.CylinderGeometry,
  depth: number,
  seed: number,
): void {
  const position = geometry.attributes.position
  if (!position) {
    return
  }

  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index)
    const heightRatio = THREE.MathUtils.clamp((y + depth / 2) / depth, 0, 1)
    const angle = Math.atan2(position.getZ(index), position.getX(index))
    const wobble =
      Math.sin(angle * 3 + seed) * 0.5 +
      Math.sin(angle * 5.4 - seed * 1.7) * 0.32 +
      Math.cos(angle * 2.1 + seed * 0.6) * 0.18
    const falloff = 0.25 + heightRatio * 0.75
    const radial = 1 + wobble * 0.1 * falloff

    position.setX(index, position.getX(index) * radial)
    position.setZ(index, position.getZ(index) * radial)
    if (heightRatio < 0.98) {
      position.setY(index, y + wobble * 0.05 * depth)
    }
  }

  position.needsUpdate = true
  geometry.computeVertexNormals()
}

function buildPadDetails(): THREE.BufferGeometry {
  const parts: GeometryPart[] = [
    {
      geometry: new RoundedBoxGeometry(3.44, 0.24, 3.44, 3, 0.12),
      color: PALETTE.platformWhite,
      position: new THREE.Vector3(0, -0.16, 0),
    },
    {
      geometry: new RoundedBoxGeometry(3.5, 0.12, 3.5, 2, 0.06),
      color: PALETTE.platformTurquoiseDeep,
      position: new THREE.Vector3(0, -0.32, 0),
    },
  ]

  for (const x of [-1.5, 1.5] as const) {
    for (const z of [-1.5, 1.5] as const) {
      parts.push({
        geometry: new THREE.CylinderGeometry(0.075, 0.075, 0.035, 10),
        color: PALETTE.mechanismYellow,
        position: new THREE.Vector3(x, -0.02, z),
      })
    }
  }

  return buildGeometry(parts, true)
}

/**
 * One recycled floating island. Terrain and props are created once; recycling
 * only rewrites transforms and reuses the shared waterfall instance.
 */
export class FloatingIsland {
  readonly root = new THREE.Group()

  private readonly terrain: THREE.Mesh
  private readonly props: FloatingProp[] = []
  private readonly waterfall: Waterfall
  private readonly phase: number
  private baseY = 0

  constructor(
    assets: FloatingIslandAssets,
    vegetation: VegetationAssets,
    waterfalls: WaterfallAssets,
    variant: number,
    phase: number,
  ) {
    this.phase = phase
    this.root.name = `FloatingIsland-${variant}`
    this.terrain = assets.createTerrain(variant)
    this.root.add(this.terrain)

    const treeKind = variant % 3
    for (let index = 0; index < 2; index += 1) {
      const tree =
        treeKind === 0
          ? vegetation.createPalm(index)
          : treeKind === 1
            ? vegetation.createRoundTree(index)
            : vegetation.createPine(index)
      this.addProp(tree.group, 'tree', tree.crown, 0.7, 1.2)
    }

    this.addProp(vegetation.createBush(variant), 'bush', null, 0.6, 1.3)
    this.addProp(vegetation.createGrass(), 'grass', null, 0.85, 1.5)
    this.addProp(vegetation.createFlowerCluster(variant), 'flower', null, 0.9, 1.5)
    this.addProp(vegetation.createRock(variant), 'rock', null, 0.7, 1.4)

    this.waterfall = new WaterfallInstance(waterfalls, phase)
    this.root.add(this.waterfall.root)
  }

  get centerZ(): number {
    return this.root.position.z
  }

  layout(rng: Rng, x: number, y: number, z: number, radius: number): void {
    this.baseY = y
    this.root.position.set(x, y, z)
    this.terrain.scale.setScalar(radius)

    for (const prop of this.props) {
      const angle = rng.range(0, Math.PI * 2)
      const distance = rng.range(0.34, 0.74) * radius
      const scale = rng.range(prop.minScale, prop.maxScale) * (0.72 + radius * 0.09)

      prop.object.position.set(
        Math.cos(angle) * distance,
        0,
        Math.sin(angle) * distance,
      )
      prop.object.rotation.y = rng.range(0, Math.PI * 2)
      prop.object.scale.setScalar(scale)
      prop.phase = rng.range(0, Math.PI * 2)
    }

    const showFall = rng.chance(0.62)
    this.waterfall.setVisible(showFall)
    if (showFall) {
      const waterfall = WORLD_CONFIG.waterfall
      const angle = rng.range(0, Math.PI * 2)
      const height = rng.range(waterfall.sceneryMinHeight, waterfall.sceneryMaxHeight)
      const width = rng.range(waterfall.sceneryWidthMin, waterfall.sceneryWidthMax)
      const edge = radius * 0.94

      this.waterfall.configure(width, height, false)
      this.waterfall.root.position.set(
        Math.cos(angle) * edge,
        -0.16 - height,
        Math.sin(angle) * edge,
      )
      this.waterfall.root.rotation.y = Math.PI / 2 - angle
    }
  }

  update(elapsed: number): void {
    this.root.position.y =
      this.baseY + Math.sin(elapsed * 0.42 + this.phase) * WORLD_CONFIG.scenery.bobHeight

    for (const prop of this.props) {
      if (prop.kind === 'tree' && prop.crown) {
        prop.crown.rotation.z = Math.sin(elapsed * 0.9 + prop.phase) * 0.035
        prop.crown.rotation.x = Math.cos(elapsed * 0.7 + prop.phase) * 0.02
      }
    }

    this.waterfall.update(elapsed)
  }

  dispose(): void {
    this.waterfall.dispose()
    this.root.removeFromParent()
    this.root.clear()
  }

  private addProp(
    object: THREE.Object3D,
    kind: FloatingPropKind,
    crown: THREE.Group | null,
    minScale: number,
    maxScale: number,
  ): void {
    this.props.push({
      object,
      kind,
      crown,
      phase: Math.random() * Math.PI * 2,
      minScale,
      maxScale,
    })
    this.root.add(object)
  }
}
