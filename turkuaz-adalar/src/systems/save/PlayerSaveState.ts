/**
 * Unified player save state combining all persistent data.
 * Versioned for migration compatibility across updates.
 */

export interface PlayerProgression {
  bestScore: number
  bestDistance: number
  totalRuns: number
  totalCrystals: number
  coins: number
}

export interface LevelProgress {
  attempts: number
  completed: boolean
  bestDistance: number
  bestScore: number
  totalCoins: number
  totalCrystals: number
  unlockedAt: number
}

export interface CharacterCollection {
  ownedCharacters: string[]
  ownedSkins: string[]
  ownedOutfits: string[]
  ownedAccessories: string[]
  ownedColors: string[]
  equipped: {
    characterId: string
    skinId: string
    outfitId: string
    accessoryIds: string[]
    colorId: string
  }
}

export interface GameSettings {
  musicVolume: number
  sfxVolume: number
  quality: 'low' | 'medium' | 'high'
  controlHints: boolean
  vibration: boolean
  muted: boolean
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface TutorialState {
  completed: boolean
  completedAt: number
  stepsCompleted: string[]
}

export interface PlayerSaveState {
  version: number
  progression: PlayerProgression
  unlockedLevels: string[]
  levelProgress: Record<string, LevelProgress>
  characterCollection: CharacterCollection
  settings: GameSettings
  tutorial: TutorialState
  createdAt: number
  lastSavedAt: number
}

export const CURRENT_SAVE_VERSION = 1

export const DEFAULT_PLAYER_SAVE: PlayerSaveState = {
  version: CURRENT_SAVE_VERSION,
  progression: {
    bestScore: 0,
    bestDistance: 0,
    totalRuns: 0,
    totalCrystals: 0,
    coins: 0,
  },
  unlockedLevels: ['turkuaz-shallows'],
  levelProgress: {},
  characterCollection: {
    ownedCharacters: ['turkuaz-runner'],
    ownedSkins: ['skin-default'],
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
    musicVolume: 0.5,
    sfxVolume: 0.5,
    quality: 'medium',
    controlHints: true,
    vibration: true,
    muted: false,
    difficulty: 'medium',
  },
  tutorial: {
    completed: false,
    completedAt: 0,
    stepsCompleted: [],
  },
  createdAt: Date.now(),
  lastSavedAt: Date.now(),
}

/**
 * Fresh, deep copy of the default save. Never spread DEFAULT_PLAYER_SAVE
 * directly: its arrays would be shared and mutated by purchases.
 */
export function createDefaultSave(): PlayerSaveState {
  const now = Date.now()
  return { ...structuredClone(DEFAULT_PLAYER_SAVE), createdAt: now, lastSavedAt: now }
}

/**
 * Sanitises progression data to prevent invalid values.
 */
export function sanitiseProgression(value: unknown): PlayerProgression {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_PLAYER_SAVE.progression }
  }

  const record = value as Record<string, unknown>
  return {
    bestScore: sanitiseNumber(record.bestScore),
    bestDistance: sanitiseNumber(record.bestDistance),
    totalRuns: sanitiseNumber(record.totalRuns),
    totalCrystals: sanitiseNumber(record.totalCrystals),
    coins: sanitiseNumber(record.coins),
  }
}

/**
 * Sanitises level progress data.
 */
export function sanitiseLevelProgress(value: unknown): LevelProgress {
  if (typeof value !== 'object' || value === null) {
    return {
      attempts: 0,
      completed: false,
      bestDistance: 0,
      bestScore: 0,
      totalCoins: 0,
      totalCrystals: 0,
      unlockedAt: 0,
    }
  }

  const record = value as Record<string, unknown>
  return {
    attempts: sanitiseNumber(record.attempts),
    completed: typeof record.completed === 'boolean' ? record.completed : false,
    bestDistance: sanitiseNumber(record.bestDistance),
    bestScore: sanitiseNumber(record.bestScore),
    totalCoins: sanitiseNumber(record.totalCoins),
    totalCrystals: sanitiseNumber(record.totalCrystals),
    unlockedAt: typeof record.unlockedAt === 'number' ? record.unlockedAt : 0,
  }
}

/**
 * Sanitises character collection data.
 */
