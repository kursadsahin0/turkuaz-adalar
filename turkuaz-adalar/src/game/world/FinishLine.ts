import * as THREE from 'three'
import type { LoadedAsset } from '../../assets/ModelLoader.ts'
import { GAME_CONFIG } from '../../config/GameConfig.ts'
import { PALETTE } from '../../config/Palette.ts'

/**
 * A level's finish line: two tide beacons (the Blender GLB) flanking the
 * track, a glowing strip across the deck and a banner between the beacons.
 * Purely visual: completion is decided by distance, so it has no collider.
 */
export class FinishLine {
  readonly root = new THREE.Group()

  private readonly stripMaterial: THREE.MeshBasicMaterial
  private readonly bannerMaterial: THREE.MeshStandardMaterial
  private readonly ownedGeometries: THREE.BufferGeometry[] = []
  private readonly ownedMaterials: THREE.Material[] = []

  constructor(scene: THREE.Scene, beacon: LoadedAsset | null) {
    this.root.name = 'FinishLine'
    this.root.visible = false

    const track = GAME_CONFIG.track
    const sideX = track.width / 2 + 0.55
    const beaconHeight =
      beacon && !beacon.bounds.isEmpty()
        ? beacon.bounds.max.y - Math.min(0, beacon.bounds.min.y)
        : 2.04

    for (const side of [-1, 1]) {
      const post = beacon ? this.beaconInstance(beacon) : this.fallbackPost(beaconHeight)
      post.position.set(side * sideX, track.topY, 0)
      this.root.add(post)
    }

    // Checker-free glowing band across the deck, slightly above it to avoid z-fighting.
    this.stripMaterial = this.own(
      new THREE.MeshBasicMaterial({
        color: PALETTE.coin,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    )
    const strip = new THREE.Mesh(
      this.geometry(new THREE.PlaneGeometry(track.width, 0.9)),
      this.stripMaterial,
    )
    strip.rotation.x = -Math.PI / 2
    strip.position.set(0, track.topY + 0.025, 0)
    this.root.add(strip)

    this.bannerMaterial = this.own(
      new THREE.MeshStandardMaterial({
        color: PALETTE.coin,
        emissive: PALETTE.coinDeep,
        emissiveIntensity: 0.6,
        roughness: 0.4,
      }),
    )
    const banner = new THREE.Mesh(
      this.geometry(new THREE.BoxGeometry(sideX * 2, 0.32, 0.12)),
      this.bannerMaterial,
    )
    banner.position.set(0, track.topY + beaconHeight + 0.35, 0)
    banner.castShadow = true
    this.root.add(banner)

    scene.add(this.root)
  }

  /** Places the line at a world Z, or hides it (`null`) for the endless run. */
  setPosition(z: number | null): void {
    this.root.visible = z !== null
    if (z !== null) {
      this.root.position.z = z
    }
  }

  update(elapsed: number): void {
    if (!this.root.visible) {
      return
    }
    const pulse = 0.5 + Math.sin(elapsed * 4) * 0.5
    this.stripMaterial.opacity = 0.55 + pulse * 0.35
    this.bannerMaterial.emissiveIntensity = 0.45 + pulse * 0.4
  }

  dispose(): void {
    this.root.removeFromParent()
    for (const geometry of this.ownedGeometries) {
      geometry.dispose()
    }
    for (const material of this.ownedMaterials) {
      material.dispose()
    }
  }

  /** GLB clones share the cached template's GPU resources: nothing to free. */
  private beaconInstance(asset: LoadedAsset): THREE.Object3D {
    const instance = asset.createInstance({ castShadow: true, receiveShadow: true })
    instance.root.position.y = -Math.min(0, asset.bounds.min.y)
    const holder = new THREE.Group()
    holder.add(instance.root)
    return holder
  }

  private fallbackPost(height: number): THREE.Object3D {
    const post = new THREE.Mesh(
      this.geometry(new THREE.CylinderGeometry(0.16, 0.22, height, 10)),
      this.own(new THREE.MeshStandardMaterial({ color: PALETTE.crateStrap, roughness: 0.6 })),
    )
    post.position.y = height / 2
    post.castShadow = true
    return post
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.ownedGeometries.push(geometry)
    return geometry
  }

  private own<T extends THREE.Material>(material: T): T {
    this.ownedMaterials.push(material)
    return material
  }
}
