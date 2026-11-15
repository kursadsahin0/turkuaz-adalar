import * as THREE from 'three'
import type { LoadedAsset } from '../../assets/ModelLoader.ts'
import { PALETTE } from '../../config/Palette.ts'
import type { CoinVisuals } from './CoinInstancer.ts'
import type { CollectibleKind } from './CollectibleKind.ts'
import { COLLECTIBLE_DEFINITIONS } from './CollectibleKind.ts'

export interface CollectiblePrefab {
  /** Pivot for idle spin and the collection pop animation. */
  readonly root: THREE.Group
  /** Optional additive ring spun independently of the body. */
  readonly halo: THREE.Mesh | null
}

/**
 * Builds every pickup visual from a handful of shared geometries and
 * materials. A prefab is created once per pooled instance, so the track can
 * recycle dozens of coins without touching the GPU allocator.
 */
export class CollectiblePrefabs {
  /** Optional Blender crystal used for relic tokens; procedural otherwise. */
  private readonly crystalModel: LoadedAsset | null

  constructor(crystalModel: LoadedAsset | null = null) {
    this.crystalModel = crystalModel
  }

  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly bodyMaterials = new Map<CollectibleKind, THREE.MeshStandardMaterial>()
  private coinLook: CoinVisuals | null = null

  create(kind: CollectibleKind): CollectiblePrefab {
    const definition = COLLECTIBLE_DEFINITIONS[kind]
    const root = new THREE.Group()
    root.name = `Collectible:${kind}`

    switch (kind) {
      case 'coin':
        this.buildCoin(root, kind)
        break
      case 'token':
        this.buildToken(root, kind)
        break
      case 'shield':
        this.buildShield(root, kind)
        break
      case 'magnet':
        this.buildMagnet(root, kind)
        break
      case 'speed':
        this.buildSpeed(root, kind)
        break
      case 'doubleJump':
        this.buildDoubleJump(root, kind)
        break
      case 'glide':
        this.buildGlide(root, kind)
        break
      case 'slowMo':
        this.buildSlowMo(root, kind)
        break
      case 'reward':
        this.buildReward(root, kind)
        break
    }

    const halo = kind === 'coin' ? null : this.buildHalo(root, kind, kind === 'token' ? 0.42 : 0.44)

    root.scale.setScalar(kind === 'reward' ? 1.15 : 1)
    // Keep the palette authoritative even if a prefab forgets an accent.
    root.userData.color = definition.color
    return { root, halo }
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
    this.bodyMaterials.clear()
    this.coinLook = null
  }

  private bodyMaterial(kind: CollectibleKind): THREE.MeshStandardMaterial {
    const cached = this.bodyMaterials.get(kind)
    if (cached) {
      return cached
    }

    const definition = COLLECTIBLE_DEFINITIONS[kind]
    // Coins sit over a white/turquoise checker deck: a strong pale emissive
    // washes them out to cream, so they get a deep-gold glow instead.
    const isCoin = kind === 'coin'
    const material = new THREE.MeshStandardMaterial({
      color: definition.color,
      emissive: isCoin ? PALETTE.coinDeep : definition.accent,
      emissiveIntensity: isCoin ? 0.38 : 0.85,
      roughness: isCoin ? 0.3 : 0.22,
      metalness: isCoin ? 0.6 : 0.45,
      flatShading: true,
    })
    this.materials.push(material)
    this.bodyMaterials.set(kind, material)
    return material
  }

