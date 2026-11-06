import { AssetError } from './AssetError.ts'

export type AssetCategory = 'character' | 'environment' | 'obstacle' | 'collectible'

export interface AssetMetadata {
  /** Relative scale applied when an instance is created. */
  readonly scale?: number
  /** Collision proxy for obstacle models, authored in metres. */
  readonly obstacle?: {
    readonly height: number
    readonly halfWidth: number
    readonly halfDepth: number
    readonly radius: number
  }
  readonly [key: string]: unknown
}

export interface AssetDefinition {
  readonly id: string
  readonly category: AssetCategory
  readonly label: string
  readonly url: string
  /** Required assets still degrade gracefully, but failures are errors in the log. */
  readonly required: boolean
  readonly metadata: AssetMetadata
}

const CHARACTER_URL = new URL('./models/turkuaz_runner.glb', import.meta.url).href
const ENVIRONMENT_BEACON_URL = new URL('./models/environment/tide_beacon.glb', import.meta.url).href
const OBSTACLE_CRATE_URL = new URL('./models/obstacles/crate.glb', import.meta.url).href
const OBSTACLE_SPIRE_URL = new URL('./models/obstacles/spire.glb', import.meta.url).href
const COLLECTIBLE_CRYSTAL_URL = new URL('./models/collectibles/crystal.glb', import.meta.url).href

/**
 * Central asset manifest. Every URL is built from a real file with
 * `new URL(..., import.meta.url)`, so Vite fingerprints and copies the binary
 * during production builds. Never add a guessed or placeholder path here:
 * `validate-asset-pipeline.mjs` asserts that each registered URL resolves to an
 * existing GLB on disk.
 */
const BASE_ASSET_DEFINITIONS: readonly AssetDefinition[] = [
  {
    id: 'character.turkuaz',
    category: 'character',
    label: 'Turkuaz runner',
    url: CHARACTER_URL,
    required: true,
    metadata: {
      scale: 1,
      animationStates: ['idle', 'run', 'jump', 'fall', 'land', 'win', 'lose'],
      forwardAxis: '-Z',
      // Measured by blender/build_kaykit_characters.py (planted-foot speed of Run).
      runReferenceSpeed: 3.72,
    },
  },
  {
    id: 'environment.tide_beacon',
    category: 'environment',
    label: 'Tide beacon',
    url: ENVIRONMENT_BEACON_URL,
    required: false,
    metadata: { scale: 1, height: 2.04 },
  },
  {
    id: 'obstacle.crate',
    category: 'obstacle',
    label: 'Cargo crate',
    url: OBSTACLE_CRATE_URL,
    required: false,
    metadata: {
      scale: 1,
      obstacle: { height: 1.15, halfWidth: 0.62, halfDepth: 0.62, radius: 0.9 },
    },
  },
  {
    id: 'obstacle.spire',
    category: 'obstacle',
    label: 'Coral spire',
    url: OBSTACLE_SPIRE_URL,
    required: false,
    metadata: {
      scale: 1,
      obstacle: { height: 2.5, halfWidth: 0.48, halfDepth: 0.48, radius: 0.7 },
    },
  },
  {
    id: 'collectible.crystal',
    category: 'collectible',
    label: 'Tide crystal',
    url: COLLECTIBLE_CRYSTAL_URL,
    required: false,
    metadata: { scale: 1 },
  },
]

export const ASSET_DEFINITIONS: readonly AssetDefinition[] = BASE_ASSET_DEFINITIONS.map(
  (definition) => ({
    ...definition,
    metadata: Object.freeze({ ...definition.metadata }),
  }),
)

export class AssetRegistry {
  private readonly byId = new Map<string, AssetDefinition>()
  private readonly byCategory = new Map<AssetCategory, AssetDefinition[]>()

  constructor(definitions: readonly AssetDefinition[]) {
    for (const definition of definitions) {
      this.validate(definition)
      if (this.byId.has(definition.id)) {
        throw new Error(`Duplicate asset id "${definition.id}" in the registry.`)
      }
      this.byId.set(definition.id, definition)

      const bucket = this.byCategory.get(definition.category) ?? []
      bucket.push(definition)
      this.byCategory.set(definition.category, bucket)
    }
  }

  get(id: string): AssetDefinition | undefined {
    return this.byId.get(id)
  }

  require(id: string): AssetDefinition {
    const definition = this.byId.get(id)
    if (!definition) {
      throw new AssetError(
        `Asset "${id}" is not registered. Add a real file under src/assets/models and register it in AssetRegistry.ts.`,
        'ASSET_NOT_REGISTERED',
        { assetId: id },
      )
    }
    return definition
  }

  has(id: string): boolean {
    return this.byId.has(id)
  }

  category(category: AssetCategory): readonly AssetDefinition[] {
    return this.byCategory.get(category) ?? []
  }

  categories(): AssetCategory[] {
    return [...this.byCategory.keys()]
  }

  all(): readonly AssetDefinition[] {
    return [...this.byId.values()]
  }

  ids(): string[] {
    return [...this.byId.keys()]
  }

  private validate(definition: AssetDefinition): void {
    if (!definition.id.trim()) {
      throw new Error('Asset definitions require a non-empty id.')
    }
    if (!definition.label.trim()) {
      throw new Error(`Asset "${definition.id}" requires a human-readable label.`)
    }
    if (!definition.url.trim()) {
      throw new Error(`Asset "${definition.id}" has an empty URL.`)
    }
    if (!definition.url.toLowerCase().split('?')[0].endsWith('.glb')) {
      throw new Error(
        `Asset "${definition.id}" must point at a .glb file, received "${definition.url}".`,
      )
    }
  }
}

export const ASSET_REGISTRY = new AssetRegistry(ASSET_DEFINITIONS)
