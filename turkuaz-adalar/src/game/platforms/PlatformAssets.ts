import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { GAME_CONFIG } from '../../config/GameConfig.ts'
import { PALETTE } from '../../config/Palette.ts'
import { WORLD_CONFIG } from '../../config/WorldConfig.ts'
import { buildGeometry } from '../world/geometry/AssetGeometry.ts'
import type { GeometryPart } from '../world/geometry/AssetGeometry.ts'

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`
}

/**
 * Paints a crisp, softly lit checker pattern. A two-by-two tile is repeated
 * across the platform, so the whole surface needs a single tiny texture.
 */
export function createCheckerTexture(repeatX: number, repeatY: number): THREE.CanvasTexture {
  const tile = 128
  const canvas = document.createElement('canvas')
  canvas.width = tile * 2
  canvas.height = tile * 2
  paintChecker(canvas, PALETTE.platformTurquoise)

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

/** Paints (or repaints) the 2×2 checker tile with the given accent colour. */
export function paintChecker(canvas: HTMLCanvasElement, accent: number): void {
  const tile = canvas.width / 2
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('A 2D context is required to paint the checker texture.')
  }

  context.fillStyle = cssColor(PALETTE.platformWhite)
  context.fillRect(0, 0, tile * 2, tile * 2)

  context.fillStyle = cssColor(accent)
  context.fillRect(tile, 0, tile, tile)
  context.fillRect(0, tile, tile, tile)

  const tiles = [
    { x: 0, y: 0, light: 0.1, shade: 0.035 },
    { x: tile, y: 0, light: 0.2, shade: 0.05 },
    { x: 0, y: tile, light: 0.2, shade: 0.05 },
    { x: tile, y: tile, light: 0.1, shade: 0.035 },
  ]

  for (const entry of tiles) {
    const gradient = context.createLinearGradient(entry.x, entry.y, entry.x + tile, entry.y + tile)
    gradient.addColorStop(0, `rgba(255, 255, 255, ${entry.light})`)
    gradient.addColorStop(1, `rgba(0, 0, 0, ${entry.shade})`)
    context.fillStyle = gradient
    context.fillRect(entry.x, entry.y, tile, tile)
  }

  context.strokeStyle = 'rgba(12, 105, 108, 0.16)'
  context.lineWidth = 2
  context.strokeRect(0, 0, tile * 2, tile * 2)
  context.beginPath()
  context.moveTo(tile, 0)
  context.lineTo(tile, tile * 2)
  context.moveTo(0, tile)
  context.lineTo(tile * 2, tile)
  context.stroke()
}

/**
 * Shared track-platform art: checker surface, white/turquoise frame and the
 * rotating yellow mechanisms that line the grass banks. Every segment reuses
 * these GPU resources, keeping the streamed track cheap to draw.
 */
export class PlatformAssets {
  readonly checkerMaterial: THREE.MeshStandardMaterial
  readonly detailMaterial: THREE.MeshStandardMaterial
  readonly mechanismMaterial: THREE.MeshStandardMaterial

  private readonly checkerGeometry: THREE.BufferGeometry
  private readonly detailGeometry: THREE.BufferGeometry
  private readonly mechanismGeometry: THREE.BufferGeometry
  private readonly checkerTexture: THREE.CanvasTexture

  private readonly preparedGeometries: THREE.BufferGeometry[] = []
  private readonly preparedMaterials: THREE.Material[] = []

  constructor() {
    const platform = WORLD_CONFIG.platform
    const topY = GAME_CONFIG.track.topY

    this.checkerTexture = createCheckerTexture(platform.checkerRepeatX, platform.checkerRepeatY)

    this.checkerMaterial = new THREE.MeshStandardMaterial({
      map: this.checkerTexture,
      roughness: 0.46,
      metalness: 0.04,
    })
    this.detailMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.06,
    })
    this.mechanismMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.36,
      metalness: 0.24,
      emissive: PALETTE.mechanismGold,
      emissiveIntensity: 0.08,
    })
    this.preparedMaterials.push(this.checkerMaterial, this.detailMaterial, this.mechanismMaterial)

    this.checkerGeometry = this.trackGeometry(
      new RoundedBoxGeometry(
        platform.checkerWidth,
        platform.checkerHeight,
        platform.checkerLength,
        2,
        0.07,
      ),
    )
    this.checkerGeometry.translate(0, topY - platform.checkerHeight / 2, 0)
    this.checkerGeometry.computeBoundingSphere()

    const rimTop = topY - platform.rimTopDrop
    const trimTop = topY - platform.trimTopDrop
    const halfLength = GAME_CONFIG.track.segmentLength / 2
    const studsPerSide = Math.max(2, Math.floor(platform.rimLength / platform.studSpacing))

    const parts: GeometryPart[] = [
      {
        geometry: new RoundedBoxGeometry(
          platform.rimWidth,
          platform.rimHeight,
          platform.rimLength,
          3,
          0.12,
        ),
        color: PALETTE.platformWhite,
        position: new THREE.Vector3(0, rimTop - platform.rimHeight / 2, 0),
      },
      {
        geometry: new RoundedBoxGeometry(
          platform.trimWidth,
          platform.trimHeight,
          platform.rimLength - 0.12,
          2,
          0.06,
        ),
        color: PALETTE.platformTurquoiseDeep,
        position: new THREE.Vector3(0, trimTop - platform.trimHeight / 2, 0),
      },
    ]

    for (const side of [-1, 1] as const) {
      parts.push({
        geometry: new THREE.BoxGeometry(
          platform.stripeWidth,
          platform.stripeHeight,
          platform.rimLength - 0.4,
        ),
        color: PALETTE.platformTurquoise,
        position: new THREE.Vector3(
          side * platform.stripeOffsetX,
          rimTop + platform.stripeHeight / 2,
          0,
        ),
      })
    }

    for (let index = 0; index < studsPerSide; index += 1) {
      const z = -halfLength + (index + 0.5) * (GAME_CONFIG.track.segmentLength / studsPerSide)

      for (const side of [-1, 1] as const) {
        parts.push({
          geometry: new THREE.CylinderGeometry(
            platform.studRadius,
            platform.studRadius,
            platform.stripeHeight * 1.4,
            10,
          ),
          color: PALETTE.mechanismYellow,
          position: new THREE.Vector3(
            side * platform.stripeOffsetX,
            rimTop + platform.stripeHeight * 0.7,
            z,
          ),
        })
      }
    }

    this.detailGeometry = this.trackGeometry(buildGeometry(parts, true))

    this.mechanismGeometry = this.trackGeometry(this.buildMechanismGeometry())
  }

  createMechanism(): THREE.Mesh {
    const mesh = new THREE.Mesh(this.mechanismGeometry, this.mechanismMaterial)
    mesh.name = 'PlatformMechanism'
    mesh.receiveShadow = true
    return mesh
  }

  createCheckerTop(): THREE.Mesh {
    const mesh = new THREE.Mesh(this.checkerGeometry, this.checkerMaterial)
    mesh.name = 'CheckerSurface'
    mesh.receiveShadow = true
    return mesh
  }

  createDetails(): THREE.Mesh {
    const mesh = new THREE.Mesh(this.detailGeometry, this.detailMaterial)
    mesh.name = 'PlatformFrame'
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }

  /** Recolours the accent checker tiles in place; `null` restores turquoise. */
  setTrackAccent(accent: number | null): void {
    const canvas = this.checkerTexture.image as HTMLCanvasElement
    paintChecker(canvas, accent ?? PALETTE.platformTurquoise)
    this.checkerTexture.needsUpdate = true
  }

  dispose(): void {
    for (const geometry of this.preparedGeometries) {
      geometry.dispose()
    }
    for (const material of this.preparedMaterials) {
      material.dispose()
    }
    this.checkerTexture.dispose()
    this.preparedGeometries.length = 0
    this.preparedMaterials.length = 0
  }

  private buildMechanismGeometry(): THREE.BufferGeometry {
    const radius = WORLD_CONFIG.platform.mechanismRadius
    const parts: GeometryPart[] = [
      {
        geometry: new THREE.CylinderGeometry(radius * 0.8, radius * 0.8, 0.09, 22),
        color: PALETTE.mechanismYellow,
      },
      {
        geometry: new THREE.TorusGeometry(radius * 1.02, 0.045, 6, 24),
        color: PALETTE.mechanismGold,
        rotation: new THREE.Euler(Math.PI / 2, 0, 0),
        position: new THREE.Vector3(0, 0.035, 0),
      },
      {
        geometry: new THREE.CylinderGeometry(radius * 0.26, radius * 0.3, 0.14, 12),
        color: PALETTE.mechanismGlow,
        position: new THREE.Vector3(0, 0.045, 0),
      },
      {
        geometry: new THREE.TorusGeometry(radius * 0.52, 0.038, 5, 18),
        color: PALETTE.mechanismGold,
        rotation: new THREE.Euler(Math.PI / 2, 0, 0),
        position: new THREE.Vector3(0, 0.05, 0),
      },
    ]

    const teeth = 10
    for (let index = 0; index < teeth; index += 1) {
      const angle = (index / teeth) * Math.PI * 2
      const toothRadius = radius * 0.92
      parts.push({
        geometry: new THREE.BoxGeometry(radius * 0.3, 0.075, radius * 0.22),
        color: PALETTE.mechanismGold,
        position: new THREE.Vector3(
          Math.cos(angle) * toothRadius,
          0,
          -Math.sin(angle) * toothRadius,
        ),
        rotation: new THREE.Euler(0, angle, 0),
      })
    }

    return buildGeometry(parts, true)
  }

  private trackGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.preparedGeometries.push(geometry)
    return geometry
  }
}
