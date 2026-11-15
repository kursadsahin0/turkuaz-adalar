import type { Season } from './Seasons.ts'

/**
 * Character customization data structures.
 * All cosmetics are visual only - no gameplay advantages.
 */

/** What an item is priced in. Most items cost coins; a few premium ones crystals. */
export type CosmeticCurrency = 'coins' | 'crystals'

export interface CharacterSkin {
  id: string
  /** Defaults to coins. */
  currency?: CosmeticCurrency
  name: string
  description: string
  unlockCost: number
  color: number
  isDefault: boolean
  /** Sold only in this season (kept forever once bought). */
  season?: Season
}

export interface CharacterOutfit {
  id: string
  /** Defaults to coins. */
  currency?: CosmeticCurrency
  name: string
  description: string
  unlockCost: number
  isDefault: boolean
}

export interface CharacterAccessory {
  id: string
  /** Defaults to coins. */
  currency?: CosmeticCurrency
  name: string
  description: string
  unlockCost: number
  isDefault: boolean
  position: 'head' | 'neck' | 'back' | 'side'
}

export interface CharacterColor {
  id: string
  /** Defaults to coins. */
  currency?: CosmeticCurrency
  name: string
  description: string
  unlockCost: number
  color: number
  isDefault: boolean
}

/** Purely visual body style; the gameplay capsule never changes. */
export interface CharacterBuild {
  /** Horizontal (shoulder) scale relative to the authored model. */
  readonly width: number
  /** Vertical scale relative to the authored model. */
  readonly height: number
  readonly hairColor: number | null
  /** i18n key suffix for the style line on the card. */
  readonly style: 'classic' | 'lean' | 'sturdy'
  /** Which body in the character GLB this runner uses. */
  readonly model: CharacterModelId
}

/** The bodies in turkuaz_runner.glb (see blender/build_kaykit_characters.py). */
export const CHARACTER_MODELS = [
  'runner',
  'swift',
  'ocean',
  'mage',
  'sage',
  'knight',
  'guardian',
] as const
export type CharacterModelId = (typeof CHARACTER_MODELS)[number]

export interface CharacterDefinition {
  id: string
  /** Defaults to coins. */
  currency?: CosmeticCurrency
  name: string
  description: string
  defaultSkin: string
  build: CharacterBuild
  /** Always 1.0: characters are cosmetic and never change gameplay. */
  speed: number
  jump: number
  unlocked: boolean
  unlockCost: number
}

export interface CharacterCustomization {
  characterId: string
  skinId: string
  outfitId: string
  accessoryIds: string[]
  colorId: string
}

/** Everything the character screen can buy or equip. */
export type CosmeticType = 'character' | 'skin' | 'outfit' | 'accessory' | 'color'

export interface CharacterCollectionState {
  ownedCharacters: string[]
  ownedSkins: string[]
  ownedOutfits: string[]
  ownedAccessories: string[]
  ownedColors: string[]
  equipped: CharacterCustomization
}

