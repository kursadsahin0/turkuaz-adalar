#!/usr/bin/env node
/**
 * End-to-end validation of the character GLB (three KayKit runners on one
 * rig, built by blender/build_kaykit_characters.py).
 *
 * Checks the binary container, the shared skin, the three bodies and their
 * embedded textures, the animation contract the game relies on (names,
 * loop seams, in-place Run), then loads the file with three.js and plays
 * every clip through AnimationMixer, including a cross-fade.
 *
 * Usage:
 *   node scripts/validate-character-glb.mjs
 *   node scripts/validate-character-glb.mjs --glb ../blender/turkuaz_runner.glb
 *
 * Exit code is 1 when a hard check fails. A JSON report is written next to
 * this script (or to the path passed with --json).
 */

globalThis.self = globalThis

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const THREE = await import('three')
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const GAME_ROOT = path.resolve(SCRIPT_DIR, '..')
const REPO_ROOT = path.resolve(GAME_ROOT, '..')

/** Clips the animator and the registry metadata expect. */
const REQUIRED_CLIPS = [
  'Idle',
  'Run',
  'Jump',
  'Airborne',
  'Fall',
  'Land',
  'Win',
  'Lose',
  'Slide',
  'Hit',
]
const LOOP_CLIPS = ['Idle', 'Run', 'Airborne', 'Fall']
const BODIES = ['runner', 'swift', 'ocean', 'mage', 'sage', 'knight', 'guardian']
const JOINTS = 41
/** Loop seams: the last pose may differ from the first by at most this. */
const SEAM_ANGLE = 0.12
/** Run is in place: the hips may drift sideways/forwards by at most this. */
const RUN_DRIFT = 0.06

const checks = []
const metrics = {}

function record(name, status, detail) {
  checks.push({ name, status, detail })
  const tag = status.toUpperCase().padEnd(4)
  console.log(`  [${tag}] ${name}: ${detail}`)
}

function check(name, condition, detail, warning = false) {
  record(name, condition ? 'pass' : warning ? 'warn' : 'fail', detail)
  return condition
}

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const value = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : true
      args[key] = value
      if (value !== true) index += 1
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const defaultGlb = path.join(GAME_ROOT, 'src', 'assets', 'models', 'turkuaz_runner.glb')
const glbPath = path.resolve(String(args.glb ?? defaultGlb))
const reportPath = path.resolve(
  String(args.json ?? path.join(SCRIPT_DIR, 'glb_validation_report.json')),
)

// ---------------------------------------------------------------------------
// GLB container / accessor helpers
// ---------------------------------------------------------------------------

const GLB_MAGIC = 0x46546c67 // "glTF"
const CHUNK_JSON = 0x4e4f534a // "JSON"
const CHUNK_BIN = 0x004e4942 // "BIN\0"

function parseGlb(buffer) {
  if (buffer.length < 20) throw new Error('file is too small to be a GLB')
  const magic = buffer.readUInt32LE(0)
  const version = buffer.readUInt32LE(4)
  const length = buffer.readUInt32LE(8)
  if (magic !== GLB_MAGIC) throw new Error('invalid GLB magic')
  if (length !== buffer.length) {
    throw new Error(`GLB header length ${length} does not match file size ${buffer.length}`)
  }

  let offset = 12
  let json = null
  let bin = null
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) throw new Error('truncated chunk header')
    const chunkLength = buffer.readUInt32LE(offset)
    const chunkType = buffer.readUInt32LE(offset + 4)
    const start = offset + 8
    const end = start + chunkLength
    if (end > buffer.length) throw new Error('chunk extends past end of file')
    if (chunkType === CHUNK_JSON) {
      json = JSON.parse(buffer.subarray(start, end).toString('utf8').replace(/\0+$/u, ''))
    } else if (chunkType === CHUNK_BIN) {
      bin = buffer.subarray(start, end)
    }
    offset = end + ((4 - (chunkLength % 4)) % 4)
  }
  if (!json) throw new Error('GLB has no JSON chunk')
  return { json, bin, version, length }
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }
const COMPONENT_READERS = {
  5120: {
    size: 1,
    read: (view, offset) => view.getInt8(offset),
    normalize: (value) => Math.max(value / 127, -1),
  },
  5121: {
    size: 1,
    read: (view, offset) => view.getUint8(offset),
    normalize: (value) => value / 255,
  },
  5122: {
    size: 2,
    read: (view, offset) => view.getInt16(offset, true),
    normalize: (value) => Math.max(value / 32767, -1),
  },
  5123: {
    size: 2,
    read: (view, offset) => view.getUint16(offset, true),
    normalize: (value) => value / 65535,
  },
  5125: {
    size: 4,
    read: (view, offset) => view.getUint32(offset, true),
    normalize: (value) => value,
  },
  5126: {
    size: 4,
    read: (view, offset) => view.getFloat32(offset, true),
    normalize: (value) => value,
  },
}