export function sanitiseCharacterCollection(value: unknown): CharacterCollection {
  const defaults = structuredClone(DEFAULT_PLAYER_SAVE.characterCollection)
  if (typeof value !== 'object' || value === null) {
    return defaults
  }

  const record = value as Record<string, unknown>
  const owned = (field: unknown, fallback: string[]): string[] => {
    const list = Array.isArray(field) ? field.filter(isString) : []
    // Default items are always owned, and duplicates are dropped.
    return [...new Set([...fallback, ...list])]
  }
  const ownedCharacters = owned(record.ownedCharacters, defaults.ownedCharacters)
  const ownedSkins = owned(record.ownedSkins, defaults.ownedSkins)
  const ownedOutfits = owned(record.ownedOutfits, defaults.ownedOutfits)
  const ownedAccessories = owned(record.ownedAccessories, defaults.ownedAccessories)
  const ownedColors = owned(record.ownedColors, defaults.ownedColors)

  const equippedRecord =
    typeof record.equipped === 'object' && record.equipped !== null
      ? (record.equipped as Record<string, unknown>)
      : {}
  const pick = (field: unknown, ownedList: string[], fallback: string): string =>
    isString(field) && ownedList.includes(field) ? field : fallback
  const accessoryIds = Array.isArray(equippedRecord.accessoryIds)
    ? equippedRecord.accessoryIds.filter(
        (id): id is string => isString(id) && ownedAccessories.includes(id),
      )
    : []

  return {
    ownedCharacters,
    ownedSkins,
    ownedOutfits,
    ownedAccessories,
    ownedColors,
    equipped: {
      characterId: pick(equippedRecord.characterId, ownedCharacters, defaults.equipped.characterId),
      skinId: pick(equippedRecord.skinId, ownedSkins, defaults.equipped.skinId),
      outfitId: pick(equippedRecord.outfitId, ownedOutfits, defaults.equipped.outfitId),
      accessoryIds: accessoryIds.length > 0 ? accessoryIds : [...defaults.equipped.accessoryIds],
      colorId: pick(equippedRecord.colorId, ownedColors, defaults.equipped.colorId),
    },
  }
}

/**
 * Sanitises settings data.
 */
export function sanitiseSettings(value: unknown): GameSettings {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_PLAYER_SAVE.settings }
  }

  const record = value as Record<string, unknown>
  return {
    musicVolume: clampNumber(record.musicVolume, 0, 1),
    sfxVolume: clampNumber(record.sfxVolume, 0, 1),
    quality: record.quality === 'low' || record.quality === 'medium' || record.quality === 'high' ? record.quality : 'medium',
    controlHints: typeof record.controlHints === 'boolean' ? record.controlHints : true,
    vibration: typeof record.vibration === 'boolean' ? record.vibration : true,
    muted: typeof record.muted === 'boolean' ? record.muted : false,
    difficulty: record.difficulty === 'easy' || record.difficulty === 'medium' || record.difficulty === 'hard' ? record.difficulty : 'medium',
  }
}

/**
 * Sanitises tutorial state.
 */
export function sanitiseTutorial(value: unknown): TutorialState {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_PLAYER_SAVE.tutorial }
  }

  const record = value as Record<string, unknown>
  return {
    completed: typeof record.completed === 'boolean' ? record.completed : false,
    completedAt: typeof record.completedAt === 'number' ? record.completedAt : 0,
    stepsCompleted: Array.isArray(record.stepsCompleted) ? record.stepsCompleted.filter(isString) : [],
  }
}

/**
 * Sanitises a complete save state with validation.
 */
export function sanitiseSaveState(value: unknown): PlayerSaveState {
  if (typeof value !== 'object' || value === null) {
    return createDefaultSave()
  }

  const record = value as Record<string, unknown>
  return {
    version: typeof record.version === 'number' ? record.version : CURRENT_SAVE_VERSION,
    progression: sanitiseProgression(record.progression),
    unlockedLevels: Array.isArray(record.unlockedLevels) ? record.unlockedLevels.filter(isString) : ['turkuaz-shallows'],
    levelProgress: typeof record.levelProgress === 'object' && record.levelProgress !== null
      ? Object.fromEntries(
          Object.entries(record.levelProgress).map(([k, v]) => [k, sanitiseLevelProgress(v)])
        )
      : {},
    characterCollection: sanitiseCharacterCollection(record.characterCollection),
    settings: sanitiseSettings(record.settings),
    tutorial: sanitiseTutorial(record.tutorial),
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
    lastSavedAt: Date.now(),
  }
}

function sanitiseNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0
}

function clampNumber(value: unknown, min: number, max: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : (min + max) / 2
  return Math.max(min, Math.min(max, num))
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
