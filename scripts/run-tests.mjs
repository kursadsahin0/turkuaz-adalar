/**
 * `npm test`: runs every validation and test script in sequence and prints a
 * summary. Exits non-zero if any suite fails, so CI can gate on it.
 *
 *   npm test                 # all suites
 *   npm test -- save meta    # only suites whose name contains a filter
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const SUITES = [
  ['character-glb', 'scripts/validate-character-glb.mjs'],
  ['assets', 'scripts/validate-asset-pipeline.mjs'],
  ['camera', 'scripts/validate-camera-system.mjs'],
  ['movement', 'scripts/validate-movement-system.mjs'],
  ['advanced-movement', 'scripts/validate-advanced-movement.mjs'],
  ['collectibles', 'scripts/validate-collectibles.mjs'],
  ['levels', 'scripts/validate-levels.mjs'],
  ['characters', 'scripts/validate-characters.mjs'],
  ['save-system', 'scripts/validate-save-system.mjs'],
  ['save', 'scripts/test-save-functionality.mjs'],
  ['meta', 'scripts/test-meta-systems.mjs'],
  ['monetization', 'scripts/validate-monetization.mjs'],
  ['performance', 'scripts/test-performance.mjs'],
]

const filters = process.argv.slice(2)
const verbose = process.env.VERBOSE === '1'
const selected = filters.length
  ? SUITES.filter(([name]) => filters.some((filter) => name.includes(filter)))
  : SUITES

if (selected.length === 0) {
  console.error(`No suite matches: ${filters.join(', ')}`)
  process.exit(1)
}

const results = []
for (const [name, script] of selected) {
  const started = performance.now()
  const run = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
    maxBuffer: 64 * 1024 * 1024,
  })
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  const ok = run.status === 0
  results.push({ name, ok, seconds })
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(18)} ${seconds.padStart(5)}s`)
  if (!ok || verbose) {
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim()
    // On failure show the tail, where the failing checks and summary are.
    console.log(
      output
        .split('\n')
        .slice(ok ? 0 : -40)
        .map((line) => `    ${line}`)
        .join('\n'),
    )
  }
}

const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} suites passed`)
if (failed.length > 0) {
  console.log(`Failed: ${failed.map((result) => result.name).join(', ')}`)
  process.exit(1)
}