function readAccessor(json, bin, index) {
  const accessor = json.accessors[index]
  if (!accessor) throw new Error(`missing accessor ${index}`)
  const components = COMPONENTS[accessor.type]
  const reader = COMPONENT_READERS[accessor.componentType]
  if (!components || !reader) throw new Error(`unsupported accessor ${index}`)
  if (accessor.sparse)
    throw new Error(`sparse accessor ${index} is not supported by this validator`)

  const output = []
  if (accessor.bufferView === undefined) {
    for (let element = 0; element < accessor.count; element += 1) {
      for (let component = 0; component < components; component += 1) output.push(0)
    }
    return { accessor, values: output, components }
  }
  if (!bin) throw new Error(`accessor ${index} needs a BIN chunk`)
  const bufferView = json.bufferViews[accessor.bufferView]
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const stride = bufferView.byteStride ?? components * reader.size
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)

  for (let element = 0; element < accessor.count; element += 1) {
    for (let component = 0; component < components; component += 1) {
      const raw = reader.read(view, base + element * stride + component * reader.size)
      output.push(accessor.normalized ? reader.normalize(raw) : raw)
    }
  }
  return { accessor, values: output, components }
}

function quaternionAngle(a, b) {
  const lengthA = Math.hypot(a[0], a[1], a[2], a[3])
  const lengthB = Math.hypot(b[0], b[1], b[2], b[3])
  if (lengthA < 1e-8 || lengthB < 1e-8) return 0
  const dot = Math.abs(
    (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) / (lengthA * lengthB),
  )
  return 2 * Math.acos(Math.min(1, Math.max(-1, dot)))
}

function hashFile(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

// ---------------------------------------------------------------------------
// Static glTF validation
// ---------------------------------------------------------------------------

function validateStructure(json, bin) {
  check('gltf.version', json.asset?.version === '2.0', `glTF ${json.asset?.version}`)
  check('gltf.bin_chunk', Boolean(bin), bin ? `${bin.length} bytes` : 'missing')

  const skins = json.skins ?? []
  check('skin.single', skins.length === 1, `${skins.length} skin(s)`)
  check('skin.joints', skins[0]?.joints.length === JOINTS, `${skins[0]?.joints.length} joints`)

  const nodes = json.nodes ?? []
  const names = nodes.map((node) => node.name)
  for (const body of BODIES) {
    const node = nodes.find((entry) => entry.name === `TK_Char_${body}`)
    check(
      `body.${body}`,
      Boolean(node && node.mesh !== undefined && node.skin === 0),
      node ? 'skinned to the shared rig' : 'missing',
    )
    const material = (json.materials ?? []).find((entry) => entry.name === `TK_Kit_${body}`)
    const texture = material?.pbrMetallicRoughness?.baseColorTexture
    check(
      `material.${body}`,
      Boolean(material && texture !== undefined),
      material ? 'textured atlas' : 'missing',
    )
  }
  for (const head of ['head', 'chest', 'hips', 'hand.l', 'foot.l']) {
    check(`bone.${head}`, names.includes(head), names.includes(head) ? 'present' : 'missing')
  }

  const images = json.images ?? []
  const embedded = images.every((image) => image.bufferView !== undefined)
  check('images.embedded', images.length >= 3 && embedded, `${images.length} image(s)`)
  for (const image of images) {
    const view = json.bufferViews[image.bufferView]
    const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + 8)
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
    check(`image.${image.name}.png`, png, png ? 'valid PNG signature' : 'not a PNG')
  }
}

