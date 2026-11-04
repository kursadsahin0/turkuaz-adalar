/**
 * Character customization data structures.
 * All cosmetics are visual only - no gameplay advantages.
 */

export interface CharacterSkin {
  id: string
  name: string
  description: string
  unlockCost: number
  color: number
  isDefault: boolean
}

export interface CharacterOutfit {
  id: string
  name: string
  description: string
  unlockCost: number
  isDefault: boolean
}

export interface CharacterAccessory {
  id: string
  name: string
  description: string
  unlockCost: number
  isDefault: boolean
  position: 'head' | 'neck' | 'back' | 'side'
}

export interface CharacterColor {
  id: string
  name: string
  description: string
  unlockCost: number
  color: number
  isDefault: boolean
}

export interface CharacterDefinition {
  id: string
  name: string
  description: string
  defaultSkin: string
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
    unlockCost: 1000,
    color: 0x6a0dad,
    isDefault: false,
  },
]

export const CHARACTER_OUTFITS: readonly CharacterOutfit[] = [
  {
    id: 'outfit-default',
    name: 'Runner\'s Suit',
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
    unlockCost: 600,
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
    unlockCost: 500,
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
    speed: 1.0,
    jump: 1.0,
    unlocked: false,
    unlockCost: 1000,
  },
  {
    id: 'ocean-master',
    name: 'Ocean Master',
    description: 'Veteran of the deep.',
    defaultSkin: 'skin-forest',
    speed: 1.0,
    jump: 1.0,
    unlocked: false,
    unlockCost: 1500,
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
