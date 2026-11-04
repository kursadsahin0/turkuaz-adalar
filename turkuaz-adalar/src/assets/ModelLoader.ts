import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { disposeObject3D } from '../utils/dispose.ts'
import { Logger } from '../utils/logger.ts'
import { AssetError } from './AssetError.ts'
import type { AssetCategory, AssetDefinition, AssetRegistry } from './AssetRegistry.ts'

export interface AssetProgress {
  readonly assetId: string
  readonly loadedBytes: number
  readonly totalBytes: number
  /** 0..1 download progress. Parsing/validation is reported as 1. */
  readonly ratio: number
}

export interface AssetLoadOptions {
  readonly onProgress?: (progress: AssetProgress) => void
  readonly signal?: AbortSignal
  readonly qualityMultiplier?: number
  readonly textureCompression?: boolean
}

export interface AssetPrefetchOptions extends AssetLoadOptions {
  readonly concurrency?: number
  readonly onItem?: (assetId: string, status: 'loaded' | 'failed') => void
}

export interface AssetReadRequest {
  readonly url: string
  readonly signal?: AbortSignal
  readonly onProgress?: (loadedBytes: number, totalBytes: number) => void
  readonly qualityMultiplier?: number
  readonly textureCompression?: boolean
}

/** Injectable byte source so the validator can exercise the pipeline in Node. */
export interface AssetReader {
  read(request: AssetReadRequest): Promise<ArrayBuffer>
}

export interface AssetStats {
  readonly meshes: number
  readonly skinnedMeshes: number
  readonly bones: number
  readonly triangles: number
  readonly materials: number
  readonly textures: number
}

/** Browser reader with streamed download progress. */
export class FetchAssetReader implements AssetReader {
  async read(request: AssetReadRequest): Promise<ArrayBuffer> {
    if (typeof fetch !== 'function') {
      throw new Error('fetch() is unavailable in this environment.')
    }

    const response = await fetch(request.url, {
      signal: request.signal,
      cache: 'force-cache',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim())
    }

    const totalBytes = Number(response.headers.get('content-length') ?? 0)
    if (!response.body || totalBytes <= 0) {
      return response.arrayBuffer()
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let loadedBytes = 0

    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (value) {
        chunks.push(value)
        loadedBytes += value.byteLength
        request.onProgress?.(loadedBytes, totalBytes)
      }
    }

    const buffer = new ArrayBuffer(loadedBytes)
    const target = new Uint8Array(buffer)
    let offset = 0
    for (const chunk of chunks) {
      target.set(chunk, offset)
      offset += chunk.byteLength
    }
    return buffer
  }
}

/**
 * A parsed model template. Clones share geometry, materials and animation clips
 * with the template; each clone owns its own skeleton, mixer and transforms.
 */
export class LoadedAsset {
  readonly definition: AssetDefinition
  readonly template: THREE.Group
  readonly animations: readonly THREE.AnimationClip[]
  readonly bounds: THREE.Box3
  readonly stats: AssetStats

  private disposed = false

  constructor(
    definition: AssetDefinition,
    template: THREE.Group,
    animations: readonly THREE.AnimationClip[],
    bounds: THREE.Box3,
    stats: AssetStats,
  ) {
    this.definition = definition
    this.template = template
    this.animations = animations
    this.bounds = bounds
    this.stats = stats
  }

  /**
   * Skinned meshes cannot be duplicated with Object3D.clone(); SkeletonUtils
   * rebuilds the bone hierarchy and rebinds every skin. The same path also
   * works for static props, so callers never need to care which is which.
   */
  createInstance(options: { castShadow?: boolean; receiveShadow?: boolean } = {}): ModelInstance {
    if (this.disposed) {
      throw new AssetError(
        `Asset "${this.definition.id}" has already been disposed.`,
        'ASSET_DISPOSED',
        { assetId: this.definition.id, url: this.definition.url },
      )
    }

    const root = cloneSkeleton(this.template) as THREE.Group
    root.name = `${this.definition.id}:instance`
    const castShadow = options.castShadow ?? true
    const receiveShadow = options.receiveShadow ?? true
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = castShadow
        object.receiveShadow = receiveShadow
        // Skinned bounds are computed from the bind pose, so aggressive culling
        // can hide a limb mid-animation.
        if (object instanceof THREE.SkinnedMesh) {
          object.frustumCulled = false
        }
      }
    })

    return new ModelInstance(this, root)
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    disposeObject3D(this.template)
    this.template.removeFromParent()
  }
}