function validateAnimations(json, bin) {
  const animations = json.animations ?? []
  const names = animations.map((animation) => animation.name)
  const missing = REQUIRED_CLIPS.filter((name) => !names.includes(name))
  check(
    'clips.required',
    missing.length === 0,
    missing.length ? `missing ${missing}` : names.join(', '),
  )
  // Besides the contract, only per-runner celebrations ("Win_<body>").
  const extra = names.filter((name) => !REQUIRED_CLIPS.includes(name))
  check(
    'clips.no_extra',
    extra.every((name) => name.startsWith('Win_') && BODIES.includes(name.slice(4))),
    extra.length ? extra.join(', ') : 'none',
  )
  check('clips.celebrations', extra.length >= 5, `${extra.length} runner celebration(s)`)

  const nodes = json.nodes ?? []
  metrics.clips = {}
  for (const animation of animations) {
    let duration = 0
    let worstSeam = 0
    let hipsDrift = 0
    for (const channel of animation.channels) {
      const sampler = animation.samplers[channel.sampler]
      const times = readAccessor(json, bin, sampler.input).values
      duration = Math.max(duration, times[times.length - 1] ?? 0)
      const { values, components } = readAccessor(json, bin, sampler.output)
      const first = values.slice(0, components)
      const last = values.slice(values.length - components)
      if (channel.target.path === 'rotation') {
        worstSeam = Math.max(worstSeam, quaternionAngle(first, last))
      }
      const node = nodes[channel.target.node]?.name
      if (channel.target.path === 'translation' && node === 'hips') {
        for (let i = 0; i < values.length; i += components) {
          hipsDrift = Math.max(
            hipsDrift,
            Math.abs(values[i] - first[0]),
            Math.abs(values[i + 2] - first[2]),
          )
        }
      }
    }
    metrics.clips[animation.name] = { duration, worstSeam, hipsDrift }
    check(`clip.${animation.name}.duration`, duration > 0.1, `${duration.toFixed(2)} s`)
    if (LOOP_CLIPS.includes(animation.name)) {
      check(
        `clip.${animation.name}.loop_seam`,
        worstSeam <= SEAM_ANGLE,
        `${worstSeam.toFixed(3)} rad between first and last pose`,
      )
    }
    if (animation.name === 'Run') {
      check('clip.Run.in_place', hipsDrift <= RUN_DRIFT, `hips drift ${hipsDrift.toFixed(3)} m`)
    }
  }
}

// ---------------------------------------------------------------------------
// three.js runtime
// ---------------------------------------------------------------------------

function loadGltf(buffer) {
  const loader = new GLTFLoader()
  const suppressed = []
  const originalError = console.error
  console.error = (...parts) => {
    const message = parts.map(String).join(' ')
    if (message.includes("Couldn't load texture blob:")) {
      suppressed.push(message)
      return
    }
    originalError(...parts)
  }
  return new Promise((resolve, reject) => {
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    )
    loader.parse(
      arrayBuffer,
      '',
      (gltf) => {
        console.error = originalError
        resolve({ gltf, suppressed })
      },
      (error) => {
        console.error = originalError
        reject(error)
      },
    )
  })
}

