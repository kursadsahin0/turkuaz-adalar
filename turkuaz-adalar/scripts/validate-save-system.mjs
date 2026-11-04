import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const SAVE_STATE_FILE = join(root, 'src/systems/save/PlayerSaveState.ts')
const SAVE_MANAGER_FILE = join(root, 'src/systems/save/PlayerSaveManager.ts')

function readFile(path) {
  try {
    return readFileSync(path, 'utf-8')
  } catch (e) {
    console.error(`Failed to read ${path}:`, e.message)
    process.exit(1)
  }
}

function validatePlayerSaveState() {
  console.log('Validating PlayerSaveState...\n')

  const content = readFile(SAVE_STATE_FILE)

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

  test('PlayerProgression interface defined', content.includes('interface PlayerProgression'), 'Interface not found')
  test('Progression includes coins', content.includes('coins: number'), 'Coins field missing')
  test('Progression includes bestScore', content.includes('bestScore: number'), 'bestScore field missing')
  test('Progression includes bestDistance', content.includes('bestDistance: number'), 'bestDistance field missing')
  test('Progression includes totalRuns', content.includes('totalRuns: number'), 'totalRuns field missing')
  test('Progression includes totalCrystals', content.includes('totalCrystals: number'), 'totalCrystals field missing')

  test('LevelProgress interface defined', content.includes('interface LevelProgress'), 'Interface not found')
  test('LevelProgress includes attempts', content.includes('attempts: number'), 'attempts field missing')
  test('LevelProgress includes completed', content.includes('completed: boolean'), 'completed field missing')
  test('LevelProgress includes bestDistance', content.includes('bestDistance: number'), 'bestDistance field missing in LevelProgress')
  test('LevelProgress includes bestScore', content.includes('bestScore: number'), 'bestScore field missing in LevelProgress')
  test('LevelProgress includes totalCoins', content.includes('totalCoins: number'), 'totalCoins field missing')
  test('LevelProgress includes totalCrystals', content.includes('totalCrystals: number'), 'totalCrystals field missing')
  test('LevelProgress includes unlockedAt', content.includes('unlockedAt: number'), 'unlockedAt field missing')

  test('CharacterCollection interface defined', content.includes('interface CharacterCollection'), 'Interface not found')
  test('CharacterCollection includes ownedSkins', content.includes('ownedSkins: string[]'), 'ownedSkins field missing')
  test('CharacterCollection includes ownedOutfits', content.includes('ownedOutfits: string[]'), 'ownedOutfits field missing')
  test('CharacterCollection includes ownedAccessories', content.includes('ownedAccessories: string[]'), 'ownedAccessories field missing')
  test('CharacterCollection includes ownedColors', content.includes('ownedColors: string[]'), 'ownedColors field missing')
  test('CharacterCollection includes equipped', content.includes('equipped:'), 'equipped field missing')

  test('GameSettings interface defined', content.includes('interface GameSettings'), 'Interface not found')
  test('GameSettings includes musicVolume', content.includes('musicVolume: number'), 'musicVolume field missing')
  test('GameSettings includes sfxVolume', content.includes('sfxVolume: number'), 'sfxVolume field missing')
  test('GameSettings includes quality', content.includes('quality:'), 'quality field missing')
  test('GameSettings includes controlHints', content.includes('controlHints: boolean'), 'controlHints field missing')
  test('GameSettings includes vibration', content.includes('vibration: boolean'), 'vibration field missing')
  test('GameSettings includes muted', content.includes('muted: boolean'), 'muted field missing')

  test('TutorialState interface defined', content.includes('interface TutorialState'), 'Interface not found')
  test('TutorialState includes completed', content.includes('completed: boolean'), 'completed field missing')
  test('TutorialState includes completedAt', content.includes('completedAt: number'), 'completedAt field missing')
  test('TutorialState includes stepsCompleted', content.includes('stepsCompleted: string[]'), 'stepsCompleted field missing')

  test('PlayerSaveState interface defined', content.includes('interface PlayerSaveState'), 'Interface not found')
  test('PlayerSaveState includes version', content.includes('version: number'), 'version field missing')
  test('PlayerSaveState includes progression', content.includes('progression: PlayerProgression'), 'progression field missing')
  test('PlayerSaveState includes unlockedLevels', content.includes('unlockedLevels: string[]'), 'unlockedLevels field missing')
  test('PlayerSaveState includes levelProgress', content.includes('levelProgress: Record<string, LevelProgress>'), 'levelProgress field missing')
  test('PlayerSaveState includes characterCollection', content.includes('characterCollection: CharacterCollection'), 'characterCollection field missing')
  test('PlayerSaveState includes settings', content.includes('settings: GameSettings'), 'settings field missing')
  test('PlayerSaveState includes tutorial', content.includes('tutorial: TutorialState'), 'tutorial field missing')
  test('PlayerSaveState includes createdAt', content.includes('createdAt: number'), 'createdAt field missing')
  test('PlayerSaveState includes lastSavedAt', content.includes('lastSavedAt: number'), 'lastSavedAt field missing')

  test('Save version constant defined', content.includes('CURRENT_SAVE_VERSION'), 'CURRENT_SAVE_VERSION not found')
  test('Default save state defined', content.includes('DEFAULT_PLAYER_SAVE'), 'DEFAULT_PLAYER_SAVE not found')

  test('Sanitise progression function exists', content.includes('sanitiseProgression'), 'sanitiseProgression not found')
  test('Sanitise level progress function exists', content.includes('sanitiseLevelProgress'), 'sanitiseLevelProgress not found')
  test('Sanitise character collection function exists', content.includes('sanitiseCharacterCollection'), 'sanitiseCharacterCollection not found')
  test('Sanitise settings function exists', content.includes('sanitiseSettings'), 'sanitiseSettings not found')
  test('Sanitise tutorial function exists', content.includes('sanitiseTutorial'), 'sanitiseTutorial not found')
  test('Sanitise save state function exists', content.includes('sanitiseSaveState'), 'sanitiseSaveState not found')

  test('Default unlocked levels includes first level', content.includes('turkuaz-shallows'), 'Default level not found')
  test('Default skin exists', content.includes('skin-default'), 'Default skin not found')
  test('Default outfit exists', content.includes('outfit-default'), 'Default outfit not found')
  test('Default accessory exists', content.includes('acc-none'), 'Default accessory not found')
  test('Default color exists', content.includes('color-default'), 'Default color not found')

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
  return failed === 0
}

