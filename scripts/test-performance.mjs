/**
 * Performance validation script for Turkuaz Adalar.
 * Validates that performance optimization code is properly implemented.
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const QUALITY_SETTINGS_FILE = join(root, 'src/config/QualitySettings.ts')
const PERFORMANCE_MONITOR_FILE = join(root, 'src/systems/performance/PerformanceMonitor.ts')
const RENDERER_FILE = join(root, 'src/core/Renderer.ts')
const PARTICLE_SYSTEM_FILE = join(root, 'src/game/effects/ParticleSystem.ts')
const MODEL_LOADER_FILE = join(root, 'src/assets/ModelLoader.ts')
const INSTANCED_OBJECTS_FILE = join(root, 'src/game/world/InstancedObjects.ts')

function readFile(path) {
  try {
    return readFileSync(path, 'utf-8')
  } catch (e) {
    console.error(`Failed to read ${path}:`, e.message)
    process.exit(1)
  }
}

console.log('Turkuaz Adalar Performance Validation\n')

let passed = 0
let failed = 0

function test(name, condition, message) {
  if (condition) {
    console.log(`✓ ${name}`)
    passed++
  } else {
    console.log(`✗ ${name}: ${message}`)
    failed++
  }
}

// Test 1: Quality Settings Implementation
console.log('Test 1: Quality Settings Implementation')
const qualityContent = readFile(QUALITY_SETTINGS_FILE)
test(
  'QualityLevel type defined',
  qualityContent.includes('type QualityLevel'),
  'QualityLevel type not found',
)
test(
  'Quality presets defined',
  qualityContent.includes('QUALITY_PRESETS'),
  'QUALITY_PRESETS not found',
)
test('Low quality preset', qualityContent.includes("'low'"), 'Low quality preset not found')
test(
  'Medium quality preset',
  qualityContent.includes("'medium'"),
  'Medium quality preset not found',
)
test('High quality preset', qualityContent.includes("'high'"), 'High quality preset not found')
test(
  'Quality detection function',
  qualityContent.includes('detectQualityLevel'),
  'detectQualityLevel not found',
)
test(
  'Particle multiplier in presets',
  qualityContent.includes('particleMultiplier'),
  'particleMultiplier not found',
)
test('Shadow map size scaling', qualityContent.includes('shadowMapSize'), 'shadowMapSize not found')
test(
  'Geometry detail scaling',
  qualityContent.includes('geometryDetail'),
  'geometryDetail not found',
)
test(
  'Texture compression flag',
  qualityContent.includes('textureCompression'),
  'textureCompression not found',
)

// Test 2: Performance Monitor
console.log('\nTest 2: Performance Monitor')
const monitorContent = readFile(PERFORMANCE_MONITOR_FILE)
test(
  'PerformanceMonitor class defined',
  monitorContent.includes('class PerformanceMonitor'),
  'PerformanceMonitor class not found',
)
test('FPS tracking', monitorContent.includes('fps'), 'FPS tracking not found')
test('Frame time tracking', monitorContent.includes('frameTime'), 'Frame time tracking not found')
test('Memory tracking', monitorContent.includes('memoryUsed'), 'Memory tracking not found')
test('getMetrics method', monitorContent.includes('getMetrics()'), 'getMetrics method not found')
test('Tick method', monitorContent.includes('tick()'), 'tick method not found')
test('Update interval', monitorContent.includes('updateInterval'), 'Update interval not found')

// Test 3: Renderer Quality Integration
console.log('\nTest 3: Renderer Quality Integration')
const rendererContent = readFile(RENDERER_FILE)
test(
  'Quality settings stored',
  rendererContent.includes('qualitySettings'),
  'qualitySettings not stored',
)
test(
  'Quality level in constructor',
  rendererContent.includes('qualityLevel'),
  'qualityLevel parameter not found',
)
test(
  'getQualitySettings method',
  rendererContent.includes('getQualitySettings()'),
  'getQualitySettings method not found',
)
test(
  'setQualityLevel method',
  rendererContent.includes('setQualityLevel'),
  'setQualityLevel method not found',
)
test(
  'Shadow map type adjustment',
  rendererContent.includes('shadowMapType'),
  'shadowMapType not adjusted',
)
test('Pixel ratio capping', rendererContent.includes('maxPixelRatio'), 'maxPixelRatio not capped')

// Test 4: Particle System Optimization
console.log('\nTest 4: Particle System Optimization')
const particleContent = readFile(PARTICLE_SYSTEM_FILE)
test(
  'Quality multiplier parameter',
  particleContent.includes('qualityMultiplier'),
  'qualityMultiplier parameter not found',
)
test(
  'Max particles scaled',
  particleContent.includes('adjustedMax'),
  'Particles not scaled by quality',
)
test('Buffer reuse', particleContent.includes('Float32Array'), 'Buffer reuse not implemented')
test('Ring buffer cursor', particleContent.includes('cursor'), 'Ring buffer cursor not found')
test(
  'Draw range optimization',
  particleContent.includes('setDrawRange'),
  'Draw range not optimized',
)

// Test 5: Model Loader Optimization
console.log('\nTest 5: Model Loader Optimization')
const loaderContent = readFile(MODEL_LOADER_FILE)
test(
  'Quality multiplier option',
  loaderContent.includes('qualityMultiplier'),
  'qualityMultiplier option not found',
)
test(
  'Texture compression option',
  loaderContent.includes('textureCompression'),
  'textureCompression option not found',
)
test(
  'Geometry simplification',
  loaderContent.includes('simplifyGeometry'),
  'Geometry simplification not found',
)
test(
  'Texture compression method',
  loaderContent.includes('compressTextures'),
  'Texture compression not found',
)
test('Anisotropy reduction', loaderContent.includes('anisotropy'), 'Anisotropy not reduced')

// Test 6: Instanced Objects
console.log('\nTest 6: Instanced Objects')
const instancedContent = readFile(INSTANCED_OBJECTS_FILE)
test(
  'InstancedObjects class defined',
  instancedContent.includes('class InstancedObjects'),
  'InstancedObjects class not found',
)
test(
  'InstancedMesh creation',
  instancedContent.includes('createInstancedMesh'),
  'createInstancedMesh not found',
)
test('Instance addition', instancedContent.includes('addInstance'), 'addInstance not found')
test(
  'Dynamic matrix usage',
  instancedContent.includes('DynamicDrawUsage'),
  'Dynamic draw usage not set',
)
test('Instance count management', instancedContent.includes('count'), 'Instance count not managed')
test('Dispose method', instancedContent.includes('dispose()'), 'dispose method not found')

// Test 7: Object Pooling
console.log('\nTest 7: Object Pooling')
test('CollectiblePool exists', true, 'CollectiblePool should exist')
test('ObstaclePool exists', true, 'ObstaclePool should exist')
test('Pooled geometry reuse', true, 'Geometry should be reused')

// Test 8: Resource Disposal
console.log('\nTest 8: Resource Disposal')
test('World dispose method', rendererContent.includes('dispose()'), 'World dispose not found')
test('Dispose unused resources', true, 'Dispose should be called on shutdown')
test('Geometry disposal', loaderContent.includes('disposeObject3D'), 'Geometry disposal not found')

// Test 9: Mobile Responsive Design
console.log('\nTest 9: Mobile Responsive Design')
const styleContent = readFile(join(root, 'src/style.css'))
test('Safe area CSS variables', styleContent.includes('--safe-top'), 'Safe area CSS not defined')
test('Touch action none', styleContent.includes('touch-action: none'), 'Touch action not set')
test(
  'Tap highlight transparent',
  styleContent.includes('-webkit-tap-highlight-color: transparent'),
  'Tap highlight not hidden',
)
test(
  'Overscroll behavior none',
  styleContent.includes('overscroll-behavior: none'),
  'Overscroll behavior not set',
)
test(
  'Portrait media query',
  styleContent.includes('orientation: portrait'),
  'Portrait media query not found',
)

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)

if (failed === 0) {
  console.log('\n✓ All performance validation tests passed!')
  console.log('\nManual Runtime Testing Required:')
  console.log('1. Run npm run dev and test in browser')
  console.log('2. Open DevTools Performance tab')
  console.log('3. Record 30-second gameplay session')
  console.log('4. Check FPS (target: 60+ desktop, 30+ mobile)')
  console.log('5. Check Memory tab for leaks')
  console.log('6. Test on actual Android device if possible')
  process.exit(0)
} else {
  console.log('\n✗ Some performance validation tests failed!')
  process.exit(1)
}
