import type { ShowcaseCamera } from '../../game/camera/ShowcaseCamera.ts'
import { resolveAppearance } from '../../game/characters/CharacterAppearance.ts'
import {
  CHARACTER_ACCESSORIES,
  CHARACTER_COLORS,
  CHARACTER_OUTFITS,
  CHARACTER_SKINS,
  CHARACTERS,
  CRYSTAL_EXCHANGE,
  toggleAccessory,
  type CosmeticCurrency,
  type CosmeticType,
} from '../../game/characters/CharacterData.ts'
import type { CharacterModel } from '../../game/player/CharacterModel.ts'
import { isOnSale } from '../../game/characters/Seasons.ts'
import { Logger } from '../../utils/logger.ts'
import { celebrate, type GameServices } from './GameServices.ts'

export interface ShopHooks {
  /** The runner's model, once loaded. */
  readonly characterModel: () => CharacterModel | null
  /** Hides floating pickups behind the character showcase. */
  readonly setCollectiblesVisible: (visible: boolean) => void
}

/**
 * The character screen: the rotating showcase, try-ons, purchases (always at
 * the catalogue price), equipping and the crystal → coin exchange.
 */
export class ShopController {
  private readonly logger = new Logger('Shop')
  /** True while the character screen owns the camera. */
  private showcaseActive = false

  private readonly services: GameServices
  private readonly showcase: ShowcaseCamera
  private readonly hooks: ShopHooks

  constructor(services: GameServices, showcase: ShowcaseCamera, hooks: ShopHooks) {
    this.services = services
    this.showcase = showcase
    this.hooks = hooks
  }

  get isShowcaseActive(): boolean {
    return this.showcaseActive
  }

  open(): void {
    const { ui, playerSave, progression } = this.services
    if (!ui.isCharacterSelectionOpen) {
      this.showcase.reset()
    }
    this.showcaseActive = true
    this.hooks.setCollectiblesVisible(false)
    ui.showCharacterSelection({
      collection: playerSave.characterCollection,
      currentCoins: progression.snapshot.coins,
      currentCrystals: progression.snapshot.crystalBalance,
    })
  }

  /** Leaves the showcase, dropping any item that was only being tried on. */
  close(): void {
    if (this.showcaseActive) {
      this.applyAppearance()
    }
    this.showcaseActive = false
  }

  rotatePreview(deltaX: number): void {
    this.showcase.rotate(deltaX)
  }

  /** Dresses the runner in what the player has equipped. */
  applyAppearance(): void {
    this.hooks
      .characterModel()
      ?.applyAppearance(resolveAppearance(this.services.playerSave.characterCollection.equipped))
  }

  /** Shows an item on the runner without equipping or buying it. */
  preview(type: CosmeticType, id: string): void {
    const equipped = { ...this.services.playerSave.characterCollection.equipped }
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
        equipped.accessoryIds = toggleAccessory(
          equipped.accessoryIds.filter((worn) => worn !== id),
          id,
        )
        break
    }
    const model = this.hooks.characterModel()
    model?.applyAppearance(resolveAppearance(equipped))
    if (type === 'character') {
      // Each runner says hello with its own celebration.
      model?.celebrate()
    }
  }

  equip(type: CosmeticType, id: string): void {
    if (!this.services.playerSave.equip(type, id)) {
      this.logger.warn(`Cannot equip ${type} "${id}": not owned.`)
      return
    }
    this.applyAppearance()
    this.services.audio?.play('ui')
    this.open()
  }

  /**
   * Buys an item at its catalogue price and currency (never a price sent by
   * the UI), then equips it so the purchase is immediately visible.
   */
  purchase(type: CosmeticType, id: string): void {
    const { playerSave, progression, telemetry, meta } = this.services
    const price = cosmeticPrice(type, id)
    if (price === null || playerSave.isOwned(type, id)) {
      return
    }
    // Seasonal items are sold only in their season.
    const skin = type === 'skin' ? CHARACTER_SKINS.find((entry) => entry.id === id) : undefined
    if (skin && !isOnSale(skin, new Date())) {
      return
    }

    if (!progression.trySpend(price.currency, price.cost)) {
      this.logger.info(`Not enough coins for ${type} "${id}" (${price.cost} ${price.currency}).`)
      return
    }

    playerSave.purchaseCosmetic(type, id)
    telemetry.track('purchase', { type, id, currency: price.currency, cost: price.cost })
    meta.cosmeticBought()
    celebrate(this.services)
    this.equip(type, id)
  }

  exchangeCrystals(): void {
    const { progression } = this.services
    if (progression.trySpend('crystals', CRYSTAL_EXCHANGE.crystals)) {
      progression.creditCoins(CRYSTAL_EXCHANGE.coins)
      this.services.audio?.play('coin')
      this.open()
    }
  }
}

export function cosmeticPrice(
  type: CosmeticType,
  id: string,
): { cost: number; currency: CosmeticCurrency } | null {
  const catalog: readonly { id: string; unlockCost: number; currency?: CosmeticCurrency }[] =
    type === 'character'
      ? CHARACTERS
      : type === 'skin'
        ? CHARACTER_SKINS
        : type === 'outfit'
          ? CHARACTER_OUTFITS
          : type === 'accessory'
            ? CHARACTER_ACCESSORIES
            : CHARACTER_COLORS
  const item = catalog.find((entry) => entry.id === id)
  return item ? { cost: item.unlockCost, currency: item.currency ?? 'coins' } : null
}
