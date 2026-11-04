import * as THREE from 'three'
import {
  CHARACTER_ACCESSORIES,
  CHARACTER_COLORS,
  CHARACTER_SKINS,
  CHARACTERS,
  type CharacterCustomization,
} from './CharacterData.ts'

/**
 * Resolved, purely visual description of how the runner should look.
 * `null` colours mean "keep the colour authored in Blender".
 */
export interface CharacterAppearance {
  readonly bodyColor: number | null
  readonly accentColor: number | null
  readonly outfit: OutfitPalette | null
  readonly accessories: readonly string[]
}

export interface OutfitPalette {
  readonly shorts: number
  readonly cream: number
  readonly creamDark: number
  readonly leather: number
}

/** Outfits carry no colour in their data, so their palettes live here. */
const OUTFIT_PALETTES: Readonly<Record<string, OutfitPalette>> = {
  'outfit-explorer': { shorts: 0x7f7444, cream: 0xe4cf9c, creamDark: 0xbfa772, leather: 0x5e3f24 },
  'outfit-diver': { shorts: 0x1d3a5a, cream: 0x2f4c63, creamDark: 0x1f3445, leather: 0x14262a },
  'outfit-formal': { shorts: 0x262839, cream: 0xf3f3f6, creamDark: 0xc8c8d2, leather: 0x1c1c22 },
}

/** Maps equipped ids to a visual description. Unknown ids fall back to defaults. */
export function resolveAppearance(equipped: CharacterCustomization): CharacterAppearance {
  const character = CHARACTERS.find((entry) => entry.id === equipped.characterId)
  const chosenSkin = CHARACTER_SKINS.find((skin) => skin.id === equipped.skinId)
  // An explicit skin wins; otherwise the character's signature skin is used.
  const skin =
    chosenSkin && !chosenSkin.isDefault
      ? chosenSkin
      : CHARACTER_SKINS.find((entry) => entry.id === character?.defaultSkin)
  const color = CHARACTER_COLORS.find((entry) => entry.id === equipped.colorId)

  return {
    bodyColor: skin && !skin.isDefault ? skin.color : null,
    accentColor: color && !color.isDefault ? color.color : null,
    outfit: OUTFIT_PALETTES[equipped.outfitId] ?? null,
    accessories: equipped.accessoryIds.filter((id) =>
      CHARACTER_ACCESSORIES.some((entry) => entry.id === id && !entry.isDefault),
    ),
  }
}

/** Bind-pose landmarks measured from the GLB, in character-root space. */
interface CharacterAnchors {
  readonly headCenter: THREE.Vector3
  readonly headRadius: number
  readonly headTop: number
  readonly eyeCenter: THREE.Vector3
  readonly neck: THREE.Vector3
  readonly backpackCenter: THREE.Vector3
  readonly backpackSize: THREE.Vector3
  /** +1 when the face points along +Z, -1 along -Z. */
  readonly forward: number
}

const MATERIAL_SLOTS = {
  body: 'TK_Mat_Jacket',
  bodyDark: 'TK_Mat_JacketDark',
  accent: 'TK_Mat_Coral',
  accentDark: 'TK_Mat_Gold',
  shorts: 'TK_Mat_Shorts',
  cream: 'TK_Mat_Cream',
  creamDark: 'TK_Mat_CreamDark',
  leather: 'TK_Mat_Leather',
} as const

type MaterialSlot = keyof typeof MATERIAL_SLOTS

/**
 * Applies cosmetics to one cloned character. Materials are cloned per
 * instance so recolouring never leaks into the shared GLB template, and
 * accessories are parented to bones so they follow every animation.
 */
export class CharacterDresser {
  private readonly slots = new Map<MaterialSlot, { material: THREE.MeshStandardMaterial; original: THREE.Color }>()
  private readonly ownedMaterials: THREE.Material[] = []
  private readonly accessoryMaterials = new Map<number, THREE.MeshStandardMaterial>()
  private readonly accessories = new Map<string, THREE.Object3D>()
  private readonly anchors: CharacterAnchors | null
  private readonly bones: { head: THREE.Object3D | null; neck: THREE.Object3D | null; chest: THREE.Object3D | null }
  private readonly characterRoot: THREE.Object3D

