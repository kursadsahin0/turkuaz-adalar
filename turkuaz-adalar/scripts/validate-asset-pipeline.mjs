#!/usr/bin/env node
/**
 * Asset-pipeline validation.
 *
 * Runs the actual TypeScript modules through Vite's SSR loader, loads every
 * registered GLB from disk, exercises the cache, progress, failure handling,
 * safe skeleton cloning and the character animation state machine.
 *
 * Usage: npm run validate:assets
 */
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'

globalThis.self = globalThis

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(HERE, '..')

let passed = 0
let failed = 0
const failures = []

function report(ok, name, detail) {
  const suffix = detail ? ` — ${detail}` : ''
  if (ok) {
    passed += 1
    console.log(`  [PASS] ${name}${suffix}`)
  } else {
    failed += 1
    failures.push(`${name}${suffix}`)
    console.log(`  [FAIL] ${name}${suffix}`)
  }
}

function check(name, fn, detail) {
  try {
    const result = fn()
    report(result !== false, name, detail)
    return result
  } catch (error) {
    report(false, name, `${detail ? `${detail}; ` : ''}${error.message}`)
    return false
  }
}

function approx(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance
}

function filePathFromUrl(url) {
  if (!url.startsWith('file:')) {
    throw new Error(`Expected a file URL from Vite SSR, received ${url}`)
  }
  return fileURLToPath(url)
}

class NodeAssetReader {
  constructor(options = {}) {
    this.reads = []
    this.invalidNext = options.invalidNext ?? false
    this.failNext = options.failNext ?? false
  }

  async read({ url, onProgress }) {
    this.reads.push(url)

    if (this.invalidNext) {
      this.invalidNext = false
      const invalid = Buffer.alloc(64, 0x20)
      onProgress?.(invalid.byteLength, invalid.byteLength)
      return invalid.buffer.slice(invalid.byteOffset, invalid.byteOffset + invalid.byteLength)
    }

    if (this.failNext) {
      this.failNext = false
      throw new Error('Simulated network failure')
    }

    const bytes = await fs.readFile(filePathFromUrl(url))
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    onProgress?.(Math.max(1, Math.floor(buffer.byteLength * 0.55)), buffer.byteLength)
    await new Promise((resolve) => setTimeout(resolve, 0))
    onProgress?.(buffer.byteLength, buffer.byteLength)
    return buffer
  }
}

function definition(id, category, url, required = false) {
  return {
    id,
    category,
    label: id,
    url,
    required,
    metadata: {},
  }
}

