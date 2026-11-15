import * as THREE from 'three'
import {
  CHARACTER_ACCESSORIES,
  CHARACTER_COLORS,
  CHARACTER_MODELS,
  CHARACTER_SKINS,
  CHARACTERS,
  type CharacterCustomization,
  type CharacterModelId,
} from './CharacterData.ts'

/**
 * Resolved, purely visual description of how the runner should look.
 * `null` colours mean "keep the colour authored in Blender".
 */
export interface CharacterAppearance {
  /** Which body of the character GLB is shown. */
  readonly model: CharacterModelId
  readonly bodyColor: number | null
  readonly accentColor: number | null
  readonly outfit: OutfitPalette | null
  readonly accessories: readonly string[]
  readonly hairColor: number | null
  /** Visual body scale; the physics capsule is unaffected. */
  readonly build: { readonly width: number; readonly height: number }
}

export interface OutfitPalette {
  readonly shorts: number
  readonly cream: number
  readonly creamDark: number
  readonly leather: number
}

/** Outfits carry no colour in their data, so their palettes live here. */
export const OUTFIT_PALETTES: Readonly<Record<string, OutfitPalette>> = {
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
    model: character?.build.model ?? 'runner',
    bodyColor: skin && !skin.isDefault ? skin.color : null,
    accentColor: color && !color.isDefault ? color.color : null,
    outfit: OUTFIT_PALETTES[equipped.outfitId] ?? null,
    accessories: equipped.accessoryIds.filter((id) =>
      CHARACTER_ACCESSORIES.some((entry) => entry.id === id && !entry.isDefault),
    ),
    hairColor: character?.build.hairColor ?? null,
    build: { width: character?.build.width ?? 1, height: character?.build.height ?? 1 },
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

/** An atlas swatch: row from the top, column from the left (8 x 4 grid). */
type Cell = readonly [row: number, column: number]
type PaintSlot = 'body' | 'accent' | 'shorts' | 'boots' | 'leather' | 'hair'

const ATLAS_COLUMNS = 8
const ATLAS_ROWS = 4

/** Mage coat, hat and cape; shared by the hatted and bare-headed mages. */
const MAGE_CELLS: Partial<Record<PaintSlot, readonly Cell[]>> = {
  body: [
    [1, 0],
    [1, 1],
  ],
  accent: [[1, 2]],
  shorts: [[1, 7]],
  boots: [[2, 3]],
  leather: [[0, 5]],
  hair: [[0, 1]],
}

/** Knight armour (skins paint it), cape (colours paint it) and straps. */
const KNIGHT_CELLS: Partial<Record<PaintSlot, readonly Cell[]>> = {
  body: [[0, 3]],
  accent: [[1, 0]],
  shorts: [[1, 7]],
  leather: [[0, 6]],
  hair: [[0, 1]],
}

/**
 * Which colour swatches of each body's texture atlas a cosmetic recolours.
 * Measured from the KayKit meshes' UVs (see blender/build_kaykit_characters.py).
 */
const PAINT_CELLS: Readonly<Record<CharacterModelId, Partial<Record<PaintSlot, readonly Cell[]>>>> =
  {
    runner: {
      body: [[1, 0]],
      accent: [[1, 1]],
      shorts: [[1, 7]],
      boots: [[2, 3]],
      leather: [
        [0, 5],
        [0, 6],
        [2, 5],
      ],
      hair: [[0, 1]],
    },
    swift: {
      body: [[1, 0]],
      accent: [[1, 1]],
      shorts: [[1, 7]],
      boots: [[2, 3]],
      leather: [
        [0, 5],
        [0, 6],
        [2, 5],
      ],
      hair: [[0, 1]],
    },
    ocean: {
      body: [
        [1, 0],
        [2, 2],
      ],
      accent: [[1, 1]],
      shorts: [[1, 7]],
      boots: [[2, 3]],
      leather: [[0, 6]],
      hair: [[0, 1]],
    },
    mage: MAGE_CELLS,
    sage: MAGE_CELLS,
    knight: KNIGHT_CELLS,
    guardian: KNIGHT_CELLS,
  }

/**
 * Accessories a body's own headgear would clip through: the mage's hat, the
 * knight's visored helmet and the swift runner's hood. They stay owned and
 * equipped, and reappear on any other runner.
 */
export const HIDDEN_BY_HEADGEAR: Partial<Record<CharacterModelId, readonly string[]>> = {
  mage: ['acc-cap'],
  knight: ['acc-cap', 'acc-goggles'],
  swift: ['acc-cap'],
}

const MODEL_PREFIX = 'TK_Char_'
/** The game runs along -Z, so faces point that way. */
const FACE_FORWARD = -1

/**
 * Applies cosmetics to one cloned character: shows the chosen body, repaints
 * its texture atlas for skins/colours/outfits, and toggles accessories fitted
 * to that body. Materials and painted textures are per instance, so nothing
 * leaks into the shared GLB template.
 */
export class CharacterDresser {
  private readonly bodies = new Map<CharacterModelId, THREE.Object3D[]>()
  private readonly painters = new Map<CharacterModelId, AtlasPainter>()
  private readonly ownedMaterials: THREE.Material[] = []
  private readonly accessoryMaterials = new Map<number, THREE.MeshStandardMaterial>()
  /** model -> accessory id -> fitted object. */
  private readonly accessories = new Map<CharacterModelId, Map<string, THREE.Object3D>>()
  private readonly bones: { head: THREE.Object3D | null; chest: THREE.Object3D | null }
  private readonly characterRoot: THREE.Object3D

  constructor(characterRoot: THREE.Object3D, modelRoot: THREE.Object3D) {
    this.characterRoot = characterRoot
    characterRoot.updateMatrixWorld(true)
    this.bones = {
      head: modelRoot.getObjectByName('head') ?? null,
      chest: modelRoot.getObjectByName('chest') ?? null,
    }
    this.collectBodies(modelRoot)

    // Accessories are fitted once per body, in the bind pose, before any
    // animation moves the bones. Equipping later only toggles visibility.
    for (const [model, objects] of this.bodies) {
      const anchors = measureAnchors(characterRoot, objects, this.bones.head)
      const fitted = new Map<string, THREE.Object3D>()
      for (const accessory of CHARACTER_ACCESSORIES) {
        if (accessory.isDefault || !anchors) {
          continue
        }
        const built = this.buildAccessory(accessory.id, anchors)
        if (built) {
          built.visible = false
          fitted.set(accessory.id, built)
        }
      }
      this.accessories.set(model, fitted)
    }
  }

  apply(appearance: CharacterAppearance): void {
    for (const [model, objects] of this.bodies) {
      for (const object of objects) {
        object.visible = model === appearance.model
      }
    }
    const hidden = HIDDEN_BY_HEADGEAR[appearance.model] ?? []
    for (const [model, fitted] of this.accessories) {
      for (const [id, object] of fitted) {
        object.visible =
          model === appearance.model && appearance.accessories.includes(id) && !hidden.includes(id)
      }
    }
    const cells = PAINT_CELLS[appearance.model]
    const outfit = appearance.outfit
    this.painters.get(appearance.model)?.paint([
      [cells.body, appearance.bodyColor],
      [cells.accent, appearance.accentColor],
      [cells.shorts, outfit?.shorts ?? null],
      [cells.boots, outfit?.cream ?? null],
      [cells.leather, outfit?.leather ?? null],
      [cells.hair, appearance.hairColor],
    ])
  }

  dispose(): void {
    for (const fitted of this.accessories.values()) {
      for (const object of fitted.values()) {
        object.removeFromParent()
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose()
          }
        })
      }
    }
    this.accessories.clear()
    for (const material of this.accessoryMaterials.values()) {
      material.dispose()
    }
    this.accessoryMaterials.clear()
    for (const painter of this.painters.values()) {
      painter.dispose()
    }
    this.painters.clear()
    for (const material of this.ownedMaterials) {
      material.dispose()
    }
    this.ownedMaterials.length = 0
    this.bodies.clear()
  }

  /** Groups the GLB's `TK_Char_<model>*` objects and clones their materials. */
  private collectBodies(modelRoot: THREE.Object3D): void {
    const clones = new Map<THREE.Material, THREE.MeshStandardMaterial>()
    modelRoot.traverse((object) => {
      const model = modelOf(object.name)
      if (!model) {
        return
      }
      const list = this.bodies.get(model) ?? []
      list.push(object)
      this.bodies.set(model, list)
      if (
        !(object instanceof THREE.Mesh) ||
        !(object.material instanceof THREE.MeshStandardMaterial)
      ) {
        return
      }
      let clone = clones.get(object.material)
      if (!clone) {
        clone = object.material.clone()
        // Matte, painted look: the glossy export mirrored the turquoise sea.
        clone.metalness = 0
        clone.roughness = Math.max(clone.roughness, 0.85)
        clones.set(object.material, clone)
        this.ownedMaterials.push(clone)
        if (!this.painters.has(model)) {
          this.painters.set(model, new AtlasPainter(clone))
        }
      }
      object.material = clone
    })
  }

  private material(
    color: number,
    options: { transparent?: boolean; opacity?: number } = {},
  ): THREE.MeshStandardMaterial {
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

  private buildAccessory(id: string, anchors: CharacterAnchors): THREE.Object3D | null {
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
        const brim = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.78, r * 0.78, r * 0.06, 20, 1, false, 0, Math.PI),
          this.material(0x8f6a37),
        )
        brim.rotation.y = f > 0 ? -Math.PI / 2 : Math.PI / 2
        brim.position.set(0, 0, f * r * 0.62)
        group.add(crown, brim)
        group.position.set(anchors.headCenter.x, anchors.headTop - r * 0.62, anchors.headCenter.z)
        parent = this.bones.head
        break
      }
      case 'acc-goggles': {
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(r * 0.98, r * 0.06, 6, 28),
          this.material(0x2b2b33),
        )
        band.rotation.x = Math.PI / 2
        band.position.z = -anchors.eyeCenter.z + anchors.headCenter.z
        const lensMaterial = this.material(0x7fe8ff, { transparent: true, opacity: 0.72 })
        const rimMaterial = this.material(0xd99a2b)
        for (const side of [-1, 1]) {
          const rim = new THREE.Mesh(
            new THREE.TorusGeometry(r * 0.22, r * 0.05, 6, 18),
            rimMaterial,
          )
          const lens = new THREE.Mesh(new THREE.CircleGeometry(r * 0.21, 18), lensMaterial)
          rim.position.set(side * r * 0.32, 0, f * r * 0.04)
          lens.position.set(side * r * 0.32, 0, f * r * 0.05)
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
        const scarf = new THREE.Mesh(
          new THREE.TorusGeometry(r * 0.6, r * 0.17, 8, 24),
          this.material(0xf4a259),
        )
        scarf.rotation.x = Math.PI / 2
        const knot = new THREE.Mesh(
          new THREE.ConeGeometry(r * 0.22, r * 0.42, 4),
          this.material(0xd9822b),
        )
        knot.position.set(0, -r * 0.2, f * r * 0.6)
        knot.rotation.x = Math.PI
        group.add(scarf, knot)
        group.position.copy(anchors.neck)
        parent = this.bones.chest
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
        group.position.set(
          back.x,
          back.y + anchors.backpackSize.y * 0.18,
          back.z - f * anchors.backpackSize.z * 0.5,
        )
        parent = this.bones.chest
        break
      }
      default:
        return null
    }

    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Translucent pieces (goggle lenses, wings) would cast solid shadows.
        child.castShadow = !(child.material instanceof THREE.Material && child.material.transparent)
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