  constructor(characterRoot: THREE.Object3D, modelRoot: THREE.Object3D) {
    this.characterRoot = characterRoot
    this.cloneMaterials(modelRoot)
    characterRoot.updateMatrixWorld(true)
    this.bones = {
      head: modelRoot.getObjectByName('head') ?? null,
      neck: modelRoot.getObjectByName('neck') ?? null,
      chest: modelRoot.getObjectByName('chest') ?? null,
    }
    this.anchors = measureAnchors(characterRoot, modelRoot, this.bones.neck, this.bones.head)

    // Accessories are fitted once, in the bind pose, before any animation
    // moves the bones. Equipping later only toggles visibility.
    for (const accessory of CHARACTER_ACCESSORIES) {
      if (accessory.isDefault) {
        continue
      }
      const built = this.buildAccessory(accessory.id)
      if (built) {
        built.visible = false
        this.accessories.set(accessory.id, built)
      }
    }
  }

  apply(appearance: CharacterAppearance): void {
    this.setSlot('body', appearance.bodyColor)
    this.setSlot('bodyDark', shade(appearance.bodyColor, -0.16))
    this.setSlot('accent', appearance.accentColor)
    this.setSlot('accentDark', shade(appearance.accentColor, -0.1))
    this.setSlot('shorts', appearance.outfit?.shorts ?? null)
    this.setSlot('cream', appearance.outfit?.cream ?? null)
    this.setSlot('creamDark', appearance.outfit?.creamDark ?? null)
    this.setSlot('leather', appearance.outfit?.leather ?? null)

    for (const [id, object] of this.accessories) {
      object.visible = appearance.accessories.includes(id)
    }
  }