export const CHARACTER_SKINS: readonly CharacterSkin[] = [
  {
    id: 'skin-default',
    name: 'Turquoise Runner',
    description: 'The classic island look.',
    unlockCost: 0,
    color: 0x61f5e3,
    isDefault: true,
  },
  {
    id: 'skin-crimson',
    name: 'Crimson Tide',
    description: 'A bold red color for daring runners.',
    unlockCost: 500,
    color: 0xdc143c,
    isDefault: false,
  },
  {
    id: 'skin-golden',
    name: 'Golden Sun',
    description: 'Shine bright like the tropical sun.',
    unlockCost: 750,
    color: 0xffd700,
    isDefault: false,
  },
  {
    id: 'skin-forest',
    name: 'Forest Green',
    description: 'Blend with the lush jungle.',
    unlockCost: 600,
    color: 0x228b22,
    isDefault: false,
  },
  {
    id: 'skin-royal',
    name: 'Royal Purple',
    description: 'For the most elegant runners.',
    unlockCost: 25,
    currency: 'crystals',
    color: 0x6a0dad,
    isDefault: false,
  },
  // Seasonal skins: on sale only in their season.
  {
    id: 'skin-winter',
    name: 'Snowflake',
    description: 'Frost-white for the winter islands.',
    unlockCost: 30,
    currency: 'crystals',
    color: 0xbfe9ff,
    isDefault: false,
    season: 'winter',
  },
  {
    id: 'skin-spring',
    name: 'Cherry Blossom',
    description: 'Petal pink for spring.',
    unlockCost: 30,
    currency: 'crystals',
    color: 0xf7a8c8,
    isDefault: false,
    season: 'spring',
  },
  {
    id: 'skin-summer',
    name: 'Coral Summer',
    description: 'Warm coral for long summer runs.',
    unlockCost: 30,
    currency: 'crystals',
    color: 0xff8a5b,
    isDefault: false,
    season: 'summer',
  },
  {
    id: 'skin-autumn',
    name: 'Autumn Leaf',
    description: 'Russet and gold for the autumn tide.',
    unlockCost: 30,
    currency: 'crystals',
    color: 0xc8642a,
    isDefault: false,
    season: 'autumn',
  },
]

export const CHARACTER_OUTFITS: readonly CharacterOutfit[] = [
  {
    id: 'outfit-default',
    name: "Runner's Suit",
    description: 'Standard athletic gear.',
    unlockCost: 0,
    isDefault: true,
  },
  {
    id: 'outfit-explorer',
    name: 'Explorer Gear',
    description: 'Ready for adventure.',
    unlockCost: 400,
    isDefault: false,
  },
  {
    id: 'outfit-diver',
    name: 'Diver Suit',
    description: 'For underwater runs.',
    unlockCost: 350,
    isDefault: false,
  },
  {
    id: 'outfit-formal',
    name: 'Formal Attire',
    description: 'Run in style.',
    unlockCost: 800,
    isDefault: false,
  },
]

export const CHARACTER_ACCESSORIES: readonly CharacterAccessory[] = [
  {
    id: 'acc-none',
    name: 'None',
    description: 'No accessory.',
    unlockCost: 0,
    isDefault: true,
    position: 'head',
  },
  {
    id: 'acc-cap',
    name: 'Explorer Cap',
    description: 'A trusty sun hat.',
    unlockCost: 300,
    isDefault: false,
    position: 'head',
  },
  {
    id: 'acc-goggles',
    name: 'Tide Goggles',
    description: 'See clearly in the spray.',
    unlockCost: 450,
    isDefault: false,
    position: 'head',
  },
  {
    id: 'acc-bandana',
    name: 'Island Bandana',
    description: 'A colorful neck scarf.',
    unlockCost: 250,
    isDefault: false,
    position: 'neck',
  },
  {
    id: 'acc-backpack',
    name: 'Adventure Pack',
    description: 'Carry your supplies.',
    unlockCost: 400,
    isDefault: false,
    position: 'back',
  },
  {
    id: 'acc-wings',
    name: 'Glider Wings',
    description: 'Look ready to soar.',
    unlockCost: 30,
    currency: 'crystals',
    isDefault: false,
    position: 'back',
  },
]

export const CHARACTER_COLORS: readonly CharacterColor[] = [
  {
    id: 'color-default',
    name: 'Turquoise',
    description: 'The original island hue.',
    unlockCost: 0,
    color: 0x61f5e3,
    isDefault: true,
  },
  {
    id: 'color-sunset',
    name: 'Sunset Orange',
    description: 'Warm evening glow.',
    unlockCost: 300,
    color: 0xff8c00,
    isDefault: false,
  },
  {
    id: 'color-ocean',
    name: 'Deep Ocean',
    description: 'Dark blue depths.',
    unlockCost: 400,
    color: 0x006994,
    isDefault: false,
  },
  {
    id: 'color-mint',
    name: 'Fresh Mint',
    description: 'Light and refreshing.',
    unlockCost: 350,
    color: 0x00ff7f,
    isDefault: false,
  },
  {
    id: 'color-lavender',
    name: 'Soft Lavender',
    description: 'Gentle purple tones.',
    unlockCost: 15,
    currency: 'crystals',
    color: 0x9370db,
    isDefault: false,
  },
]

