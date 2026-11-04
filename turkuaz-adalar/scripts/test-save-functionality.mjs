/**
 * Test script for save functionality with invalid data handling.
 * This script runs in a Node environment and simulates localStorage.
 */

class MockLocalStorage {
  constructor() {
    this.store = new Map()
  }

  getItem(key) {
    return this.store.get(key) || null
  }

  setItem(key, value) {
    this.store.set(key, value)
  }

  removeItem(key) {
    this.store.delete(key)
  }

  clear() {
    this.store.clear()
  }
}

// Mock window object
global.window = {
  localStorage: new MockLocalStorage(),
  setTimeout: (fn, delay) => setTimeout(fn, delay),
  clearTimeout: (id) => clearTimeout(id),
}

import { sanitiseSaveState, DEFAULT_PLAYER_SAVE, CURRENT_SAVE_VERSION, createDefaultSave } from '../src/systems/save/PlayerSaveState.ts'
import { toggleAccessory } from '../src/game/characters/CharacterData.ts'
import { PlayerSaveManager } from '../src/systems/save/PlayerSaveManager.ts'
import { SaveManager } from '../src/systems/save/SaveManager.ts'

console.log('Testing save system with invalid data handling...\n')

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

// Test 1: Valid save state
console.log('Test 1: Valid save state')
const validState = {
  version: CURRENT_SAVE_VERSION,
  progression: {
    bestScore: 1000,
    bestDistance: 500,
    totalRuns: 10,
    totalCrystals: 5,
    coins: 100,
  },
  unlockedLevels: ['turkuaz-shallows', 'azure-rapids'],
  levelProgress: {
    'turkuaz-shallows': {
      attempts: 5,
      completed: true,
      bestDistance: 300,
      bestScore: 500,
      totalCoins: 50,
      totalCrystals: 2,
      unlockedAt: Date.now(),
    },
  },
  characterCollection: {
    ownedSkins: ['skin-default', 'skin-crimson'],
    ownedOutfits: ['outfit-default'],
    ownedAccessories: ['acc-none'],
    ownedColors: ['color-default'],
    equipped: {
      characterId: 'turkuaz-runner',
      skinId: 'skin-default',
      outfitId: 'outfit-default',
      accessoryIds: ['acc-none'],
      colorId: 'color-default',
    },
  },
  settings: {
    musicVolume: 0.7,
    sfxVolume: 0.5,
    quality: 'high',
    controlHints: false,
    vibration: true,
    muted: false,
  },
  tutorial: {
    completed: true,
    completedAt: Date.now(),
    stepsCompleted: ['move', 'jump', 'collect'],
  },
  createdAt: Date.now(),
  lastSavedAt: Date.now(),
}

const sanitisedValid = sanitiseSaveState(validState)
test('Valid state preserves version', sanitisedValid.version === CURRENT_SAVE_VERSION, 'Version mismatch')
test('Valid state preserves coins', sanitisedValid.progression.coins === 100, 'Coins mismatch')
test('Valid state preserves unlocked levels', sanitisedValid.unlockedLevels.length === 2, 'Unlocked levels mismatch')
test('Valid state preserves character collection', sanitisedValid.characterCollection.ownedSkins.length === 2, 'Character collection mismatch')
test('Valid state preserves settings', sanitisedValid.settings.musicVolume === 0.7, 'Settings mismatch')
test('Valid state preserves tutorial', sanitisedValid.tutorial.completed === true, 'Tutorial mismatch')

// Test 2: Null input
console.log('\nTest 2: Null input')
const nullResult = sanitiseSaveState(null)
test('Null input returns defaults', nullResult.progression.coins === 0, 'Null should return defaults')
test('Null input has correct version', nullResult.version === CURRENT_SAVE_VERSION, 'Version should be current')

// Test 3: Invalid object
console.log('\nTest 3: Invalid object')
const invalidResult = sanitiseSaveState({ random: 'data' })
test('Invalid object returns defaults', invalidResult.progression.coins === 0, 'Invalid should return defaults')

// Test 4: Corrupted numbers
console.log('\nTest 4: Corrupted numbers')
const corruptedNumbers = {
  version: CURRENT_SAVE_VERSION,
  progression: {
    bestScore: -100,
    bestDistance: 'invalid',
    totalRuns: Infinity,
    totalCrystals: NaN,
    coins: 'not a number',
  },
  unlockedLevels: [],
  levelProgress: {},
  characterCollection: DEFAULT_PLAYER_SAVE.characterCollection,
  settings: DEFAULT_PLAYER_SAVE.settings,
  tutorial: DEFAULT_PLAYER_SAVE.tutorial,
  createdAt: Date.now(),
  lastSavedAt: Date.now(),
}