/** Per-clone handle. Disposing an instance never releases shared GPU resources. */
export class ModelInstance {
  readonly asset: LoadedAsset
  readonly root: THREE.Group
  readonly animations: readonly THREE.AnimationClip[]

  private mixer: THREE.AnimationMixer | null = null
  private disposed = false

  constructor(asset: LoadedAsset, root: THREE.Group) {
    this.asset = asset
    this.root = root
    this.animations = asset.animations
  }

  /** Lazily creates one mixer per clone. Never share a mixer between clones. */
  createMixer(): THREE.AnimationMixer {
    if (this.disposed) {
      throw new Error(`Cannot create a mixer for disposed asset "${this.asset.definition.id}".`)
    }
    if (!this.mixer) {
      this.mixer = new THREE.AnimationMixer(this.root)
    }
    return this.mixer
  }

  get hasMixer(): boolean {
    return this.mixer !== null
  }

  update(delta: number): void {
    this.mixer?.update(delta)
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    if (this.mixer) {
      this.mixer.stopAllAction()
      this.mixer.uncacheRoot(this.root)
      this.mixer = null
    }
    this.root.removeFromParent()
  }
}

/**
 * Reusable GLB loader with cache, progress, validation and safe cloning.
 * Missing or malformed files reject with `AssetError`; `loadSafe` logs a clear
 * development message instead of pretending an asset exists.
 */
export class ModelLoader {
  private readonly registry: AssetRegistry
  private readonly reader: AssetReader
  private readonly logger = new Logger('Assets')
  private readonly pending = new Map<string, Promise<LoadedAsset>>()
  private readonly loaded = new Map<string, LoadedAsset>()
  private disposed = false

  constructor(registry: AssetRegistry, reader: AssetReader = new FetchAssetReader()) {
    this.registry = registry
    this.reader = reader
  }

  load(id: string, options: AssetLoadOptions = {}): Promise<LoadedAsset> {
    if (this.disposed) {
      return Promise.reject(
        new AssetError('The asset loader has been disposed.', 'ASSET_DISPOSED', {
          assetId: id,
        }),
      )
    }

    const cached = this.loaded.get(id)
    if (cached) {
      options.onProgress?.({
        assetId: id,
        loadedBytes: 0,
        totalBytes: 0,
        ratio: 1,
      })
      return Promise.resolve(cached)
    }

    const pending = this.pending.get(id)
    if (pending) {
      return pending
    }

    const definition = this.registry.get(id)
    if (!definition) {
      return Promise.reject(this.fail(id, undefined, 'ASSET_NOT_REGISTERED', 'not registered'))
    }

    const promise = this.loadDefinition(definition, options)
      .then((asset) => {
        if (this.disposed) {
          asset.dispose()
          throw new AssetError('The asset loader was disposed during loading.', 'ASSET_DISPOSED', {
            assetId: id,
            url: definition.url,
          })
        }
        this.loaded.set(id, asset)
        return asset
      })
      .catch((error: unknown) => {
        this.logFailure(definition, error)
        throw error
      })
      .finally(() => {
        this.pending.delete(id)
      })

    this.pending.set(id, promise)
    return promise
  }

  /** Returns null after logging a precise warning; the game can use a fallback. */
  async loadSafe(id: string, options: AssetLoadOptions = {}): Promise<LoadedAsset | null> {
    try {
      return await this.load(id, options)
    } catch {
      return null
    }
  }

  /** Loads a whole category, continuing when individual assets fail. */
  async prefetchCategory(
    category: AssetCategory,
    options: AssetPrefetchOptions = {},
  ): Promise<Map<string, LoadedAsset>> {
    const definitions = this.registry.category(category)
    return this.prefetch(
      definitions.map((definition) => definition.id),
      options,
    )
  }