  private coinRimMaterial(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: PALETTE.coinDeep,
      emissive: PALETTE.coinDeep,
      emissiveIntensity: 0.2,
      roughness: 0.35,
      metalness: 0.55,
    })
    this.materials.push(material)
    return material
  }

  private accentMaterial(color: number, opacity = 0.55): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.materials.push(material)
    return material
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry)
    return geometry
  }

  private mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    castShadow = true,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = castShadow
    return mesh
  }

  /**
   * Coins are drawn by CoinInstancer from one shared body and rim; a coin's
   * own root only carries its transform.
   */
  private buildCoin(root: THREE.Group, _kind: CollectibleKind): void {
    root.userData.instanced = true
  }

  /** The shared coin geometry and materials (created once). */
  coinVisuals(): CoinVisuals {
    if (!this.coinLook) {
      const body = this.geometry(new THREE.CylinderGeometry(0.24, 0.24, 0.055, 16))
      body.rotateX(Math.PI / 2)
      this.coinLook = {
        bodyGeometry: body,
        // A solid darker rim outlines the coin against the bright deck.
        rimGeometry: this.geometry(new THREE.TorusGeometry(0.245, 0.03, 6, 24)),
        bodyMaterial: this.bodyMaterial('coin'),
        rimMaterial: this.coinRimMaterial(),
      }
    }
    return this.coinLook
  }

  private buildToken(root: THREE.Group, kind: CollectibleKind): void {
    if (this.crystalModel) {
      const instance = this.crystalModel.createInstance({ castShadow: true, receiveShadow: false })
      // Centre the authored crystal on the pickup pivot so bobbing/halo line up.
      const center = this.crystalModel.bounds.getCenter(new THREE.Vector3())
      instance.root.position.sub(center)
      root.add(instance.root)
      return
    }

    const crystal = this.mesh(
      this.geometry(new THREE.OctahedronGeometry(0.27, 0)),
      this.bodyMaterial(kind),
    )
    root.add(crystal)

    const core = this.mesh(
      this.geometry(new THREE.OctahedronGeometry(0.13, 0)),
      this.accentMaterial(PALETTE.crystalCore, 0.8),
      false,
    )
    root.add(core)
  }

  private buildShield(root: THREE.Group, kind: CollectibleKind): void {
    const shell = this.mesh(
      this.geometry(new THREE.IcosahedronGeometry(0.3, 1)),
      this.bodyMaterial(kind),
    )
    root.add(shell)

    const dome = this.mesh(
      this.geometry(new THREE.SphereGeometry(0.19, 12, 8)),
      this.accentMaterial(PALETTE.powerShield, 0.4),
      false,
    )
    root.add(dome)
  }

  private buildMagnet(root: THREE.Group, kind: CollectibleKind): void {
    const arc = this.mesh(
      this.geometry(new THREE.TorusGeometry(0.22, 0.075, 8, 18, Math.PI * 1.35)),
      this.bodyMaterial(kind),
    )
    arc.rotation.z = Math.PI * 0.82
    root.add(arc)

    for (const side of [-1, 1]) {
      const pole = this.mesh(
        this.geometry(new THREE.BoxGeometry(0.09, 0.15, 0.15)),
        this.accentMaterial(PALETTE.coinLight, 0.9),
        false,
      )
      pole.position.set(side * 0.2, -0.09, 0)
      root.add(pole)
    }
  }

  private buildSpeed(root: THREE.Group, kind: CollectibleKind): void {
    const tip = this.mesh(
      this.geometry(new THREE.ConeGeometry(0.2, 0.42, 4)),
      this.bodyMaterial(kind),
    )
    tip.rotation.x = -Math.PI / 2
    root.add(tip)

    for (const offset of [0.16, 0.32]) {
      const chevron = this.mesh(
        this.geometry(new THREE.ConeGeometry(0.13, 0.22, 4)),
        this.accentMaterial(PALETTE.coinLight, 0.6),
        false,
      )
      chevron.rotation.x = -Math.PI / 2
      chevron.position.z = offset
      root.add(chevron)
    }
  }

  private buildDoubleJump(root: THREE.Group, kind: CollectibleKind): void {
    for (const [index, y] of [0.13, -0.13].entries()) {
      const gem = this.mesh(
        this.geometry(new THREE.OctahedronGeometry(0.17, 0)),
        index === 0 ? this.bodyMaterial(kind) : this.accentMaterial(PALETTE.crystal, 0.75),
        index === 0,
      )
      gem.position.y = y
      gem.rotation.x = Math.PI * 0.25
      root.add(gem)
    }
  }

  /** A pair of swept wings around a small gem. */
  private buildGlide(root: THREE.Group, kind: CollectibleKind): void {
    const core = this.mesh(
      this.geometry(new THREE.OctahedronGeometry(0.12, 0)),
      this.bodyMaterial(kind),
    )
    root.add(core)
    for (const side of [-1, 1]) {
      const wing = this.mesh(
        this.geometry(new THREE.ConeGeometry(0.11, 0.42, 4)),
        this.accentMaterial(PALETTE.crystal, 0.8),
        false,
      )
      wing.rotation.z = side * Math.PI * 0.42
      wing.position.set(side * 0.22, 0.06, 0)
      root.add(wing)
    }
  }

  /** An hourglass: two cones tip to tip with caps. */
  private buildSlowMo(root: THREE.Group, kind: CollectibleKind): void {
    for (const side of [-1, 1]) {
      const bulb = this.mesh(
        this.geometry(new THREE.ConeGeometry(0.17, 0.24, 8)),
        this.bodyMaterial(kind),
        side > 0,
      )
      bulb.rotation.x = side > 0 ? Math.PI : 0
      bulb.position.y = side * 0.12
      root.add(bulb)
      const cap = this.mesh(
        this.geometry(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 12)),
        this.accentMaterial(PALETTE.coinLight, 0.85),
        false,
      )
      cap.position.y = side * 0.26
      root.add(cap)
    }
  }

  private buildReward(root: THREE.Group, kind: CollectibleKind): void {
    const base = this.mesh(
      this.geometry(new THREE.BoxGeometry(0.52, 0.32, 0.4)),
      this.bodyMaterial(kind),
    )
    root.add(base)

    const lid = this.mesh(
      this.geometry(new THREE.BoxGeometry(0.56, 0.12, 0.44)),
      this.accentMaterial(PALETTE.coinLight, 0.9),
      false,
    )
    lid.position.y = 0.22
    root.add(lid)

    const star = this.mesh(
      this.geometry(new THREE.OctahedronGeometry(0.16, 0)),
      this.accentMaterial(PALETTE.coin, 0.95),
      false,
    )
    star.position.y = 0.46
    root.add(star)
  }

  private buildHalo(root: THREE.Group, kind: CollectibleKind, radius: number): THREE.Mesh {
    const definition = COLLECTIBLE_DEFINITIONS[kind]
    const halo = this.mesh(
      this.geometry(new THREE.TorusGeometry(radius, 0.022, 5, 22)),
      this.accentMaterial(definition.color, 0.45),
      false,
    )
    halo.rotation.x = Math.PI / 2
    root.add(halo)
    return halo
  }
}