  dispose(): void {
    for (const object of this.accessories.values()) {
      object.removeFromParent()
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
        }
      })
    }
    this.accessories.clear()
    for (const material of this.accessoryMaterials.values()) {
      material.dispose()
    }
    this.accessoryMaterials.clear()
    for (const material of this.ownedMaterials) {
      material.dispose()
    }
    this.ownedMaterials.length = 0
    this.slots.clear()
  }

  private cloneMaterials(modelRoot: THREE.Object3D): void {
    const wanted = new Map<string, MaterialSlot>(
      (Object.entries(MATERIAL_SLOTS) as [MaterialSlot, string][]).map(([slot, name]) => [name, slot]),
    )
    const clones = new Map<THREE.Material, THREE.Material>()

    modelRoot.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return
      }
      const replace = (material: THREE.Material): THREE.Material => {
        const slot = wanted.get(material.name)
        if (!slot || !(material instanceof THREE.MeshStandardMaterial)) {
          return material
        }
        let clone = clones.get(material) as THREE.MeshStandardMaterial | undefined
        if (!clone) {
          clone = material.clone()
          clones.set(material, clone)
          this.ownedMaterials.push(clone)
          this.slots.set(slot, { material: clone, original: material.color.clone() })
        }
        return clone
      }
      object.material = Array.isArray(object.material)
        ? object.material.map(replace)
        : replace(object.material)
    })
  }

  private setSlot(slot: MaterialSlot, color: number | null): void {
    const entry = this.slots.get(slot)
    if (!entry) {
      return
    }
    if (color === null) {
      entry.material.color.copy(entry.original)
    } else {
      entry.material.color.setHex(color, THREE.SRGBColorSpace)
    }
  }

  private material(color: number, options: { transparent?: boolean; opacity?: number } = {}): THREE.MeshStandardMaterial {
    const key = color + (options.opacity ?? 1) * 0x1000000
    let material = this.accessoryMaterials.get(key)
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.62,
        metalness: 0.04,
        transparent: options.transparent ?? false,
        opacity: options.opacity ?? 1,
        side: options.transparent ? THREE.DoubleSide : THREE.FrontSide,
      })
      this.accessoryMaterials.set(key, material)
    }
    return material
  }

  private buildAccessory(id: string): THREE.Object3D | null {
    const anchors = this.anchors
    if (!anchors) {
      return null
    }

    const group = new THREE.Group()
    group.name = `Accessory:${id}`
    const f = anchors.forward
    const r = anchors.headRadius
    let parent: THREE.Object3D | null = null

    switch (id) {
      case 'acc-cap': {
        const crown = new THREE.Mesh(
          new THREE.SphereGeometry(r * 1.04, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
          this.material(0xc89b5a),
        )
        crown.scale.set(1, 0.72, 1)
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.78, r * 0.06, 20, 1, false, 0, Math.PI), this.material(0x8f6a37))
        brim.rotation.y = f > 0 ? -Math.PI / 2 : Math.PI / 2
        brim.position.set(0, 0, f * r * 0.62)
        group.add(crown, brim)
        group.position.set(anchors.headCenter.x, anchors.headTop - r * 0.62, anchors.headCenter.z)
        parent = this.bones.head
        break
      }
      case 'acc-goggles': {
        const band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, r * 0.06, 6, 28), this.material(0x2b2b33))
        band.rotation.x = Math.PI / 2
        band.position.z = -anchors.eyeCenter.z + anchors.headCenter.z
        const lensMaterial = this.material(0x7fe8ff, { transparent: true, opacity: 0.72 })
        const rimMaterial = this.material(0xd99a2b)
        for (const side of [-1, 1]) {
          const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.22, r * 0.05, 6, 18), rimMaterial)
          const lens = new THREE.Mesh(new THREE.CircleGeometry(r * 0.21, 18), lensMaterial)
          rim.position.set(side * r * 0.28, 0, f * r * 0.04)
          lens.position.set(side * r * 0.28, 0, f * r * 0.05)
          if (f < 0) {
            lens.rotation.y = Math.PI
          }
          group.add(rim, lens)
        }
        group.add(band)
        group.position.copy(anchors.eyeCenter)
        group.position.z += f * r * 0.06
        parent = this.bones.head
        break
      }
      case 'acc-bandana': {
        const scarf = new THREE.Mesh(new THREE.TorusGeometry(r * 0.6, r * 0.17, 8, 24), this.material(0xf4a259))
        scarf.rotation.x = Math.PI / 2
        const knot = new THREE.Mesh(new THREE.ConeGeometry(r * 0.22, r * 0.42, 4), this.material(0xd9822b))
        knot.position.set(0, -r * 0.2, f * r * 0.6)
        knot.rotation.x = Math.PI
        group.add(scarf, knot)
        group.position.copy(anchors.neck)
        parent = this.bones.neck ?? this.bones.chest
        break
      }
      case 'acc-backpack': {
        const size = anchors.backpackSize
        const roll = new THREE.Mesh(
          new THREE.CylinderGeometry(size.y * 0.2, size.y * 0.2, size.x * 1.15, 14),
          this.material(0x3f7d58),
        )
        roll.rotation.z = Math.PI / 2
        const strap = new THREE.Mesh(
          new THREE.TorusGeometry(size.y * 0.21, size.y * 0.03, 4, 16),
          this.material(0x523222),
        )
        strap.rotation.y = Math.PI / 2
        group.add(roll, strap)
        group.position.set(
          anchors.backpackCenter.x,
          anchors.backpackCenter.y + size.y * 0.62,
          anchors.backpackCenter.z,
        )
        parent = this.bones.chest
        break
      }
      case 'acc-wings': {
        const shape = new THREE.Shape()
        shape.moveTo(0, 0)
        shape.bezierCurveTo(0.25, 0.32, 0.72, 0.38, 1, 0.2)
        shape.bezierCurveTo(0.78, 0.02, 0.5, -0.22, 0, 0)
        const geometry = new THREE.ShapeGeometry(shape, 10)
        const span = r * 2.4
        const wingMaterial = this.material(0xf1faee, { transparent: true, opacity: 0.88 })
        for (const side of [-1, 1]) {
          const wing = new THREE.Mesh(side < 0 ? geometry : geometry.clone(), wingMaterial)
          wing.scale.set(side * span, span, span)
          wing.rotation.y = side * f * 0.45
          group.add(wing)
        }
        const back = anchors.backpackCenter
        group.position.set(back.x, back.y + anchors.backpackSize.y * 0.18, back.z - f * anchors.backpackSize.z * 0.5)
        parent = this.bones.chest
        break
      }
      default:
        return null
    }

    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
      }
    })

    // Positions above are in character-root space at bind pose. attach() keeps
    // that world transform while re-parenting onto the animated bone.
    this.characterRoot.updateMatrixWorld(true)
    group.applyMatrix4(this.characterRoot.matrixWorld)
    ;(parent ?? this.characterRoot).attach(group)
    return group
  }
}