export const CHARACTERS: readonly CharacterDefinition[] = [
  {
    id: 'turkuaz-runner',
    name: 'Turkuaz Runner',
    description: 'The classic island champion.',
    defaultSkin: 'skin-default',
    build: { width: 1, height: 1, hairColor: null, style: 'classic', model: 'runner' },
    speed: 1.0,
    jump: 1.0,
    unlocked: true,
    unlockCost: 0,
  },
  {
    id: 'swift-runner',
    name: 'Swift Runner',
    description: 'Slightly lighter, same speed.',
    defaultSkin: 'skin-crimson',
    build: {
      width: 0.94,
      height: 1.04,
      hairColor: 0xe3b866,
      style: 'lean',
      model: 'swift',
    },
    speed: 1.0,
    jump: 1.0,
    unlocked: false,
    unlockCost: 1000,
  },
  {
    id: 'ocean-master',
    name: 'Ocean Master',
    description: 'Veteran of the deep.',
    // The authored ocean-blue shirt is its signature look.
    defaultSkin: 'skin-default',
    build: {
      width: 1.06,
      height: 0.98,
      // Grey veteran's beard.
      hairColor: 0xd8d2c8,
      style: 'sturdy',
      model: 'ocean',
    },
    speed: 1.0,
    jump: 1.0,
    unlocked: false,
    unlockCost: 40,
    currency: 'crystals',
  },
  {
    id: 'tide-mage',
    name: 'Tide Mage',
    description: 'Calls the waves with a wave of the hat.',
    defaultSkin: 'skin-default',
    build: { width: 1, height: 1, hairColor: null, style: 'classic', model: 'mage' },
    speed: 1.0,
    jump: 1.0,
    unlocked: false,
    unlockCost: 1500,
  },
  {
    id: 'coral-sage',
    name: 'Coral Sage',
    description: 'Knows every reef by heart.',
    defaultSkin: 'skin-default',
    build: { width: 0.96, height: 1.02, hairColor: null, style: 'lean', model: 'sage' },
    speed: 1.0,
    jump: 1.0,
    unlocked: false,
    unlockCost: 2000,
  },
  {
    id: 'reef-knight',
    name: 'Reef Knight',
    description: 'Armour polished by the tides.',
    defaultSkin: 'skin-default',
    build: { width: 1.04, height: 1, hairColor: null, style: 'sturdy', model: 'knight' },
    speed: 1.0,
    jump: 1.0,
    unlocked: false,
    unlockCost: 60,
    currency: 'crystals',
  },
  {
    id: 'sun-guardian',
    name: 'Sun Guardian',
    description: 'Keeps watch from dawn to dusk.',
    defaultSkin: 'skin-default',
    build: { width: 1.02, height: 1, hairColor: null, style: 'sturdy', model: 'guardian' },
    speed: 1.0,
    jump: 1.0,
    unlocked: false,
    unlockCost: 80,
    currency: 'crystals',
  },
]

/**
 * Returns the accessory list after equipping `id`: one accessory per slot,
 * `acc-none` clears everything and equipping a worn item removes it.
 */
export function toggleAccessory(current: readonly string[], id: string): string[] {
  const definition = CHARACTER_ACCESSORIES.find((entry) => entry.id === id)
  if (!definition || definition.isDefault) {
    return ['acc-none']
  }

  const worn = current.filter((entry) => entry !== 'acc-none')
  if (worn.includes(id)) {
    const remaining = worn.filter((entry) => entry !== id)
    return remaining.length > 0 ? remaining : ['acc-none']
  }

  const kept = worn.filter((entry) => {
    const other = CHARACTER_ACCESSORIES.find((candidate) => candidate.id === entry)
    return other !== undefined && other.position !== definition.position
  })
  return [...kept, id]
}

/** Crystal → coin exchange offered on the character screen. */
export const CRYSTAL_EXCHANGE = { crystals: 5, coins: 50 } as const