  /** Loads a set of ids with aggregated, monotonic progress. */
  async prefetch(
    ids: readonly string[],
    options: AssetPrefetchOptions = {},
  ): Promise<Map<string, LoadedAsset>> {
    const result = new Map<string, LoadedAsset>()
    if (ids.length === 0) {
      options.onProgress?.({
        assetId: '',
        loadedBytes: 0,
        totalBytes: 0,
        ratio: 1,
      })
      return result
    }

    const fractions = new Map<string, number>()
    const bytes = new Map<string, { loaded: number; total: number }>()
    const total = ids.length
    let cursor = 0

    const report = (assetId: string): void => {
      let sum = 0
      for (const id of ids) {
        sum += fractions.get(id) ?? 0
      }
      let loadedBytes = 0
      let totalBytes = 0
      for (const entry of bytes.values()) {
        loadedBytes += entry.loaded
        totalBytes += entry.total
      }
      options.onProgress?.({
        assetId,
        loadedBytes,
        totalBytes,
        ratio: Math.min(1, sum / total),
      })
    }

    const worker = async (): Promise<void> => {
      for (;;) {
        const index = cursor
        cursor += 1
        if (index >= ids.length) {
          return
        }

        const id = ids[index]
        if (!id) {
          continue
        }
        const asset = await this.loadSafe(id, {
          signal: options.signal,
          onProgress: (progress) => {
            fractions.set(id, progress.ratio)
            bytes.set(id, {
              loaded: progress.loadedBytes,
              total: progress.totalBytes,
            })
            report(id)
          },
        })
        fractions.set(id, 1)
        if (asset) {
          result.set(id, asset)
        }
        report(id)
        options.onItem?.(id, asset ? 'loaded' : 'failed')
      }
    }

    const workerCount = Math.max(1, Math.min(options.concurrency ?? 4, ids.length))
    await Promise.all(Array.from({ length: workerCount }, () => worker()))
    report('')
    return result
  }

  get(id: string): LoadedAsset | undefined {
    return this.loaded.get(id)
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    for (const asset of this.loaded.values()) {
      asset.dispose()
    }
    this.loaded.clear()
    this.pending.clear()
  }

  private async loadDefinition(
    definition: AssetDefinition,
    options: AssetLoadOptions,
  ): Promise<LoadedAsset> {
    const qualityMultiplier = options.qualityMultiplier ?? 1.0
    const textureCompression = options.textureCompression ?? true

    let buffer: ArrayBuffer
    try {
      buffer = await this.reader.read({
        url: definition.url,
        signal: options.signal,
        qualityMultiplier,
        textureCompression,
        onProgress: (loadedBytes, totalBytes) => {
          options.onProgress?.({
            assetId: definition.id,
            loadedBytes,
            totalBytes,
            ratio: totalBytes > 0 ? Math.min(1, loadedBytes / totalBytes) : 0,
          })
        },
      })
    } catch (error) {
      throw new AssetError(
        `Could not read "${definition.id}" from ${definition.url}. Check that the file exists and the dev server serves it.`,
        'ASSET_FETCH_FAILED',
        { assetId: definition.id, url: definition.url, cause: error },
      )
    }

    this.validateGlb(definition, buffer)

    let gltf: Awaited<ReturnType<GLTFLoader['parseAsync']>>
    try {
      const loader = new GLTFLoader()
      gltf = await loader.parseAsync(buffer, this.baseUrl(definition.url))
    } catch (error) {
      throw new AssetError(
        `"${definition.id}" is not a valid glTF binary. Re-export it from Blender as GLB (glTF 2.0).`,
        'ASSET_PARSE_FAILED',
        { assetId: definition.id, url: definition.url, cause: error },
      )
    }

    if (!gltf.scene || gltf.scene.children.length === 0) {
      throw new AssetError(
        `"${definition.id}" parsed successfully but contains no scene nodes.`,
        'ASSET_EMPTY',
        { assetId: definition.id, url: definition.url },
      )
    }

    // Apply geometry simplification based on quality
    if (qualityMultiplier < 1.0) {
      this.simplifyGeometry(gltf.scene, qualityMultiplier)
    }

    // Apply texture compression
    if (textureCompression) {
      this.compressTextures(gltf.scene)
    }

    gltf.scene.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(gltf.scene)
    if (bounds.isEmpty()) {
      throw new AssetError(
        `"${definition.id}" has no renderable bounds. Check the Blender export.`,
        'ASSET_EMPTY',
        { assetId: definition.id, url: definition.url },
      )
    }

    const stats = this.collectStats(gltf.scene)
    if (stats.meshes === 0) {
      throw new AssetError(
        `"${definition.id}" contains no meshes. Check that the collection was selected on export.`,
        'ASSET_EMPTY',
        { assetId: definition.id, url: definition.url },
      )
    }

    const animations = gltf.animations ?? []
    const size = bounds.getSize(new THREE.Vector3())
    this.logger.info(
      `Loaded "${definition.id}" (${definition.category}) — ${stats.meshes} mesh(es), ` +
        `${stats.triangles.toLocaleString()} tris, ${stats.bones} bone(s), ` +
        `${animations.length} clip(s), ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} m.`,
    )

    options.onProgress?.({
      assetId: definition.id,
      loadedBytes: buffer.byteLength,
      totalBytes: buffer.byteLength,
      ratio: 1,
    })

    return new LoadedAsset(definition, gltf.scene, animations, bounds, stats)
  }