const sanitisedNumbers = sanitiseSaveState(corruptedNumbers)
test('Negative numbers sanitized to 0', sanitisedNumbers.progression.bestScore === 0, 'Negative number not sanitized')
test('String numbers sanitized to 0', sanitisedNumbers.progression.bestDistance === 0, 'String number not sanitized')
test('Infinity sanitized to 0', sanitisedNumbers.progression.totalRuns === 0, 'Infinity not sanitized')
test('NaN sanitized to 0', sanitisedNumbers.progression.totalCrystals === 0, 'NaN not sanitized')
test('Invalid coins sanitized to 0', sanitisedNumbers.progression.coins === 0, 'Invalid coins not sanitized')

// Test 5: Corrupted arrays
console.log('\nTest 5: Corrupted arrays')
const corruptedArrays = {
  version: CURRENT_SAVE_VERSION,
  progression: DEFAULT_PLAYER_SAVE.progression,
  unlockedLevels: ['valid', 123, null, undefined, 'also-valid'],
  levelProgress: {},
  characterCollection: {
    ownedSkins: ['skin-default', {}, [], 'skin-crimson'],
    ownedOutfits: null,
    ownedAccessories: ['acc-none'],
    ownedColors: undefined,
    equipped: DEFAULT_PLAYER_SAVE.characterCollection.equipped,
  },
  settings: DEFAULT_PLAYER_SAVE.settings,
  tutorial: DEFAULT_PLAYER_SAVE.tutorial,
  createdAt: Date.now(),
  lastSavedAt: Date.now(),
}

const sanitisedArrays = sanitiseSaveState(corruptedArrays)
test('Invalid array elements filtered', sanitisedArrays.unlockedLevels.length === 2, 'Invalid array elements not filtered')
test('Null arrays replaced with defaults', sanitisedArrays.characterCollection.ownedOutfits.length === 1, 'Null array not replaced')
test('Undefined arrays replaced with defaults', sanitisedArrays.characterCollection.ownedColors.length === 1, 'Undefined array not replaced')

// Test 6: Corrupted booleans
console.log('\nTest 6: Corrupted booleans')
const corruptedBooleans = {
  version: CURRENT_SAVE_VERSION,
  progression: DEFAULT_PLAYER_SAVE.progression,
  unlockedLevels: [],
  levelProgress: {
    'test-level': {
      attempts: 5,
      completed: 'yes',
      bestDistance: 100,
      bestScore: 200,
      totalCoins: 10,
      totalCrystals: 1,
      unlockedAt: Date.now(),
    },
  },
  characterCollection: DEFAULT_PLAYER_SAVE.characterCollection,
  settings: {
    musicVolume: 0.5,
    sfxVolume: 0.5,
    quality: 'invalid',
    controlHints: 'true',
    vibration: null,
    muted: 1,
  },
  tutorial: {
    completed: undefined,
    completedAt: Date.now(),
    stepsCompleted: [],
  },
  createdAt: Date.now(),
  lastSavedAt: Date.now(),
}

const sanitisedBooleans = sanitiseSaveState(corruptedBooleans)
test('Invalid boolean defaults to false', sanitisedBooleans.levelProgress['test-level'].completed === false, 'Invalid boolean not defaulted')
test('Invalid quality defaults to medium', sanitisedBooleans.settings.quality === 'medium', 'Invalid quality not defaulted')
test('Invalid control hints defaults to true', sanitisedBooleans.settings.controlHints === true, 'Invalid control hints not defaulted')
test('Invalid vibration defaults to true', sanitisedBooleans.settings.vibration === true, 'Invalid vibration not defaulted')
test('Invalid muted defaults to false', sanitisedBooleans.settings.muted === false, 'Invalid muted not defaulted')
test('Invalid tutorial completed defaults to false', sanitisedBooleans.tutorial.completed === false, 'Invalid tutorial completed not defaulted')

// Test 7: Version mismatch
console.log('\nTest 7: Version mismatch')
const oldVersion = {
  version: 0,
  progression: DEFAULT_PLAYER_SAVE.progression,
  unlockedLevels: [],
  levelProgress: {},
  characterCollection: DEFAULT_PLAYER_SAVE.characterCollection,
  settings: DEFAULT_PLAYER_SAVE.settings,
  tutorial: DEFAULT_PLAYER_SAVE.tutorial,
  createdAt: Date.now(),
  lastSavedAt: Date.now(),
}

const sanitisedVersion = sanitiseSaveState(oldVersion)
test('Old version preserved in sanitisation (upgrade in PlayerSaveManager)', sanitisedVersion.version === 0, 'Version should be preserved in sanitisation')