function modelOf(name: string): CharacterModelId | null {
  if (!name.startsWith(MODEL_PREFIX)) {
    return null
  }
  const rest = name.slice(MODEL_PREFIX.length)
  for (const model of CHARACTER_MODELS) {
    if (rest === model || rest.startsWith(`${model}_`)) {
      return model
    }
  }
  return null
}

/**
 * Repaints swatches of a palette-atlas texture (every KayKit texture is an
 * 8 x 4 grid of vertical gradients). Each swatch keeps its own gradient,
 * scaled to the new colour. Without a DOM (tests, SSR) it does nothing.
 */
class AtlasPainter {
  private readonly material: THREE.MeshStandardMaterial
  private readonly original: THREE.Texture | null
  private source: ImageData | null = null
  private canvas: HTMLCanvasElement | null = null
  private painted: THREE.CanvasTexture | null = null
  private lastKey = ''

  constructor(material: THREE.MeshStandardMaterial) {
    this.material = material
    this.original = material.map
  }

  paint(requests: readonly [readonly Cell[] | undefined, number | null][]): void {
    const active = requests.filter(
      (entry): entry is [readonly Cell[], number] => entry[0] !== undefined && entry[1] !== null,
    )
    const key = active.map(([cells, color]) => `${cells.join()}=${color}`).join('|')
    if (key === this.lastKey) {
      return
    }
    this.lastKey = key
    if (active.length === 0 || !this.original) {
      this.material.map = this.original
      return
    }
    const context = this.prepare()
    if (!context || !this.source || !this.canvas) {
      return
    }
    const output = new ImageData(new Uint8ClampedArray(this.source.data), this.source.width)
    for (const [cells, color] of active) {
      for (const cell of cells) {
        tintCell(output, cell, color)
      }
    }
    context.putImageData(output, 0, 0)
    if (!this.painted) {
      this.painted = new THREE.CanvasTexture(this.canvas)
      this.painted.flipY = this.original.flipY
      this.painted.colorSpace = this.original.colorSpace
      this.painted.wrapS = this.original.wrapS
      this.painted.wrapT = this.original.wrapT
      this.painted.magFilter = this.original.magFilter
      this.painted.minFilter = this.original.minFilter
      this.painted.channel = this.original.channel
    }
    this.painted.needsUpdate = true
    this.material.map = this.painted
  }

