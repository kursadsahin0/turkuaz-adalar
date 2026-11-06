import { t, tc, type StringKey } from '../../i18n/i18n.ts'
import type {
  CharacterDefinition,
  CosmeticCurrency,
  CosmeticType,
} from '../../game/characters/CharacterData.ts'
import {
  CRYSTAL_EXCHANGE,
  CHARACTER_ACCESSORIES,
  CHARACTER_COLORS,
  CHARACTERS,
  CHARACTER_OUTFITS,
  CHARACTER_SKINS,
  type CharacterCollectionState,
} from '../../game/characters/CharacterData.ts'
import { daysLeftInSeason, isOnSale } from '../../game/characters/Seasons.ts'
import { createEl } from '../../utils/dom.ts'
import { Button } from '../components/Button.ts'
import { IconButton } from '../components/IconButton.ts'
import { formatInteger } from '../format.ts'
import { cosmeticIcon } from '../components/CosmeticIcons.ts'
import { Screen } from './Screen.ts'
import { createPanel, ICON_PATHS } from './screenUtils.ts'

export interface CharacterSelectionScreenOptions {
  onBack: () => void
  /** Buy or unlock an item. The game re-validates ownership and coins. */
  onPurchase: (type: CosmeticType, id: string, cost: number) => void
  /** Equip an owned item (toggles accessories). */
  onEquip: (type: CosmeticType, id: string) => void
  /** Trade crystals for coins at CRYSTAL_EXCHANGE. */
  onExchange: () => void
  /** Horizontal drag on the open stage, in pixels, to turn the preview. */
  onRotate: (deltaX: number) => void
  /** Show an item on the runner without equipping it. */
  onPreview: (type: CosmeticType, id: string) => void
}

export interface CharacterSelectionData {
  collection: CharacterCollectionState
  currentCoins: number
  currentCrystals: number
}

interface CatalogItem {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly unlockCost: number
  readonly currency?: CosmeticCurrency
  readonly isDefault?: boolean
}

/** Price label with the right currency glyph. */
function priceLabel(item: CatalogItem): string {
  return `${formatInteger(item.unlockCost)} ${item.currency === 'crystals' ? '💎' : '●'}`
}

/** Screen for selecting playable characters and cosmetics. */
export class CharacterSelectionScreen extends Screen {
  private readonly backButton: IconButton
  private readonly coinsDisplay: HTMLSpanElement
  private readonly crystalsDisplay: HTMLSpanElement
  private readonly exchangeButton: Button
  private readonly selectButton: Button
  private readonly categoryTabs: HTMLDivElement
  private readonly cosmeticsContainer: HTMLDivElement

  private currentData: CharacterSelectionData | null = null
  private selectedCategory: CosmeticType = 'character'
  private selectedItem: string | null = null
  private readonly options: CharacterSelectionScreenOptions