function validateRuntime(gltf) {
  const scene = gltf.scene
  scene.updateMatrixWorld(true)
  const skinned = []
  scene.traverse((object) => {
    if (object.isSkinnedMesh) skinned.push(object)
  })
  check('runtime.skinned_meshes', skinned.length === BODIES.length, `${skinned.length} skinned`)
  check(
    'runtime.shared_skeleton',
    skinned.every((mesh) => mesh.skeleton.bones[0] === skinned[0].skeleton.bones[0]),
    'all bodies drive the same bones',
  )

  // Bodies only: the mage's hat and the knight's helmet sit above them.
  const bounds = new THREE.Box3()
  for (const mesh of skinned) {
    mesh.computeBoundingBox()
    bounds.union(mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld))
  }
  const size = bounds.getSize(new THREE.Vector3())
  metrics.size = size.toArray()
  check('runtime.height', size.y > 1.5 && size.y < 2.6, `${size.y.toFixed(3)} m tall`)
  check('runtime.feet_on_origin', Math.abs(bounds.min.y) < 0.05, `min y ${bounds.min.y.toFixed(3)}`)

  const mixer = new THREE.AnimationMixer(scene)
  const hand = scene.getObjectByName('handl')
  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip)
    action.reset().play()
    const before = hand?.quaternion.clone()
    mixer.update(clip.duration * 0.5)
    scene.updateMatrixWorld(true)
    let finite = true
    scene.traverse((object) => {
      if (object.isBone && !object.matrixWorld.elements.every(Number.isFinite)) finite = false
    })
    const moved = before && hand ? before.angleTo(hand.quaternion) > 1e-4 : false
    check(
      `runtime.play.${clip.name}`,
      finite && (moved || clip.name === 'Idle'),
      finite ? 'plays' : 'NaN pose',
    )
    action.stop()
  }

  const idle = mixer.clipAction(gltf.animations.find((clip) => clip.name === 'Idle'))
  const run = mixer.clipAction(gltf.animations.find((clip) => clip.name === 'Run'))
  idle.reset().play()
  run.reset().play()
  idle.crossFadeTo(run, 0.2, false)
  mixer.update(0.1)
  const blending = idle.getEffectiveWeight() > 0 && run.getEffectiveWeight() > 0
  mixer.update(0.2)
  check(
    'runtime.cross_fade',
    blending && run.getEffectiveWeight() > 0.99,
    `run weight ${run.getEffectiveWeight().toFixed(2)}`,
  )
}

async function main() {
  console.log('Turkuaz character GLB validation')
  console.log('-'.repeat(60))

  check('file.exists', fs.existsSync(glbPath), glbPath)
  if (!fs.existsSync(glbPath)) throw new Error(`GLB not found: ${glbPath}`)
  const buffer = fs.readFileSync(glbPath)
  const fileHash = createHash('sha256').update(buffer).digest('hex')
  metrics.file = { path: glbPath, bytes: buffer.length, sha256: fileHash }
  check('file.size', buffer.length < 2_500_000, `${(buffer.length / 1024).toFixed(0)} KiB`)

  const copies = {
    src: path.join(GAME_ROOT, 'src', 'assets', 'models', 'turkuaz_runner.glb'),
    blender: path.join(REPO_ROOT, 'blender', 'turkuaz_runner.glb'),
  }
  for (const [label, copy] of Object.entries(copies)) {
    if (!fs.existsSync(copy)) {
      // The Blender output is optional (only present after a local build).
      check(`file.copy.${label}`, label === 'blender', `${copy} missing`, label === 'blender')
      continue
    }
    const same = hashFile(copy) === fileHash
    check(`file.copy.${label}`, same, same ? 'byte-identical' : 'differs from validated GLB')
  }

  const { json, bin } = parseGlb(buffer)
  validateStructure(json, bin)
  validateAnimations(json, bin)

  const { gltf } = await loadGltf(buffer)
  validateRuntime(gltf)

  const failed = checks.filter((item) => item.status === 'fail')
  const warned = checks.filter((item) => item.status === 'warn')
  const summary = {
    passed: checks.length - failed.length - warned.length,
    warnings: warned.length,
    failed: failed.length,
    total: checks.length,
  }
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify({ asset: 'turkuaz_runner.glb', three_revision: THREE.REVISION, summary, checks, metrics }, null, 2)}\n`,
  )

  console.log('-'.repeat(60))
  console.log(`${summary.passed} passed, ${summary.warnings} warnings, ${summary.failed} failed`)
  if (failed.length) {
    console.log('\nFailed checks:')
    for (const item of failed) console.log(`  - ${item.name}: ${item.detail}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