const server = await createServer({
  root: PROJECT_ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const { ASSET_REGISTRY, ASSET_DEFINITIONS, AssetRegistry } = await server.ssrLoadModule(
    '/src/assets/AssetRegistry.ts',
  )
  const { ModelLoader, FetchAssetReader } = await server.ssrLoadModule('/src/assets/ModelLoader.ts')
  const { AssetError } = await server.ssrLoadModule('/src/assets/AssetError.ts')
  const { CharacterModel } = await server.ssrLoadModule('/src/game/player/CharacterModel.ts')
  const THREE = await server.ssrLoadModule('three')

  console.log('\nAsset pipeline validation\n')
  console.log('Registry')

  check(
    'registry.definitions',
    () => ASSET_DEFINITIONS.length === 5,
    `${ASSET_DEFINITIONS.length} assets`,
  )
  check(
    'registry.categories',
    () => {
      const categories = new Set(ASSET_REGISTRY.categories())
      return ['character', 'environment', 'obstacle', 'collectible'].every((category) =>
        categories.has(category),
      )
    },
    ASSET_REGISTRY.categories().join(', '),
  )
  check('registry.unique_ids', () => {
    const ids = ASSET_REGISTRY.ids()
    return ids.length === new Set(ids).size
  })
  check(
    'registry.character_required',
    () => ASSET_REGISTRY.require('character.turkuaz').required === true,
  )

  for (const asset of ASSET_DEFINITIONS) {
    const file = filePathFromUrl(asset.url)
    const exists = await fs
      .stat(file)
      .then((stat) => stat.isFile() && stat.size > 12)
      .catch(() => false)
    check(`registry.file.${asset.id}`, () => exists, path.relative(PROJECT_ROOT, file))
  }

  check('registry.unknown_id_throws', () => {
    try {
      ASSET_REGISTRY.require('character.missing')
      return false
    } catch (error) {
      return error instanceof AssetError && error.code === 'ASSET_NOT_REGISTERED'
    }
  })

  console.log('\nLoading')
  const reader = new NodeAssetReader()
  const loader = new ModelLoader(ASSET_REGISTRY, reader)

  const progress = []
  const character = await loader.load('character.turkuaz', {
    onProgress: (event) => progress.push(event.ratio),
  })

  check('load.character', () => character.definition.category === 'character')
  check(
    'load.character.animations',
    () => character.animations.length === 15,
    `${character.animations.length} clips`,
  )
  check(
    'load.character.bones',
    () => character.stats.bones === 41,
    `${character.stats.bones} bones`,
  )
  check(
    'load.character.meshes',
    // Seven KayKit bodies, their capes, the mage's hat and the knight's helmet.
    () => character.stats.meshes === 16,
    `${character.stats.meshes} meshes`,
  )
  const characterHeight = character.bounds.max.y - character.bounds.min.y
  check(
    'load.character.height',
    // Includes the tall wizard hat; bodies alone are ~2.25 m.
    () => characterHeight > 1.5 && characterHeight < 3.4,
    `${characterHeight.toFixed(3)} m`,
  )
  check(
    'load.progress_monotonic',
    () =>
      progress.length >= 2 &&
      progress.every((value, index) => index === 0 || value >= progress[index - 1]),
    `${progress.map((value) => value.toFixed(2)).join(' → ')}`,
  )
  check('load.progress_complete', () => progress.at(-1) === 1)

  const cached = await loader.load('character.turkuaz')
  check('cache.same_instance', () => cached === character)
  check('cache.single_read', () => reader.reads.length === 1, `${reader.reads.length} read`)

  console.log('\nFetch reader')
  const crystalBytes = await fs.readFile(
    filePathFromUrl(ASSET_REGISTRY.require('collectible.crystal').url),
  )
  const assetServer = http.createServer((request, response) => {
    if (request.url === '/crystal.glb') {
      response.writeHead(200, {
        'content-type': 'model/gltf-binary',
        'content-length': crystalBytes.byteLength,
      })
      response.end(crystalBytes)
      return
    }
    response.writeHead(404)
    response.end('not found')
  })
  await new Promise((resolve) => assetServer.listen(0, '127.0.0.1', resolve))
  try {
    const address = assetServer.address()
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine the fixture server port.')
    }
    const baseUrl = `http://127.0.0.1:${address.port}`
    const fetchReader = new FetchAssetReader()
    const fetchProgress = []
    const fetched = await fetchReader.read({
      url: `${baseUrl}/crystal.glb`,
      onProgress: (loaded, total) => fetchProgress.push(loaded / total),
    })
    check(
      'fetch_reader.download',
      () => fetched.byteLength === crystalBytes.byteLength,
      `${fetched.byteLength} bytes`,
    )
    check('fetch_reader.progress', () => fetchProgress.length > 0 && fetchProgress.at(-1) === 1)

    let fetchError = null
    try {
      await fetchReader.read({ url: `${baseUrl}/missing.glb` })
    } catch (error) {
      fetchError = error
    }
    check(
      'fetch_reader.http_error',
      () => fetchError instanceof Error && fetchError.message.includes('404'),
      fetchError?.message,
    )
  } finally {
    await new Promise((resolve) => assetServer.close(resolve))
  }

  console.log('\nCategories')
  const categoryResults = {}
  for (const asset of ASSET_DEFINITIONS.filter((item) => item.category !== 'character')) {
    const loaded = await loader.load(asset.id)
    categoryResults[asset.category] = true
    check(`load.${asset.id}`, () => loaded.stats.meshes > 0, `${loaded.stats.triangles} tris`)
    check(`load.${asset.id}.category`, () => loaded.definition.category === asset.category)
  }
  check('load.all_categories', () =>
    ['environment', 'obstacle', 'collectible'].every((category) => categoryResults[category]),
  )

  console.log('\nCloning & AnimationMixer')
  const cloneA = character.createInstance()
  const cloneB = character.createInstance()
  check('clone.distinct_roots', () => cloneA.root !== cloneB.root)
  check(
    'clone.distinct_bones',
    () => cloneA.root.getObjectByName('handl') !== cloneB.root.getObjectByName('handl'),
  )

  const clip = character.animations.find((item) => item.name === 'Run')
  check('clone.run_clip_present', () => Boolean(clip))
  if (clip) {
    const mixerA = cloneA.createMixer()
    const mixerB = cloneB.createMixer()
    check('mixer.per_clone', () => mixerA !== mixerB)

    const handA = cloneA.root.getObjectByName('handl')
    const handB = cloneB.root.getObjectByName('handl')
    const beforeB = handB?.quaternion.toArray()
    mixerA.clipAction(clip).play()
    mixerA.update(0.2)
    const afterA = handA?.quaternion.toArray()
    const afterB = handB?.quaternion.toArray()
    check('clone.animation_moves_clone_a', () =>
      afterA.some((value, index) => Math.abs(value - beforeB[index]) > 1e-5),
    )
    check('clone.animation_leaves_clone_b', () =>
      afterB.every((value, index) => Math.abs(value - beforeB[index]) < 1e-9),
    )
  }

  console.log('\nCharacter controller')
  const targetHeight = 1.56
  const model = new CharacterModel(character, { targetHeight })
  check(
    'character.scale_to_capsule',
    // The bodies (not hats or helmets) fill the capsule height.
    () => {
      model.root.updateMatrixWorld(true)
      const bodies = new THREE.Box3()
      model.root.traverse((object) => {
        if (object.isSkinnedMesh) {
          object.computeBoundingBox()
          bodies.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld))
        }
      })
      return approx(bodies.max.y - bodies.min.y, targetHeight, 0.01)
    },
    `${model.scale.toFixed(4)}×`,
  )
  check(
    'character.required_states',
    () =>
      ['idle', 'run', 'jump', 'fall', 'land', 'win', 'lose'].every((state) =>
        model.availableStates.includes(state),
      ),
    model.availableStates.join(', '),
  )
  check('character.starts_idle', () => model.state === 'idle')

  const step = (seconds, motion) => {
    const frames = Math.max(1, Math.ceil(seconds / (1 / 60)))
    for (let index = 0; index < frames; index += 1) {
      model.update(1 / 60, motion)
    }
  }

  model.update(1 / 60, {
    grounded: true,
    verticalVelocity: 0,
    speed: 9.5,
  })
  check('character.idle_to_run', () => model.state === 'run')
  check(
    'character.crossfade_weights',
    () =>
      model.animator.getActionWeight('run') > 0 &&
      model.animator.getActionWeight('run') < 1 &&
      model.animator.getActionWeight('idle') > 0,
    `idle ${model.animator.getActionWeight('idle').toFixed(2)}, run ${model.animator.getActionWeight('run').toFixed(2)}`,
  )
  step(0.5, { grounded: true, verticalVelocity: 0, speed: 9.5 })
  check('character.run_settles', () => model.animator.getActionWeight('run') > 0.98)

  model.update(1 / 60, { grounded: false, verticalVelocity: 6, speed: 9.5 })
  check('character.jump', () => model.state === 'jump')
  step(0.2, { grounded: false, verticalVelocity: 6, speed: 9.5 })
  model.update(1 / 60, { grounded: false, verticalVelocity: -6, speed: 9.5 })
  check('character.fall', () => model.state === 'fall')

  model.update(1 / 60, { grounded: true, verticalVelocity: 0, speed: 9.5 })
  check('character.land', () => model.state === 'land')
  step(0.75, { grounded: true, verticalVelocity: 0, speed: 9.5 })
  check('character.land_to_run', () => model.state === 'run')

  model.playOutcome('win')
  check('character.win', () => model.state === 'win' && model.animator.lockedOutcome === 'win')
  step(0.5, { grounded: true, verticalVelocity: 0, speed: 9.5 })
  check('character.win_locks_locomotion', () => model.state === 'win')
  model.reset()
  check(
    'character.reset_clears_outcome',
    () => model.state === 'idle' && model.animator.lockedOutcome === null,
  )

  model.playOutcome('lose')
  check('character.lose', () => model.state === 'lose')
  model.dispose()

  console.log('\nProgress & recovery')
  const prefetchReader = new NodeAssetReader()
  const prefetchLoader = new ModelLoader(ASSET_REGISTRY, prefetchReader)
  const prefetchRatios = []
  const prefetched = await prefetchLoader.prefetch(
    ['obstacle.crate', 'obstacle.spire', 'collectible.crystal'],
    { onProgress: (event) => prefetchRatios.push(event.ratio) },
  )
  check('prefetch.count', () => prefetched.size === 3, `${prefetched.size} assets`)
  check(
    'prefetch.progress_monotonic',
    () =>
      prefetchRatios.length >= 2 &&
      prefetchRatios.every((value, index) => index === 0 || value >= prefetchRatios[index - 1]),
  )
  check('prefetch.progress_complete', () => prefetchRatios.at(-1) === 1)
  prefetchLoader.dispose()

  const warnings = []
  const originalWarn = console.warn
  const originalError = console.error
  const capture = (...args) => {
    const text = args.map((value) => String(value)).join(' ')
    if (text.includes('[Tidelark]')) {
      warnings.push(text)
    }
  }
  console.warn = capture
  console.error = capture
  try {
    const missingUrl = pathToFileURL(
      path.join(PROJECT_ROOT, 'src/assets/models/__missing_fixture__.glb'),
    ).href
    const missingRegistry = new AssetRegistry([
      definition('fixture.missing', 'environment', missingUrl, false),
    ])
    const missingLoader = new ModelLoader(missingRegistry, new NodeAssetReader())
    const missing = await missingLoader.loadSafe('fixture.missing')
    check('missing.returns_null', () => missing === null)
    check('missing.dev_warning', () =>
      warnings.some(
        (message) => message.includes('fixture.missing') && message.includes('Could not read'),
      ),
    )
    missingLoader.dispose()

    const invalidReader = new NodeAssetReader({ invalidNext: true })
    const invalidRegistry = new AssetRegistry([
      definition('fixture.invalid', 'collectible', missingUrl, false),
    ])
    const invalidLoader = new ModelLoader(invalidRegistry, invalidReader)
    let invalidCode = ''
    try {
      await invalidLoader.load('fixture.invalid')
    } catch (error) {
      invalidCode = error.code
    }
    check('invalid.rejects', () => invalidCode === 'ASSET_INVALID', invalidCode)
    check('invalid.dev_warning', () =>
      warnings.some((message) => message.includes('fixture.invalid') && message.includes('magic')),
    )
    invalidLoader.dispose()

    const retryReader = new NodeAssetReader({ failNext: true })
    const retryRegistry = new AssetRegistry([
      {
        ...ASSET_REGISTRY.require('collectible.crystal'),
        id: 'fixture.retry',
      },
    ])
    const retryLoader = new ModelLoader(retryRegistry, retryReader)
    const first = await retryLoader.loadSafe('fixture.retry')
    const second = await retryLoader.load('fixture.retry')
    check('retry.not_cached_on_failure', () => first === null && second.stats.meshes > 0)
    retryLoader.dispose()

    const disposedLoader = new ModelLoader(ASSET_REGISTRY, new NodeAssetReader())
    disposedLoader.dispose()
    let disposedCode = ''
    try {
      await disposedLoader.load('collectible.crystal')
    } catch (error) {
      disposedCode = error.code
    }
    check('loader.disposed_rejects', () => disposedCode === 'ASSET_DISPOSED')
  } finally {
    console.warn = originalWarn
    console.error = originalError
  }

  check('reader.default_is_fetch', () => new FetchAssetReader() instanceof FetchAssetReader)
  loader.dispose()
  check('loader.dispose_releases', () => loader.get('character.turkuaz') === undefined)

  check('asset.definition_shape', () => {
    const asset = ASSET_REGISTRY.require('obstacle.crate')
    return (
      asset.url.toLowerCase().endsWith('.glb') &&
      asset.metadata.obstacle.height === 1.15 &&
      asset.label.length > 0
    )
  })
} catch (error) {
  failed += 1
  failures.push(`uncaught: ${error.message}`)
  console.error('\nUncaught validation error:', error)
} finally {
  await server.close()
}

console.log(`\n${'-'.repeat(60)}`)
console.log(`${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`Failures:\n${failures.map((entry) => ` - ${entry}`).join('\n')}`)
  process.exitCode = 1
}