  dispose(): void {
    this.painted?.dispose()
    this.painted = null
    this.material.map = this.original
  }

  private prepare(): CanvasRenderingContext2D | null {
    if (this.canvas) {
      return this.canvas.getContext('2d')
    }
    const image = this.original?.image as CanvasImageSource & { width: number; height: number }
    if (typeof document === 'undefined' || !image?.width) {
      return null
    }
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return null
    }
    context.drawImage(image, 0, 0)
    this.source = context.getImageData(0, 0, canvas.width, canvas.height)
    this.canvas = canvas
    return context
  }
}

/** Replaces a swatch with `color`, keeping its light-to-dark gradient. */
function tintCell(image: ImageData, [row, column]: Cell, color: number): void {
  const { width, height, data } = image
  const x0 = Math.floor((column * width) / ATLAS_COLUMNS)
  const x1 = Math.floor(((column + 1) * width) / ATLAS_COLUMNS)
  const y0 = Math.floor((row * height) / ATLAS_ROWS)
  const y1 = Math.floor(((row + 1) * height) / ATLAS_ROWS)
  let total = 0
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * width + x) * 4
      total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    }
  }
  const mean = Math.max(1, total / ((x1 - x0) * (y1 - y0)))
  const r = (color >> 16) & 255
  const g = (color >> 8) & 255
  const b = color & 255
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * width + x) * 4
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      const ratio = Math.min(2, luma / mean)
      data[i] = r * ratio
      data[i + 1] = g * ratio
      data[i + 2] = b * ratio
    }
  }
}