// Test 8: Clamped values
console.log('\nTest 8: Clamped values')
const outOfRange = {
  version: CURRENT_SAVE_VERSION,
  progression: DEFAULT_PLAYER_SAVE.progression,
  unlockedLevels: [],
  levelProgress: {},
  characterCollection: DEFAULT_PLAYER_SAVE.characterCollection,
  settings: {
    musicVolume: 2.5,
    sfxVolume: -1,
    quality: 'medium',
    controlHints: true,
    vibration: true,
    muted: false,
  },
  tutorial: DEFAULT_PLAYER_SAVE.tutorial,
  createdAt: Date.now(),
  lastSavedAt: Date.now(),
}

const sanitisedClamped = sanitiseSaveState(outOfRange)
test('Volume clamped to max 1', sanitisedClamped.settings.musicVolume === 1, 'Volume not clamped to max')
test('Volume clamped to min 0', sanitisedClamped.settings.sfxVolume === 0, 'Volume not clamped to min')

// --- Cosmetics: ownership, equip and integrity -------------------------------

const fresh = createDefaultSave()
fresh.characterCollection.ownedSkins.push('skin-crimson')
test('Default save arrays are not shared', !DEFAULT_PLAYER_SAVE.characterCollection.ownedSkins.includes('skin-crimson'), 'Mutating a fresh save leaked into DEFAULT_PLAYER_SAVE')

const forged = sanitiseSaveState({
  ...DEFAULT_PLAYER_SAVE,
  characterCollection: {
    ownedSkins: [],
    ownedOutfits: [],
    ownedAccessories: [],
    ownedColors: [],
    equipped: { characterId: 'ocean-master', skinId: 'skin-royal', outfitId: 'outfit-default', accessoryIds: ['acc-wings'], colorId: 'color-default' },
  },
})
test('Default items are always owned', forged.characterCollection.ownedSkins.includes('skin-default') && forged.characterCollection.ownedCharacters.includes('turkuaz-runner'), 'Default items missing after sanitise')
test('Unowned equipped character reset', forged.characterCollection.equipped.characterId === 'turkuaz-runner', 'Unowned character stayed equipped')
test('Unowned equipped skin reset', forged.characterCollection.equipped.skinId === 'skin-default', 'Unowned skin stayed equipped')
test('Unowned accessory dropped', forged.characterCollection.equipped.accessoryIds.join() === 'acc-none', 'Unowned accessory stayed equipped')

test('Accessory slot replaces same slot', toggleAccessory(['acc-cap'], 'acc-goggles').join() === 'acc-goggles', 'Two head accessories equipped')
test('Accessories in different slots stack', toggleAccessory(['acc-cap', 'acc-bandana'], 'acc-wings').sort().join() === 'acc-bandana,acc-cap,acc-wings', 'Different slots did not stack')
test('Equipping a worn accessory removes it', toggleAccessory(['acc-cap'], 'acc-cap').join() === 'acc-none', 'Worn accessory not removed')
test('acc-none clears all accessories', toggleAccessory(['acc-cap', 'acc-wings'], 'acc-none').join() === 'acc-none', 'acc-none did not clear')

window.localStorage.clear()
const manager = new PlayerSaveManager(new SaveManager())
test('Cannot equip unowned item', manager.equip('skin', 'skin-golden') === false && manager.characterCollection.equipped.skinId === 'skin-default', 'Unowned skin was equipped')
test('Purchase records ownership once', manager.purchaseCosmetic('skin', 'skin-golden') === true && manager.purchaseCosmetic('skin', 'skin-golden') === false, 'Duplicate purchase accepted')
test('Owned item can be equipped', manager.equip('skin', 'skin-golden') && manager.characterCollection.equipped.skinId === 'skin-golden', 'Owned skin not equipped')
test('Characters can be unlocked and equipped', manager.purchaseCosmetic('character', 'swift-runner') && manager.equip('character', 'swift-runner') && manager.characterCollection.equipped.characterId === 'swift-runner', 'Character unlock failed')
manager.saveNow()
const reloaded = new PlayerSaveManager(new SaveManager())
test('Equipped cosmetics survive reload', reloaded.characterCollection.equipped.skinId === 'skin-golden' && reloaded.characterCollection.equipped.characterId === 'swift-runner', 'Equip state lost after reload')
manager.dispose()
reloaded.dispose()

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)

if (failed === 0) {
  console.log('\n✓ All save functionality tests passed!')
  process.exit(0)
} else {
  console.log('\n✗ Save functionality tests failed!')
  process.exit(1)
}