  constructor(options: CharacterSelectionScreenOptions) {
    super('screen--overlay')
    this.root.classList.add('screen--showcase')
    this.options = options

    const panel = createPanel('character-selection-panel')

    const top = createEl('div', 'character-selection__top')
    const eyebrow = createEl('p', 'eyebrow', t('chars.eyebrow'))
    const title = createEl('h2', 'screen-title', t('chars.title'))

    this.backButton = new IconButton({
      iconPaths: ICON_PATHS.back,
      label: t('common.back'),
      onClick: options.onBack,
      className: 'character-selection__back',
    })

    const coins = createEl('div', 'character-selection__coins')
    const coinsIcon = createEl('span', 'character-selection__coins-icon', '●')
    this.coinsDisplay = createEl('span', 'character-selection__coins-value', '0')
    coins.append(coinsIcon, this.coinsDisplay)
    const crystals = createEl('div', 'character-selection__coins character-selection__crystals')
    this.crystalsDisplay = createEl('span', 'character-selection__coins-value', '0')
    crystals.append(
      createEl('span', 'character-selection__crystals-icon', '💎'),
      this.crystalsDisplay,
    )
    const wallet = createEl('div', 'character-selection__wallet')
    wallet.append(coins, crystals)

    top.append(eyebrow, title, this.backButton.element, wallet)

    this.exchangeButton = new Button({
      label: t('chars.exchange', {
        crystals: CRYSTAL_EXCHANGE.crystals,
        coins: CRYSTAL_EXCHANGE.coins,
      }),
      variant: 'text',
      onClick: options.onExchange,
      className: 'character-selection__exchange',
    })

    this.categoryTabs = createEl('div', 'character-selection__tabs')
    this.categoryTabs.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const tab = target.closest('[data-category]')
      if (tab) {
        this.selectedCategory = tab.getAttribute('data-category') as CosmeticType
        this.selectedItem = this.equippedItem()
        // Switching tabs drops any try-on and shows what is really equipped.
        if (this.selectedItem) {
          this.options.onPreview(this.selectedCategory, this.selectedItem)
        }
        this.renderCategories()
        this.renderCosmetics()
      }
    })

    this.cosmeticsContainer = createEl('div', 'character-selection__cosmetics')

    this.selectButton = new Button({
      label: t('chars.equip'),
      onClick: () => this.runAction(),
      className: 'character-selection__select',
    })

    panel.append(
      top,
      this.exchangeButton.element,
      this.categoryTabs,
      this.cosmeticsContainer,
      this.selectButton.element,
    )
    const dragHint = createEl('p', 'showcase__hint', `⟲ ${t('chars.dragHint')}`)
    this.root.append(dragHint, panel)

    // Dragging on the open stage (outside the panel) turns the runner.
    let dragX: number | null = null
    this.root.addEventListener('pointerdown', (event) => {
      if ((event.target as Element).closest('.panel')) {
        return
      }
      dragX = event.clientX
      this.root.setPointerCapture(event.pointerId)
    })
    this.root.addEventListener('pointermove', (event) => {
      if (dragX === null) {
        return
      }
      this.options.onRotate(event.clientX - dragX)
      dragX = event.clientX
    })
    const endDrag = (): void => {
      dragX = null
    }
    this.root.addEventListener('pointerup', endDrag)
    this.root.addEventListener('pointercancel', endDrag)

    this.root.addEventListener('click', (event) => {
      const target = event.target as Element
      const characterCard = target.closest('[data-character-id]')
      if (characterCard) {
        const characterId = characterCard.getAttribute('data-character-id')
        if (characterId) {
          this.selectCosmetic(characterId)
        }
        return
      }

      const cosmeticCard = target.closest('[data-item-id]')
      if (cosmeticCard) {
        const itemId = cosmeticCard.getAttribute('data-item-id')
        if (itemId) {
          this.selectCosmetic(itemId)
        }
      }
    })
  }

  setData(data: CharacterSelectionData): void {
    const firstOpen = this.currentData === null || this.root.hidden
    this.currentData = data
    if (firstOpen || this.selectedItem === null) {
      this.selectedItem = this.equippedItem()
    }
    this.coinsDisplay.textContent = formatInteger(data.currentCoins)
    this.crystalsDisplay.textContent = formatInteger(data.currentCrystals)
    this.exchangeButton.setDisabled(data.currentCrystals < CRYSTAL_EXCHANGE.crystals)
    this.renderCategories()
    this.renderCosmetics()
  }

  show(): void {
    super.show()
    this.backButton.focus()
  }

  dispose(): void {
    this.backButton.dispose()
    this.exchangeButton.dispose()
    this.selectButton.dispose()
    super.dispose()
  }

  private renderCategories(): void {
    this.categoryTabs.innerHTML = ''
    const categories = [
      { id: 'character', label: t('chars.tab.character') },
      { id: 'skin', label: t('chars.tab.skin') },
      { id: 'outfit', label: t('chars.tab.outfit') },
      { id: 'accessory', label: t('chars.tab.accessory') },
      { id: 'color', label: t('chars.tab.color') },
    ]

    for (const cat of categories) {
      const tab = createEl(
        'button',
        `character-selection__tab ${this.selectedCategory === cat.id ? 'character-selection__tab--active' : ''}`,
      )
      tab.dataset.category = cat.id
      tab.textContent = cat.label
      this.categoryTabs.appendChild(tab)
    }
  }

  private renderCosmetics(): void {
    if (!this.currentData) return

    this.cosmeticsContainer.innerHTML = ''

    switch (this.selectedCategory) {
      case 'character':
        this.renderCharacters()
        break
      case 'skin':
        this.renderSkins()
        break
      case 'outfit':
        this.renderOutfits()
        break
      case 'accessory':
        this.renderAccessories()
        break
      case 'color':
        this.renderColors()
        break
    }

    this.updateSelectButton()
  }

  private renderCharacters(): void {
    for (const char of CHARACTERS) {
      const isUnlocked = this.isOwned('character', char.id)
      const isSelected = this.selectedItem === char.id
      const isCurrent = this.currentData!.collection.equipped.characterId === char.id

      const card = this.createCharacterCard(char, isUnlocked, isSelected, isCurrent)
      this.cosmeticsContainer.appendChild(card)
    }
  }

  private renderSkins(): void {
    const today = new Date()
    for (const skin of CHARACTER_SKINS) {
      const isOwned = this.currentData!.collection.ownedSkins.includes(skin.id)
      // Out-of-season skins are only listed for players who already own them.
      if (!isOwned && !isOnSale(skin, today)) {
        continue
      }
      const isSelected = this.selectedItem === skin.id
      const isEquipped = this.currentData!.collection.equipped.skinId === skin.id

      const card = this.createCosmeticCard(skin, isOwned, isSelected, isEquipped, 'skin')
      if (skin.season && !isOwned) {
        card.append(
          createEl(
            'span',
            'cosmetic-card__season',
            t(`season.${skin.season}` as StringKey, { days: daysLeftInSeason(today) }),
          ),
        )
      }
      this.cosmeticsContainer.appendChild(card)
    }
  }

  private renderOutfits(): void {
    for (const outfit of CHARACTER_OUTFITS) {
      const isOwned = this.currentData!.collection.ownedOutfits.includes(outfit.id)
      const isSelected = this.selectedItem === outfit.id
      const isEquipped = this.currentData!.collection.equipped.outfitId === outfit.id

      const card = this.createCosmeticCard(outfit, isOwned, isSelected, isEquipped, 'outfit')
      this.cosmeticsContainer.appendChild(card)
    }
  }

  private renderAccessories(): void {
    for (const acc of CHARACTER_ACCESSORIES) {
      const isOwned = this.currentData!.collection.ownedAccessories.includes(acc.id)
      const isSelected = this.selectedItem === acc.id
      const isEquipped = this.currentData!.collection.equipped.accessoryIds.includes(acc.id)

      const card = this.createCosmeticCard(acc, isOwned, isSelected, isEquipped, 'accessory')
      this.cosmeticsContainer.appendChild(card)
    }
  }

  private renderColors(): void {
    for (const color of CHARACTER_COLORS) {
      const isOwned = this.currentData!.collection.ownedColors.includes(color.id)
      const isSelected = this.selectedItem === color.id
      const isEquipped = this.currentData!.collection.equipped.colorId === color.id

      const card = this.createCosmeticCard(color, isOwned, isSelected, isEquipped, 'color')
      this.cosmeticsContainer.appendChild(card)
    }
  }

  private createCharacterCard(
    character: CharacterDefinition,
    isUnlocked: boolean,
    isSelected: boolean,
    isCurrent: boolean,
  ): HTMLDivElement {
    const card = createEl(
      'div',
      `character-card ${isSelected ? 'character-card--selected' : ''} ${isUnlocked ? 'character-card--unlocked' : 'character-card--locked'}`,
    )
    card.setAttribute('data-character-id', character.id)

    const preview = createEl('div', 'character-card__preview')
    const defaultSkin = CHARACTER_SKINS.find((skin) => skin.id === character.defaultSkin)
    const characterName = tc(`character.${character.id}.name`, character.name)
    preview.innerHTML = cosmeticIcon(
      'character',
      character,
      characterName,
      character,
      defaultSkin && !defaultSkin.isDefault ? defaultSkin.color : undefined,
    )

    const info = createEl('div', 'character-card__info')
    const name = createEl(
      'h3',
      'character-card__name',
      tc(`character.${character.id}.name`, character.name),
    )
    const description = createEl(
      'p',
      'character-card__description',
      tc(`character.${character.id}.description`, character.description),
    )

    // Characters are cosmetic: show their look, not identical gameplay stats.
    const stats = createEl('div', 'character-card__stats')
    stats.append(
      createEl(
        'span',
        'character-card__style',
        t(`chars.style.${character.build.style}` as StringKey),
      ),
    )

    info.append(name, description, stats)

    if (isCurrent) {
      const currentBadge = createEl('div', 'character-card__badge', t('chars.equipped'))
      card.appendChild(currentBadge)
    } else if (!isUnlocked) {
      const lock = createEl('div', 'character-card__lock', '🔒')
      // The price sits with the name, so it reads as part of the card.
      const unlockCost = createEl('div', 'character-card__unlock-cost', priceLabel(character))
      card.appendChild(lock)
      info.appendChild(unlockCost)
    }

    card.append(preview, info)
    return card
  }

  private createCosmeticCard(
    item: CatalogItem & { color?: number },
    isOwned: boolean,
    isSelected: boolean,
    isEquipped: boolean,
    type: Exclude<CosmeticType, 'character'>,
  ): HTMLDivElement {
    const card = createEl(
      'div',
      `cosmetic-card ${isSelected ? 'cosmetic-card--selected' : ''} ${isOwned ? 'cosmetic-card--owned' : 'cosmetic-card--locked'}`,
    )
    card.setAttribute('data-item-id', item.id)
    card.setAttribute('data-item-type', type)

    const preview = createEl('div', 'cosmetic-card__preview')
    preview.innerHTML = cosmeticIcon(type, item, tc(`${type}.${item.id}.name`, item.name))

    const info = createEl('div', 'cosmetic-card__info')
    const name = createEl('h3', 'cosmetic-card__name', tc(`${type}.${item.id}.name`, item.name))
    const description = createEl(
      'p',
      'cosmetic-card__description',
      tc(`${type}.${item.id}.description`, item.description ?? ''),
    )

    const cost = createEl('div', 'cosmetic-card__cost')
    if (isOwned) {
      cost.textContent = t('chars.owned')
      cost.classList.add('cosmetic-card__cost--owned')
    } else {
      cost.textContent = priceLabel(item)
      if (item.currency === 'crystals') {
        cost.classList.add('cosmetic-card__cost--crystal')
        card.classList.add('cosmetic-card--premium')
        card.title = t('chars.crystalOnly')
      }
    }

    info.append(name, description, cost)

    if (isEquipped) {
      const equippedBadge = createEl('div', 'cosmetic-card__badge', t('chars.equipped'))
      card.appendChild(equippedBadge)
    }

    card.append(preview, info)
    return card
  }

  private selectCosmetic(itemId: string): void {
    this.selectedItem = itemId
    // Try it on: the runner shows the item even before it is bought.
    this.options.onPreview(this.selectedCategory, itemId)
    this.renderCosmetics()
  }

  private catalog(type: CosmeticType): readonly CatalogItem[] {
    switch (type) {
      case 'character':
        return CHARACTERS
      case 'skin':
        return CHARACTER_SKINS
      case 'outfit':
        return CHARACTER_OUTFITS
      case 'accessory':
        return CHARACTER_ACCESSORIES
      case 'color':
        return CHARACTER_COLORS
    }
  }

  private isOwned(type: CosmeticType, id: string): boolean {
    const collection = this.currentData?.collection
    if (!collection) {
      return false
    }
    switch (type) {
      case 'character':
        return collection.ownedCharacters.includes(id)
      case 'skin':
        return collection.ownedSkins.includes(id)
      case 'outfit':
        return collection.ownedOutfits.includes(id)
      case 'accessory':
        return collection.ownedAccessories.includes(id)
      case 'color':
        return collection.ownedColors.includes(id)
    }
  }

  private isEquipped(type: CosmeticType, id: string): boolean {
    const equipped = this.currentData?.collection.equipped
    if (!equipped) {
      return false
    }
    switch (type) {
      case 'character':
        return equipped.characterId === id
      case 'skin':
        return equipped.skinId === id
      case 'outfit':
        return equipped.outfitId === id
      case 'accessory':
        return equipped.accessoryIds.includes(id)
      case 'color':
        return equipped.colorId === id
    }
  }

  private equippedItem(): string | null {
    const equipped = this.currentData?.collection.equipped
    if (!equipped) {
      return null
    }
    switch (this.selectedCategory) {
      case 'character':
        return equipped.characterId
      case 'skin':
        return equipped.skinId
      case 'outfit':
        return equipped.outfitId
      case 'accessory':
        return equipped.accessoryIds[0] ?? 'acc-none'
      case 'color':
        return equipped.colorId
    }
  }

  private selectedEntry(): CatalogItem | null {
    if (!this.selectedItem) {
      return null
    }
    return this.catalog(this.selectedCategory).find((item) => item.id === this.selectedItem) ?? null
  }

  private runAction(): void {
    const item = this.selectedEntry()
    if (!item || !this.currentData) {
      return
    }
    const type = this.selectedCategory
    if (!this.isOwned(type, item.id)) {
      if (this.balanceFor(item) >= item.unlockCost) {
        this.options.onPurchase(type, item.id, item.unlockCost)
      }
      return
    }
    const removable = type === 'accessory' && !item.isDefault
    if (!this.isEquipped(type, item.id) || removable) {
      this.options.onEquip(type, item.id)
    }
  }

  private balanceFor(item: CatalogItem): number {
    if (!this.currentData) {
      return 0
    }
    return item.currency === 'crystals'
      ? this.currentData.currentCrystals
      : this.currentData.currentCoins
  }

  private updateSelectButton(): void {
    const item = this.selectedEntry()
    if (!this.currentData || !item) {
      this.selectButton.setLabel(t('chars.equip'))
      this.selectButton.setDisabled(true)
      return
    }

    const type = this.selectedCategory
    if (!this.isOwned(type, item.id)) {
      const key = type === 'character' ? 'chars.unlock' : 'chars.buy'
      this.selectButton.setLabel(t(key, { cost: priceLabel(item) }))
      this.selectButton.setDisabled(this.balanceFor(item) < item.unlockCost)
      return
    }

    if (this.isEquipped(type, item.id)) {
      const removable = type === 'accessory' && !item.isDefault
      this.selectButton.setLabel(removable ? t('chars.remove') : t('chars.equipped'))
      this.selectButton.setDisabled(!removable)
      return
    }

    this.selectButton.setLabel(t('chars.equip'))
    this.selectButton.setDisabled(false)
  }
}
