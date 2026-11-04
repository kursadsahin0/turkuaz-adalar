import { Logger } from '../../utils/logger.ts'
import { toggleAccessory, type CosmeticType } from '../../game/characters/CharacterData.ts'
import { SaveManager } from './SaveManager.ts'
import type { PlayerSaveState } from './PlayerSaveState.ts'
import { CURRENT_SAVE_VERSION, createDefaultSave, sanitiseSaveState } from './PlayerSaveState.ts'

const SAVE_KEY = 'player_save'

/**
 * Migration functions for each save version.
 * When a new version is added, add a migration function here.
 */
const MIGRATIONS: Record<number, (state: any) => any> = {
  // No migrations yet for version 1
}

/**
 * Unified player save manager with validation, migration, and error handling.
 * Handles all persistent player data in a single versioned save.
 */
export class PlayerSaveManager {
  private readonly save: SaveManager
  private readonly logger = new Logger('PlayerSave')
  private state: PlayerSaveState
  private dirty = false
  private autoSaveTimer: number | null = null

  constructor(save: SaveManager) {
    this.save = save
    this.state = this.load()
    this.setupAutoSave()
  }

  get stateSnapshot(): PlayerSaveState {
    return { ...this.state }
  }

  /**
   * Get progression data.
   */
  get progression() {
    return this.state.progression
  }

  /**
   * Get unlocked levels.
   */
  get unlockedLevels() {
    return this.state.unlockedLevels
  }

  /**
   * Get level progress.
   */
  get levelProgress() {
    return this.state.levelProgress
  }

  /**
   * Get character collection.
   */
  get characterCollection() {
    return this.state.characterCollection
  }

  /**
   * Get settings.
   */
  get settings() {
    return this.state.settings
  }

  /**
   * Get tutorial state.
   */
  get tutorial() {
    return this.state.tutorial
  }

  /**
   * Update progression data and mark for save.
   */
  updateProgression(updates: Partial<PlayerSaveState['progression']>): void {
    this.state.progression = { ...this.state.progression, ...updates }
    this.markDirty()
  }

  /**
   * Update unlocked levels and mark for save.
   */
  updateUnlockedLevels(levels: string[]): void {
    this.state.unlockedLevels = levels
    this.markDirty()
  }

  /**
   * Update level progress and mark for save.
   */
  updateLevelProgress(levelId: string, progress: any): void {
    this.state.levelProgress = { ...this.state.levelProgress, [levelId]: progress }
    this.markDirty()
  }

  /**
   * Update character collection and mark for save.
   */
  updateCharacterCollection(collection: Partial<PlayerSaveState['characterCollection']>): void {
    this.state.characterCollection = { ...this.state.characterCollection, ...collection }
    this.markDirty()
  }

  /**
   * Update settings and mark for save.
   */
  updateSettings(settings: Partial<PlayerSaveState['settings']>): void {
    this.state.settings = { ...this.state.settings, ...settings }
    this.markDirty()
  }

  /**
   * Update tutorial state and mark for save.
   */
  updateTutorial(tutorial: Partial<PlayerSaveState['tutorial']>): void {
    this.state.tutorial = { ...this.state.tutorial, ...tutorial }
    this.markDirty()
  }

  /**
   * Mark the save as dirty and trigger auto-save.
   */
  private markDirty(): void {
    this.dirty = true
    this.state.lastSavedAt = Date.now()
    this.scheduleAutoSave()
  }

  /**
   * Force an immediate save.
   */
  saveNow(): boolean {
    const success = this.save.save(SAVE_KEY, this.state)
    if (success) {
      this.dirty = false
      this.logger.info('Save successful')
    } else {
      this.logger.warn('Save failed')
    }
    return success
  }

  /**
   * Load save state with validation and migration.
   */
  private load(): PlayerSaveState {
    try {
      const raw = this.save.load<any>(SAVE_KEY, null)
      if (!raw) {
        this.logger.info('No save found, using defaults')
        return createDefaultSave()
      }

      // Run migrations if version is outdated
      const migrated = this.runMigrations(raw)

      // Sanitise the migrated data
      const sanitised = sanitiseSaveState(migrated)

      this.logger.info(`Save loaded (version ${sanitised.version})`)
      return sanitised
    } catch (error) {
      this.logger.error('Failed to load save, using defaults', error)
      return createDefaultSave()
    }
  }