function shade(color: number | null, lightness: number): number | null {
  if (color === null) {
    return null
  }
  const hsl = { h: 0, s: 0, l: 0 }
  const value = new THREE.Color(color)
  value.getHSL(hsl)
  value.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + lightness, 0, 1))
  return value.getHex()
}

/**
 * Measures head, eye, neck and backpack landmarks from bind-pose vertices,
 * so accessories fit the authored mesh instead of hard-coded numbers.
 */
function measureAnchors(
  characterRoot: THREE.Object3D,
  modelRoot: THREE.Object3D,
  neckBone: THREE.Object3D | null,
  headBone: THREE.Object3D | null,
): CharacterAnchors | null {
  const toRoot = new THREE.Matrix4().copy(characterRoot.matrixWorld).invert()
  const neck = new THREE.Vector3()
  if (neckBone) {
    neckBone.getWorldPosition(neck).applyMatrix4(toRoot)
  }
  // The head starts at the head bone; fall back to the neck when it is missing.
  const headBase = neck.clone()
  if (headBone) {
    headBone.getWorldPosition(headBase).applyMatrix4(toRoot)
  }
  const hasHeadBase = headBone !== null || neckBone !== null

  const head = new THREE.Box3()
  const eyes = new THREE.Box3()
  const backpack = new THREE.Box3()
  const all = new THREE.Box3()
  const point = new THREE.Vector3()
  const matrix = new THREE.Matrix4()

  modelRoot.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return
    }
    const geometry = object.geometry as THREE.BufferGeometry
    const position = geometry.getAttribute('position')
    if (!position) {
      return
    }
    matrix.multiplyMatrices(toRoot, object.matrixWorld)
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const groups = geometry.groups.length > 0
      ? geometry.groups
      : [{ start: 0, count: geometry.index ? geometry.index.count : position.count, materialIndex: 0 }]
    const index = geometry.index

    for (const group of groups) {
      const name = materials[group.materialIndex ?? 0]?.name ?? ''
      const isEye = name === 'TK_Mat_EyeWhite'
      const isPack = name === 'TK_Mat_Backpack'
      const end = group.start + group.count
      for (let i = group.start; i < end; i += 1) {
        const vertex = index ? index.getX(i) : i
        point.fromBufferAttribute(position, vertex).applyMatrix4(matrix)
        all.expandByPoint(point)
        if (hasHeadBase && point.y > headBase.y) {
          head.expandByPoint(point)
        }
        if (isEye) {
          eyes.expandByPoint(point)
        }
        if (isPack) {
          backpack.expandByPoint(point)
        }
      }
    }
  })

  if (all.isEmpty()) {
    return null
  }
  if (head.isEmpty()) {
    // No neck bone: assume the top 30% of the figure is the head.
    const size = all.getSize(new THREE.Vector3())
    head.set(new THREE.Vector3(all.min.x, all.max.y - size.y * 0.3, all.min.z), all.max.clone())
    neck.set((all.min.x + all.max.x) / 2, all.max.y - size.y * 0.3, (all.min.z + all.max.z) / 2)
  }

  const headCenter = head.getCenter(new THREE.Vector3())
  const headSize = head.getSize(new THREE.Vector3())
  const headRadius = headSize.x * 0.5
  const eyeCenter = eyes.isEmpty()
    ? headCenter.clone().add(new THREE.Vector3(0, 0, headRadius * 0.8))
    : eyes.getCenter(new THREE.Vector3())
  const forward = eyeCenter.z >= headCenter.z ? 1 : -1
  const backpackCenter = backpack.isEmpty()
    ? new THREE.Vector3(headCenter.x, (all.min.y + all.max.y) * 0.55, headCenter.z - forward * headRadius * 0.7)
    : backpack.getCenter(new THREE.Vector3())
  const backpackSize = backpack.isEmpty()
    ? new THREE.Vector3(headRadius, headRadius, headRadius * 0.5)
    : backpack.getSize(new THREE.Vector3())

  return {
    headCenter,
    headRadius,
    headTop: head.max.y,
    eyeCenter,
    // Just under the chin, above the jacket collar.
    neck: new THREE.Vector3(headCenter.x, headBase.y - headRadius * 0.08, headCenter.z),
    backpackCenter,
    backpackSize,
    forward,
  }
}
