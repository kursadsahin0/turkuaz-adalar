import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { GAME_CONFIG } from '../../config/GameConfig.ts'
import { PALETTE } from '../../config/Palette.ts'
import { WORLD_CONFIG } from '../../config/WorldConfig.ts'
import { buildGeometry } from '../world/geometry/AssetGeometry.ts'
import type { GeometryPart } from '../world/geometry/AssetGeometry.ts'

/**
 * The island shell beneath a track segment: a soft sand terrace, two grass
 * banks framing the checker platform and a faceted rock keel. Geometry and
 * materials are shared by every segment and only the placements change.
 */
export class IslandAssets {
  readonly sandMaterial: THREE.MeshStandardMaterial
  readonly grassMaterial: THREE.MeshStandardMaterial
  readonly rockMaterial: THREE.MeshStandardMaterial

  private readonly sandGeometry: THREE.BufferGeometry
  private readonly grassGeometry: THREE.BufferGeometry
  private readonly rockGeometry: THREE.BufferGeometry

  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []

  constructor() {
    const island = WORLD_CONFIG.island
    const topY = GAME_CONFIG.track.topY
    const grassInner = island.bankWidth / 2 - island.grassWidth / 2

    this.sandMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.sand,
        roughness: 0.9,
        metalness: 0,
      }),
    )
    this.grassMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.grass,
        roughness: 0.78,
        metalness: 0,
      }),
    )
    this.rockMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0,
        flatShading: true,
      }),
    )

    this.sandGeometry = this.trackGeometry(
      new RoundedBoxGeometry(island.bankWidth, island.sandHeight, island.bankLength, 2, 0.16),
    )
    this.sandGeometry.translate(0, topY - island.sandTopDrop - island.sandHeight / 2, 0)
    this.sandGeometry.computeBoundingSphere()

    const bankGeometry = new RoundedBoxGeometry(
      island.grassWidth,
      island.grassHeight,
      island.bankLength,
      2,
      0.07,
    )
    const bankY = topY - island.grassTopDrop - island.grassHeight / 2
    this.grassGeometry = this.trackGeometry(
      buildGeometry(
        [
          {
            geometry: bankGeometry.clone(),
            position: new THREE.Vector3(-grassInner, bankY, 0),
          },
          {
            geometry: bankGeometry,
            position: new THREE.Vector3(grassInner, bankY, 0),
          },
        ],
        false,
      ),
    )

    this.rockGeometry = this.trackGeometry(this.buildRockKeel())
  }

  createSand(): THREE.Mesh {
    const mesh = new THREE.Mesh(this.sandGeometry, this.sandMaterial)
    mesh.name = 'IslandSand'
    mesh.receiveShadow = true
    return mesh
  }

  createGrass(): THREE.Mesh {
    const mesh = new THREE.Mesh(this.grassGeometry, this.grassMaterial)
    mesh.name = 'IslandGrass'
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }

  createRock(): THREE.Mesh {
    const mesh = new THREE.Mesh(this.rockGeometry, this.rockMaterial)
    mesh.name = 'IslandRock'
    mesh.receiveShadow = true
    return mesh
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

  private buildRockKeel(): THREE.BufferGeometry {
    const island = WORLD_CONFIG.island
    const topY = GAME_CONFIG.track.topY
    const top = topY - island.sandTopDrop - island.sandHeight + 0.02
    const centerY = top - island.rockHeight / 2

    const parts: GeometryPart[] = [
      {
        geometry: new THREE.CylinderGeometry(
          island.rockRadiusTop,
          island.rockRadiusBottom,
          island.rockHeight,
          9,
          2,
        ),
        color: PALETTE.rock,
        scale: new THREE.Vector3(1, 1, 2.9),
        position: new THREE.Vector3(0, centerY, 0),
      },
    ]

    const chunkGeometry = new THREE.DodecahedronGeometry(1, 0)

    for (let index = 0; index < 9; index += 1) {
      const side = index % 2 === 0 ? 1 : -1
      const z = -13 + (index / 8) * 26
      const scale = 0.55 + ((index * 37) % 7) * 0.08
      parts.push({
        geometry: chunkGeometry.clone(),
        color: index % 3 === 0 ? PALETTE.rockLight : PALETTE.rockDark,
        position: new THREE.Vector3(
          side * (island.rockRadiusTop - 0.15 - (index % 2) * 0.25),
          top - 0.25 - (index % 3) * 0.3,
          z,
        ),
        scale: new THREE.Vector3(scale, scale * 0.8, scale * 1.35),
        rotation: new THREE.Euler(index * 0.7, index * 1.3, index * 0.4),
      })
    }

    for (let index = 0; index < 4; index += 1) {
      parts.push({
        geometry: new THREE.ConeGeometry(0.9, 2.4, 6),
        color: PALETTE.rockDark,
        position: new THREE.Vector3((index - 1.5) * 1.6, top - island.rockHeight - 0.4, 0),
        rotation: new THREE.Euler(Math.PI, index * 0.5, 0),
      })
    }

    chunkGeometry.dispose()
    return buildGeometry(parts, true)
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
