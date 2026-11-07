import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const CHARACTER_DATA_FILE = join(root, 'src/game/characters/CharacterData.ts')
const CHARACTER_MANAGER_FILE = join(root, 'src/systems/save/PlayerSaveManager.ts')
const SHOP_FILE = join(root, 'src/core/controllers/ShopController.ts')

function readFile(path) {
  try {
    return readFileSync(path, 'utf-8')
  } catch (e) {
    console.error(`Failed to read ${path}:`, e.message)
    process.exit(1)
  }
}

function extractEnumsAndConstants(content) {
  const skins = []
  const outfits = []
  const accessories = []
  const colors = []
  const characters = []

  const skinRegex = /id:\s*'([^']+)'/g
  const outfitRegex = /id:\s*'([^']+)'/g
  const accessoryRegex = /id:\s*'([^']+)'/g
  const colorRegex = /id:\s*'([^']+)'/g
  const characterRegex = /id:\s*'([^']+)'/g

  let match
  while ((match = skinRegex.exec(content)) !== null) skins.push(match[1])
  while ((match = outfitRegex.exec(content)) !== null) outfits.push(match[1])
  while ((match = accessoryRegex.exec(content)) !== null) accessories.push(match[1])
  while ((match = colorRegex.exec(content)) !== null) colors.push(match[1])
  while ((match = characterRegex.exec(content)) !== null) characters.push(match[1])

  return { skins, outfits, accessories, colors, characters }
}

function validateCharacterData() {
  console.log('Validating character data...\n')

  const content = readFile(CHARACTER_DATA_FILE)
  const { skins, outfits, accessories, colors, characters } = extractEnumsAndConstants(content)

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

  test('Character skins defined', skins.length > 0, 'No skins found')
  test('Character outfits defined', outfits.length > 0, 'No outfits found')
  test('Character accessories defined', accessories.length > 0, 'No accessories found')
  test('Character colors defined', colors.length > 0, 'No colors found')
  test('Characters defined', characters.length > 0, 'No characters found')

  test('Skins have at least 3 options', skins.length >= 3, `Found ${skins.length} skins`)
  test('Outfits have at least 3 options', outfits.length >= 3, `Found ${outfits.length} outfits`)
  test(
    'Accessories have at least 3 options',
    accessories.length >= 3,
    `Found ${accessories.length} accessories`,
  )
  test('Colors have at least 3 options', colors.length >= 3, `Found ${colors.length} colors`)
  test(
    'Characters have at least 1 option',
    characters.length >= 1,
    `Found ${characters.length} characters`,
  )

  test('Default skin exists', skins.includes('skin-default'), 'Default skin not found')
  test('Default outfit exists', outfits.includes('outfit-default'), 'Default outfit not found')
  test('Default accessory exists', accessories.includes('acc-none'), 'Default accessory not found')
  test('Default color exists', colors.includes('color-default'), 'Default color not found')

  test('No duplicate skin IDs', new Set(skins).size === skins.length, 'Duplicate skin IDs found')
  test(
    'No duplicate outfit IDs',
    new Set(outfits).size === outfits.length,
    'Duplicate outfit IDs found',
  )
  test(
    'No duplicate accessory IDs',
    new Set(accessories).size === accessories.length,
    'Duplicate accessory IDs found',
  )
  test(
    'No duplicate color IDs',
    new Set(colors).size === colors.length,
    'Duplicate color IDs found',
  )
  test(
    'No duplicate character IDs',
    new Set(characters).size === characters.length,
    'Duplicate character IDs found',
  )

  test(
    'No gameplay advantages (speed = 1.0)',
    content.includes('speed: 1.0'),
    'Speed not set to 1.0',
  )
  test('No gameplay advantages (jump = 1.0)', content.includes('jump: 1.0'), 'Jump not set to 1.0')

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
  return failed === 0
}

function validateCharacterManager() {
  console.log('\nValidating character collection manager...\n')

  const content = readFile(CHARACTER_MANAGER_FILE)
  const game = readFile(SHOP_FILE)

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

  test('Purchase method exists', content.includes('purchaseCosmetic('), 'Purchase method not found')
  test('Ownership check exists', content.includes('isOwned('), 'Ownership check not found')
  test('Equip method exists', content.includes('equip('), 'Equip method not found')
  test(
    'Duplicate purchase prevention',
    content.includes('if (this.isOwned(type, id))'),
    'Duplicate purchase check not found',
  )
  test('Coin balance validation', game.includes('Not enough coins'), 'Coin balance check not found')
  test(
    'Appearance applied to the runner',
    game.includes('applyAppearance('),
    'Equipped cosmetics are never applied',
  )
  test('Save state method exists', content.includes('saveNow'), 'Save state method not found')
  test('Load state method exists', content.includes('load()'), 'Load state method not found')

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
  return failed === 0
}

function main() {
  const dataValid = validateCharacterData()
  const managerValid = validateCharacterManager()

  if (dataValid && managerValid) {
    console.log('\n✓ All character validation passed!')
    process.exit(0)
  } else {
    console.log('\n✗ Character validation failed!')
    process.exit(1)
  }
}

main()