function validatePlayerSaveManager() {
  console.log('\nValidating PlayerSaveManager...\n')

  const content = readFile(SAVE_MANAGER_FILE)

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

  test('PlayerSaveManager class defined', content.includes('class PlayerSaveManager'), 'Class not found')
  test('Load method exists', content.includes('private load()'), 'load method not found')
  test('Save method exists', content.includes('saveNow()'), 'saveNow method not found')
  test('Update progression method exists', content.includes('updateProgression'), 'updateProgression method not found')
  test('Update unlocked levels method exists', content.includes('updateUnlockedLevels'), 'updateUnlockedLevels method not found')
  test('Update level progress method exists', content.includes('updateLevelProgress'), 'updateLevelProgress method not found')
  test('Update character collection method exists', content.includes('updateCharacterCollection'), 'updateCharacterCollection method not found')
  test('Update settings method exists', content.includes('updateSettings'), 'updateSettings method not found')
  test('Update tutorial method exists', content.includes('updateTutorial'), 'updateTutorial method not found')
  test('Is owned method exists', content.includes('isOwned'), 'isOwned method not found')
  test('Purchase cosmetic method exists', content.includes('purchaseCosmetic'), 'purchaseCosmetic method not found')
  test('Reset method exists', content.includes('reset()'), 'reset method not found')
  test('Clear method exists', content.includes('clear()'), 'clear method not found')
  test('Export method exists', content.includes('export()'), 'export method not found')
  test('Import method exists', content.includes('import('), 'import method not found')
  test('Dispose method exists', content.includes('dispose()'), 'dispose method not found')

  test('Migration system exists', content.includes('MIGRATIONS'), 'MIGRATIONS not found')
  test('Run migrations method exists', content.includes('runMigrations'), 'runMigrations method not found')
  test('Auto-save scheduling exists', content.includes('scheduleAutoSave'), 'scheduleAutoSave not found')
  test('Dirty tracking exists', content.includes('dirty'), 'dirty flag not found')

  test('Error handling in load', content.includes('try {'), 'Error handling missing')
  test('Fallback to defaults on error', content.includes('createDefaultSave()'), 'Default fallback missing')

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
  return failed === 0
}

function main() {
  const stateValid = validatePlayerSaveState()
  const managerValid = validatePlayerSaveManager()

  if (stateValid && managerValid) {
    console.log('\n✓ All save system validation passed!')
    process.exit(0)
  } else {
    console.log('\n✗ Save system validation failed!')
    process.exit(1)
  }
}

main()
