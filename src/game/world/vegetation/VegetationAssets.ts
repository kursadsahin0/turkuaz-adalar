import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { PALETTE } from '../../../config/Palette.ts'

export interface TreeInstance {
  group: THREE.Group
  crown: THREE.Group
}

interface GeometryPart {
  geometry: THREE.BufferGeometry
  position?: THREE.Vector3
  rotation?: THREE.Euler
  scale?: THREE.Vector3
}

/**
 * Shared low-poly vegetation. Every repeated cluster is merged into a single
 * geometry so a whole palm crown or bush costs one draw call instead of dozens.
 */
export class VegetationAssets {
  private readonly trunkMaterial: THREE.MeshStandardMaterial
  private readonly trunkDarkMaterial: THREE.MeshStandardMaterial
  private readonly leafDarkMaterial: THREE.MeshStandardMaterial
  private readonly leafMaterial: THREE.MeshStandardMaterial
  private readonly leafLightMaterial: THREE.MeshStandardMaterial
  private readonly leafSunMaterial: THREE.MeshStandardMaterial
  private readonly rockMaterial: THREE.MeshStandardMaterial
  private readonly rockLightMaterial: THREE.MeshStandardMaterial
  private readonly flowerMaterials: THREE.MeshStandardMaterial[]

  private readonly palmTrunkGeometry: THREE.BufferGeometry
  private readonly palmCrownGeometry: THREE.BufferGeometry
  private readonly roundTrunkGeometry: THREE.BufferGeometry
  private readonly roundCrownGeometry: THREE.BufferGeometry
  private readonly pineTrunkGeometry: THREE.BufferGeometry
  private readonly pineCrownGeometry: THREE.BufferGeometry
  private readonly bushGeometry: THREE.BufferGeometry
  private readonly grassGeometry: THREE.BufferGeometry
  private readonly flowerStemGeometry: THREE.BufferGeometry
  private readonly flowerHeadGeometry: THREE.BufferGeometry
  private readonly rockGeometry: THREE.BufferGeometry

  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []

  constructor() {
    this.trunkMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.trunk,
        roughness: 0.94,
        metalness: 0,
        flatShading: true,
      }),
    )
    this.trunkDarkMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.trunkDark,
        roughness: 0.96,
        metalness: 0,
        flatShading: true,
      }),
    )
    this.leafDarkMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.foliageDark,
        roughness: 0.86,
        metalness: 0,
        flatShading: true,
      }),
    )
    this.leafMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.foliage,
        roughness: 0.84,
        metalness: 0,
        flatShading: true,
      }),
    )
    this.leafLightMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.foliageLight,
        roughness: 0.8,
        metalness: 0,
        flatShading: true,
      }),
    )
    this.leafSunMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.foliageSun,
        roughness: 0.78,
        metalness: 0,
        flatShading: true,
      }),
    )
    this.rockMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.rock,
        roughness: 0.94,
        metalness: 0,
        flatShading: true,
      }),
    )
    this.rockLightMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.rockLight,
        roughness: 0.9,
        metalness: 0,
        flatShading: true,
      }),
    )
    this.flowerMaterials = [
      this.trackMaterial(
        new THREE.MeshStandardMaterial({
          color: PALETTE.flowerPink,
          roughness: 0.64,
          flatShading: true,
        }),
      ),
      this.trackMaterial(
        new THREE.MeshStandardMaterial({
          color: PALETTE.flowerYellow,
          roughness: 0.58,
          flatShading: true,
        }),
      ),
      this.trackMaterial(
        new THREE.MeshStandardMaterial({
          color: PALETTE.flowerCoral,
          roughness: 0.66,
          flatShading: true,
        }),
      ),
    ]

    this.palmTrunkGeometry = this.trackGeometry(this.buildPalmTrunk())
    this.palmCrownGeometry = this.trackGeometry(this.buildPalmCrown())
    this.roundTrunkGeometry = this.trackGeometry(new THREE.CylinderGeometry(0.2, 0.31, 1.8, 6))
    this.roundCrownGeometry = this.trackGeometry(this.buildRoundCrown())
    this.pineTrunkGeometry = this.trackGeometry(new THREE.CylinderGeometry(0.16, 0.26, 1.5, 6))
    this.pineCrownGeometry = this.trackGeometry(this.buildPineCrown())
    this.bushGeometry = this.trackGeometry(this.buildBush())
    this.grassGeometry = this.trackGeometry(this.buildGrass())
    this.flowerStemGeometry = this.trackGeometry(this.buildFlowerStems())
    this.flowerHeadGeometry = this.trackGeometry(this.buildFlowerHeads())
    this.rockGeometry = this.trackGeometry(new THREE.DodecahedronGeometry(0.5, 0))
  }

  createPalm(variant: number): TreeInstance {
    const group = new THREE.Group()

    const trunk = new THREE.Mesh(this.palmTrunkGeometry, this.trunkMaterial)
    trunk.castShadow = true
    trunk.receiveShadow = true
    group.add(trunk)

    const crown = new THREE.Group()
    crown.position.y = 2.74
    const leaves = new THREE.Mesh(
      this.palmCrownGeometry,
      variant % 3 === 0
        ? this.leafDarkMaterial
        : variant % 3 === 1
          ? this.leafMaterial
          : this.leafLightMaterial,
    )
    leaves.castShadow = true
    leaves.receiveShadow = true
    crown.add(leaves)
    group.add(crown)

    return { group, crown }
  }

  createRoundTree(variant: number): TreeInstance {
    const group = new THREE.Group()

    const trunk = new THREE.Mesh(this.roundTrunkGeometry, this.trunkDarkMaterial)
    trunk.position.y = 0.9
    trunk.castShadow = true
    trunk.receiveShadow = true
    group.add(trunk)

    const crown = new THREE.Group()
    crown.position.y = 1.86
    const canopy = new THREE.Mesh(
      this.roundCrownGeometry,
      variant % 3 === 0
        ? this.leafMaterial
        : variant % 3 === 1
          ? this.leafLightMaterial
          : this.leafSunMaterial,
    )
    canopy.castShadow = true
    canopy.receiveShadow = true
    crown.add(canopy)
    group.add(crown)

    return { group, crown }
  }

  createPine(variant: number): TreeInstance {
    const group = new THREE.Group()

    const trunk = new THREE.Mesh(this.pineTrunkGeometry, this.trunkDarkMaterial)
    trunk.position.y = 0.72
    trunk.castShadow = true
    trunk.receiveShadow = true
    group.add(trunk)

    const crown = new THREE.Group()
    crown.position.y = 1.48
    const needles = new THREE.Mesh(
      this.pineCrownGeometry,
      variant % 2 === 0 ? this.leafDarkMaterial : this.leafMaterial,
    )
    needles.castShadow = true
    needles.receiveShadow = true
    crown.add(needles)
    group.add(crown)

    return { group, crown }
  }

  createBush(variant: number): THREE.Mesh {
    const bush = new THREE.Mesh(this.bushGeometry, this.pickLeafMaterial(variant))
    bush.castShadow = true
    bush.receiveShadow = true
    return bush
  }

  createGrass(): THREE.Mesh {
    const grass = new THREE.Mesh(this.grassGeometry, this.leafLightMaterial)
    grass.castShadow = true
    grass.receiveShadow = true
    return grass
  }

  createFlowerCluster(variant: number): THREE.Group {
    const group = new THREE.Group()

    const stems = new THREE.Mesh(this.flowerStemGeometry, this.leafDarkMaterial)
    stems.castShadow = true
    const heads = new THREE.Mesh(
      this.flowerHeadGeometry,
      this.flowerMaterials[variant % this.flowerMaterials.length] as THREE.MeshStandardMaterial,
    )
    heads.castShadow = true

    group.add(stems, heads)
    return group
  }

  createRock(variant: number): THREE.Mesh {
    const rock = new THREE.Mesh(
      this.rockGeometry,
      variant % 3 === 0 ? this.rockLightMaterial : this.rockMaterial,
    )
    rock.castShadow = true
    rock.receiveShadow = true
    return rock
  }

  /**
   * Tints every leaf material toward an island's foliage colour while keeping
   * the light/dark shading between them; `null` restores the authored greens.
   */
  setFoliageTint(tint: number | null): void {
    const leaves: [THREE.MeshStandardMaterial, number][] = [
      [this.leafDarkMaterial, PALETTE.foliageDark],
      [this.leafMaterial, PALETTE.foliage],
      [this.leafLightMaterial, PALETTE.foliageLight],
      [this.leafSunMaterial, PALETTE.foliageSun],
    ]
    const target = tint === null ? null : new THREE.Color(tint)
    const hsl = { h: 0, s: 0, l: 0 }
    const targetHsl = { h: 0, s: 0, l: 0 }
    target?.getHSL(targetHsl)
    for (const [material, base] of leaves) {
      material.color.set(base)
      if (target) {
        // Take the island's hue and saturation, keep each leaf's lightness.
        material.color.getHSL(hsl)
        material.color.setHSL(targetHsl.h, targetHsl.s, hsl.l)
      }
    }
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

  private pickLeafMaterial(variant: number): THREE.MeshStandardMaterial {
    switch (variant % 4) {
      case 0:
        return this.leafDarkMaterial
      case 1:
        return this.leafMaterial
      case 2:
        return this.leafLightMaterial
      default:
        return this.leafSunMaterial
    }
  }

  private buildPalmTrunk(): THREE.BufferGeometry {
    const lower = new THREE.CylinderGeometry(0.21, 0.29, 1.1, 6)
    const middle = new THREE.CylinderGeometry(0.16, 0.22, 1.1, 6)
    const upper = new THREE.CylinderGeometry(0.11, 0.17, 1.0, 6)

    return this.mergeParts([
      {
        geometry: lower,
        position: new THREE.Vector3(0, 0.5, 0),
        rotation: new THREE.Euler(0, 0, 0.045),
      },
      {
        geometry: middle,
        position: new THREE.Vector3(0.035, 1.48, 0),
        rotation: new THREE.Euler(0, 0, -0.035),
      },
      {
        geometry: upper,
        position: new THREE.Vector3(0.09, 2.36, 0),
        rotation: new THREE.Euler(0, 0, -0.09),
      },
    ])
  }

  private buildPalmCrown(): THREE.BufferGeometry {
    const parts: GeometryPart[] = []
    const leafCount = 7

    for (let index = 0; index < leafCount; index += 1) {
      const leaf = new THREE.ConeGeometry(0.28, 1.8, 4)
      leaf.translate(0, 0.9, 0)
      leaf.scale(1, 1, 0.3)

      parts.push({
        geometry: leaf,
        rotation: new THREE.Euler(
          0,
          (index / leafCount) * Math.PI * 2 + (index % 2) * 0.16,
          1.02 + (index % 3) * 0.07,
        ),
      })
    }

    const heart = new THREE.IcosahedronGeometry(0.19, 0)
    parts.push({
      geometry: heart,
      position: new THREE.Vector3(0, 0.02, 0),
      scale: new THREE.Vector3(1, 0.8, 1),
    })

    return this.mergeParts(parts)
  }

  private buildRoundCrown(): THREE.BufferGeometry {
    return this.mergeParts([
      {
        geometry: new THREE.IcosahedronGeometry(0.92, 1),
        position: new THREE.Vector3(0, 0.32, 0),
        scale: new THREE.Vector3(1.05, 0.92, 1),
      },
      {
        geometry: new THREE.IcosahedronGeometry(0.68, 1),
        position: new THREE.Vector3(-0.58, 0.02, 0.08),
        scale: new THREE.Vector3(0.9, 0.82, 0.9),
      },
      {
        geometry: new THREE.IcosahedronGeometry(0.7, 1),
        position: new THREE.Vector3(0.56, 0.1, -0.1),
      },
      {
        geometry: new THREE.IcosahedronGeometry(0.55, 1),
        position: new THREE.Vector3(0.04, 0.78, 0.02),
      },
    ])
  }

  private buildPineCrown(): THREE.BufferGeometry {
    return this.mergeParts([
      {
        geometry: new THREE.ConeGeometry(1.05, 1.5, 7),
        position: new THREE.Vector3(0, 0.24, 0),
      },
      {
        geometry: new THREE.ConeGeometry(0.82, 1.35, 7),
        position: new THREE.Vector3(0, 0.94, 0),
      },
      {
        geometry: new THREE.ConeGeometry(0.56, 1.15, 7),
        position: new THREE.Vector3(0, 1.55, 0),
      },
    ])
  }

  private buildBush(): THREE.BufferGeometry {
    return this.mergeParts([
      {
        geometry: new THREE.IcosahedronGeometry(0.52, 1),
        position: new THREE.Vector3(0, 0.3, 0),
        scale: new THREE.Vector3(1.15, 0.85, 1),
      },
      {
        geometry: new THREE.IcosahedronGeometry(0.38, 1),
        position: new THREE.Vector3(-0.38, 0.2, 0.12),
      },
      {
        geometry: new THREE.IcosahedronGeometry(0.4, 1),
        position: new THREE.Vector3(0.38, 0.21, -0.08),
      },
    ])
  }

  private buildGrass(): THREE.BufferGeometry {
    const parts: GeometryPart[] = []
    for (let index = 0; index < 6; index += 1) {
      const blade = new THREE.ConeGeometry(0.08, 0.62 + (index % 3) * 0.08, 3)
      blade.translate(0, 0.32, 0)
      parts.push({
        geometry: blade,
        position: new THREE.Vector3(
          (index - 2.5) * 0.11,
          0,
          (index % 2 === 0 ? 1 : -1) * (index % 3) * 0.07,
        ),
        rotation: new THREE.Euler(
          (index % 2 === 0 ? 1 : -1) * 0.1,
          index * 0.9,
          (index - 2.5) * 0.11,
        ),
      })
    }
    return this.mergeParts(parts)
  }

  private buildFlowerStems(): THREE.BufferGeometry {
    const parts: GeometryPart[] = []
    for (let index = 0; index < 5; index += 1) {
      const stem = new THREE.CylinderGeometry(0.018, 0.028, 0.48, 4)
      parts.push({
        geometry: stem,
        position: new THREE.Vector3(
          Math.cos(index * 1.8) * 0.16,
          0.24,
          Math.sin(index * 1.8) * 0.16,
        ),
        rotation: new THREE.Euler(0, 0, (index - 2) * 0.05),
      })
    }
    return this.mergeParts(parts)
  }

  private buildFlowerHeads(): THREE.BufferGeometry {
    const parts: GeometryPart[] = []
    for (let index = 0; index < 5; index += 1) {
      parts.push({
        geometry: new THREE.IcosahedronGeometry(0.1, 0),
        position: new THREE.Vector3(
          Math.cos(index * 1.8) * 0.18,
          0.52 + (index % 2) * 0.04,
          Math.sin(index * 1.8) * 0.18,
        ),
        scale: new THREE.Vector3(1, 0.7, 1),
      })
    }
    return this.mergeParts(parts)
  }

  private mergeParts(parts: GeometryPart[]): THREE.BufferGeometry {
    const clones: THREE.BufferGeometry[] = []

    for (const part of parts) {
      const clone = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone()
      const matrix = new THREE.Matrix4().compose(
        part.position ?? new THREE.Vector3(),
        new THREE.Quaternion().setFromEuler(part.rotation ?? new THREE.Euler()),
        part.scale ?? new THREE.Vector3(1, 1, 1),
      )
      clone.applyMatrix4(matrix)
      clones.push(clone)
      part.geometry.dispose()
    }

    const merged = mergeGeometries(clones, false)
    for (const clone of clones) {
      clone.dispose()
    }

    if (!merged) {
      throw new Error('Vegetation geometry could not be merged.')
    }

    merged.computeBoundingSphere()
    return merged
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