/**
 * Measures head, eye, neck and back landmarks from one body's bind-pose
 * vertices, so accessories fit the mesh instead of hard-coded numbers.
 */
function measureAnchors(
  characterRoot: THREE.Object3D,
  objects: readonly THREE.Object3D[],
  headBone: THREE.Object3D | null,
): CharacterAnchors | null {
  const toRoot = new THREE.Matrix4().copy(characterRoot.matrixWorld).invert()
  const headBase = new THREE.Vector3()
  if (headBone) {
    headBone.getWorldPosition(headBase).applyMatrix4(toRoot)
  }

  const head = new THREE.Box3()
  const all = new THREE.Box3()
  const point = new THREE.Vector3()
  const matrix = new THREE.Matrix4()

  for (const object of objects) {
    if (!(object instanceof THREE.Mesh)) {
      continue
    }
    const position = (object.geometry as THREE.BufferGeometry).getAttribute('position')
    if (!position) {
      continue
    }
    // Bone-parented props (capes) don't define the body's shape.
    const isBody = object instanceof THREE.SkinnedMesh
    matrix.multiplyMatrices(toRoot, object.matrixWorld)
    for (let i = 0; i < position.count; i += 1) {
      point.fromBufferAttribute(position, i)
      if (isBody) {
        object.applyBoneTransform(i, point)
      }
      point.applyMatrix4(matrix)
      if (!isBody) {
        continue
      }
      all.expandByPoint(point)
      if (headBone && point.y > headBase.y) {
        head.expandByPoint(point)
      }
    }
  }

  if (all.isEmpty()) {
    return null
  }
  if (head.isEmpty()) {
    // No head bone: assume the top 40% of the figure is the head.
    const size = all.getSize(new THREE.Vector3())
    head.set(new THREE.Vector3(all.min.x, all.max.y - size.y * 0.4, all.min.z), all.max.clone())
    headBase.set((all.min.x + all.max.x) / 2, all.max.y - size.y * 0.4, (all.min.z + all.max.z) / 2)
  }

  const forward = FACE_FORWARD
  const headCenter = head.getCenter(new THREE.Vector3())
  const headSize = head.getSize(new THREE.Vector3())
  const headRadius = headSize.x * 0.5
  const headDepth = headSize.z * 0.5
  // Chibi faces: the eyes sit a little below the middle of the head.
  const eyeCenter = new THREE.Vector3(
    headCenter.x,
    headCenter.y - headSize.y * 0.08,
    headCenter.z + forward * headDepth * 0.92,
  )
  const torsoHeight = headBase.y - all.min.y
  const backpackCenter = new THREE.Vector3(
    headCenter.x,
    all.min.y + torsoHeight * 0.62,
    headCenter.z - forward * headDepth * 0.62,
  )
  const backpackSize = new THREE.Vector3(headRadius * 1.1, torsoHeight * 0.36, headDepth * 0.5)

  return {
    headCenter,
    headRadius,
    headTop: head.max.y,
    eyeCenter,
    neck: new THREE.Vector3(headCenter.x, headBase.y - headRadius * 0.05, headCenter.z),
    backpackCenter,
    backpackSize,
    forward,
  }
}