  /**
   * Run migrations to upgrade save state to current version.
   */
  private runMigrations(state: any): any {
    const sourceVersion = typeof state.version === 'number' ? state.version : 0

    if (sourceVersion === CURRENT_SAVE_VERSION) {
      return state
    }

    this.logger.info(`Migrating save from version ${sourceVersion} to ${CURRENT_SAVE_VERSION}`)

    let migrated = state
    for (let version = sourceVersion; version < CURRENT_SAVE_VERSION; version++) {
      const migration = MIGRATIONS[version]
      if (migration) {
        try {
          migrated = migration(migrated)
          this.logger.info(`Migration ${version} -> ${version + 1} complete`)
        } catch (error) {
          this.logger.error(`Migration ${version} -> ${version + 1} failed`, error)
          // On migration failure, use defaults
          return createDefaultSave()
        }
      }
    }

    migrated.version = CURRENT_SAVE_VERSION
    return migrated
  }

  /**
   * Setup auto-save with debouncing.
   */
  private setupAutoSave(): void {
    // Save will be triggered by markDirty with a delay
  }

  /**
   * Schedule auto-save with debouncing.
   */
  private scheduleAutoSave(): void {
    if (this.autoSaveTimer !== null) {
      clearTimeout(this.autoSaveTimer)
    }

    this.autoSaveTimer = window.setTimeout(() => {
      this.saveNow()
      this.autoSaveTimer = null
    }, 1000) // Save 1 second after last change
  }

  /**
   * Reset all save data to defaults.
   */
  reset(): void {
    this.state = createDefaultSave()
    this.saveNow()
    this.logger.info('Save reset to defaults')
  }

  /**
   * Clear all save data.
   */
  clear(): void {
    this.save.remove(SAVE_KEY)
    this.state = createDefaultSave()
    this.logger.info('Save cleared')
  }

  /**
   * Export save data as JSON string (for backup/debug).
   */
  export(): string {
    return JSON.stringify(this.state, null, 2)
  }

  /**
   * Import save data from JSON string.
   */
  import(json: string): boolean {
    try {
      const imported = JSON.parse(json)
      const sanitised = sanitiseSaveState(imported)
      this.state = sanitised
      this.saveNow()
      this.logger.info('Save imported successfully')
      return true
    } catch (error) {
      this.logger.error('Failed to import save', error)
      return false
    }
  }

  /**
   * Check if a character or cosmetic is owned.
   */
  isOwned(type: CosmeticType, id: string): boolean {
    return this.ownedList(type).includes(id)
  }

  /**
   * Record a purchase. Coin checks happen in the caller, which owns the wallet.
   * Returns false when the item was already owned.
   */
  purchaseCosmetic(type: CosmeticType, id: string): boolean {
    if (this.isOwned(type, id)) {
      return false
    }
    this.ownedList(type).push(id)
    this.markDirty()
    return true
  }

  /**
   * Equip an owned item. Accessories toggle per slot; everything else replaces
   * the current choice. Returns false for items that are not owned.
   */
  equip(type: CosmeticType, id: string): boolean {
    if (!this.isOwned(type, id)) {
      return false
    }

    const equipped = { ...this.state.characterCollection.equipped }
    switch (type) {
      case 'character':
        equipped.characterId = id
        break
      case 'skin':
        equipped.skinId = id
        break
      case 'outfit':
        equipped.outfitId = id
        break
      case 'color':
        equipped.colorId = id
        break
      case 'accessory':
        equipped.accessoryIds = toggleAccessory(equipped.accessoryIds, id)
        break
    }
    this.state.characterCollection = { ...this.state.characterCollection, equipped }
    this.markDirty()
    return true
  }

  private ownedList(type: CosmeticType): string[] {
    const collection = this.state.characterCollection
    switch (type) {
      case 'character':
        return collection.ownedCharacters
      case 'skin':
        return collection.ownedSkins
      case 'outfit':
        return collection.ownedOutfits
      case 'accessory':
        return collection.ownedAccessories
      case 'color':
        return collection.ownedColors
    }
  }

  /**
   * Dispose of auto-save timer.
   */
  dispose(): void {
    if (this.autoSaveTimer !== null) {
      clearTimeout(this.autoSaveTimer)
      this.autoSaveTimer = null
    }
    if (this.dirty) {
      this.saveNow()
    }
  }
}