  /**
   * Simplifies geometry by reducing polygon count based on quality multiplier.
   * This is a basic implementation - for production, consider using a proper mesh simplification library.
   */
  private simplifyGeometry(root: THREE.Object3D, qualityMultiplier: number): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return
      }

      const geometry = object.geometry
      if (!geometry) return

      // For quality < 1.0, we can reduce detail by not using the full index buffer
      // This is a simple approximation - real simplification would use a library like MeshSimplifier
      if (qualityMultiplier < 0.5 && geometry.index) {
        // On low quality, use every other triangle
        const index = geometry.index
        const count = Math.floor(index.count * qualityMultiplier)
        geometry.setDrawRange(0, count)
      }
    })
  }

  /**
   * Applies texture compression settings to optimize memory usage.
   */
  private compressTextures(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return
      }

      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (material.map) {
          material.map.anisotropy = 2 // Reduce anisotropy for performance
          material.map.minFilter = THREE.LinearMipmapLinearFilter
          material.map.magFilter = THREE.LinearFilter
        }
        if (material.normalMap) {
          material.normalMap.anisotropy = 1
        }
        if (material.roughnessMap) {
          material.roughnessMap.anisotropy = 1
        }
      }
    })
  }

  private validateGlb(definition: AssetDefinition, buffer: ArrayBuffer): void {
    if (buffer.byteLength < 12) {
      throw new AssetError(
        `"${definition.id}" is only ${buffer.byteLength} bytes; a GLB must contain a 12-byte header.`,
        'ASSET_INVALID',
        { assetId: definition.id, url: definition.url },
      )
    }

    const header = new Uint8Array(buffer, 0, 12)
    const magic = String.fromCharCode(header[0] ?? 0, header[1] ?? 0, header[2] ?? 0, header[3] ?? 0)
    if (magic !== 'glTF') {
      throw new AssetError(
        `"${definition.id}" does not start with the GLB magic "glTF". It is not a binary glTF file.`,
        'ASSET_INVALID',
        { assetId: definition.id, url: definition.url },
      )
    }

    const version = new DataView(buffer).getUint32(4, true)
    if (version !== 2) {
      throw new AssetError(
        `"${definition.id}" uses glTF version ${version}; only glTF 2.0 is supported.`,
        'ASSET_INVALID',
        { assetId: definition.id, url: definition.url },
      )
    }
  }

  private collectStats(root: THREE.Object3D): AssetStats {
    let meshes = 0
    let skinnedMeshes = 0
    let bones = 0
    let triangles = 0
    const materials = new Set<THREE.Material>()
    const textures = new Set<THREE.Texture>()

    root.traverse((object) => {
      if (object instanceof THREE.Bone) {
        bones += 1
        return
      }
      if (!(object instanceof THREE.Mesh)) {
        return
      }
      meshes += 1
      if (object instanceof THREE.SkinnedMesh) {
        skinnedMeshes += 1
      }
      const geometry = object.geometry
      const positions = geometry.getAttribute('position')
      if (positions) {
        triangles += geometry.index
          ? Math.floor(geometry.index.count / 3)
          : Math.floor(positions.count / 3)
      }
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material]
      for (const material of objectMaterials) {
        materials.add(material)
        for (const value of Object.values(material as unknown as Record<string, unknown>)) {
          if (value instanceof THREE.Texture) {
            textures.add(value)
          }
        }
      }
    })

    return {
      meshes,
      skinnedMeshes,
      bones,
      triangles,
      materials: materials.size,
      textures: textures.size,
    }
  }

  private baseUrl(url: string): string {
    const slash = url.lastIndexOf('/')
    return slash >= 0 ? url.slice(0, slash + 1) : ''
  }

  private fail(
    id: string,
    url: string | undefined,
    code: 'ASSET_NOT_REGISTERED',
    detail: string,
  ): AssetError {
    const error = new AssetError(
      `Asset "${id}" is ${detail}. Add a real file under src/assets/models and register it in AssetRegistry.ts.`,
      code,
      { assetId: id, url },
    )
    this.logger.error(error.message)
    return error
  }

  private logFailure(definition: AssetDefinition, error: unknown): void {
    // The AssetError already contains the actionable message; avoid duplicating
    // it when `loadSafe` is used.
    if (error instanceof AssetError) {
      if (definition.required) {
        this.logger.error(error.message)
      } else {
        this.logger.warn(error.message)
      }
      return
    }
    this.logger.error(
      `Unexpected failure loading "${definition.id}" from ${definition.url}.`,
      error,
    )
  }
}
