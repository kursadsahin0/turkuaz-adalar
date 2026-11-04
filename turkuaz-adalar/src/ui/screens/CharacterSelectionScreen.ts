import type { CharacterDefinition, CosmeticType } from '../../game/characters/CharacterData.ts'
import {
  CHARACTER_ACCESSORIES,
  CHARACTER_COLORS,
  CHARACTERS,
  CHARACTER_OUTFITS,
  CHARACTER_SKINS,
  type CharacterCollectionState,
} from '../../game/characters/CharacterData.ts'
import { createEl } from '../../utils/dom.ts'
import { Button } from '../components/Button.ts'
import { IconButton } from '../components/IconButton.ts'
import { Screen } from './Screen.ts'
import { createPanel, ICON_PATHS } from './screenUtils.ts'

export interface CharacterSelectionScreenOptions {
  onBack: () => void
  /** Buy or unlock an item. The game re-validates ownership and coins. */
  onPurchase: (type: CosmeticType, id: string, cost: number) => void
  /** Equip an owned item (toggles accessories). */
  onEquip: (type: CosmeticType, id: string) => void
}

export interface CharacterSelectionData {
  collection: CharacterCollectionState
  currentCoins: number
}

interface CatalogItem {
  readonly id: string
  readonly name: string
  readonly unlockCost: number
  readonly isDefault?: boolean
}

/** Screen for selecting playable characters and cosmetics. */
export class CharacterSelectionScreen extends Screen {
  private readonly backButton: IconButton
  private readonly coinsDisplay: HTMLSpanElement
  private readonly selectButton: Button
  private readonly categoryTabs: HTMLDivElement
  private readonly cosmeticsContainer: HTMLDivElement

  private currentData: CharacterSelectionData | null = null
  private selectedCategory: CosmeticType = 'character'
  private selectedItem: string | null = null
  private readonly options: CharacterSelectionScreenOptions

  constructor(options: CharacterSelectionScreenOptions) {
    super('screen--overlay')
    this.options = options

    const panel = createPanel('character-selection-panel')

    const top = createEl('div', 'character-selection__top')
    const eyebrow = createEl('p', 'eyebrow', 'Customize your runner')
    const title = createEl('h2', 'screen-title', 'Characters')

    this.backButton = new IconButton({
      iconPaths: ICON_PATHS.back,
      label: 'Back to menu',
      onClick: options.onBack,
      className: 'character-selection__back',
    })

    const coins = createEl('div', 'character-selection__coins')
    const coinsIcon = createEl('span', 'character-selection__coins-icon', '●')
    this.coinsDisplay = createEl('span', 'character-selection__coins-value', '0')
    coins.append(coinsIcon, this.coinsDisplay)

    top.append(eyebrow, title, this.backButton.element, coins)

    this.categoryTabs = createEl('div', 'character-selection__tabs')
    this.categoryTabs.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const tab = target.closest('[data-category]')
      if (tab) {
        this.selectedCategory = tab.getAttribute('data-category') as CosmeticType
        this.selectedItem = this.equippedItem()
        this.renderCategories()
        this.renderCosmetics()
      }
    })

    this.cosmeticsContainer = createEl('div', 'character-selection__cosmetics')

    this.selectButton = new Button({
      label: 'Equip',
      onClick: () => this.runAction(),
      className: 'character-selection__select',
    })

    panel.append(top, this.categoryTabs, this.cosmeticsContainer, this.selectButton.element)
    this.root.appendChild(panel)

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
    this.coinsDisplay.textContent = data.currentCoins.toString()
    this.renderCategories()
    this.renderCosmetics()
  }

  show(): void {
    super.show()
    this.backButton.focus()
  }

  dispose(): void {
    this.backButton.dispose()
    this.selectButton.dispose()
    super.dispose()
  }

  private renderCategories(): void {
    this.categoryTabs.innerHTML = ''
    const categories = [
      { id: 'character', label: 'Characters' },
      { id: 'skin', label: 'Skins' },
      { id: 'outfit', label: 'Outfits' },
      { id: 'accessory', label: 'Accessories' },
      { id: 'color', label: 'Colors' },
    ]

    for (const cat of categories) {
      const tab = createEl('button', `character-selection__tab ${this.selectedCategory === cat.id ? 'character-selection__tab--active' : ''}`)
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
    for (const skin of CHARACTER_SKINS) {
      const isOwned = this.currentData!.collection.ownedSkins.includes(skin.id)
      const isSelected = this.selectedItem === skin.id
      const isEquipped = this.currentData!.collection.equipped.skinId === skin.id

      const card = this.createCosmeticCard(skin, isOwned, isSelected, isEquipped, 'skin')
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
    const card = createEl('div', `character-card ${isSelected ? 'character-card--selected' : ''} ${isUnlocked ? 'character-card--unlocked' : 'character-card--locked'}`)
    card.setAttribute('data-character-id', character.id)

    const preview = createEl('div', 'character-card__preview')
    const previewColor = createEl('div', 'character-card__preview-color')
    const defaultSkin = CHARACTER_SKINS.find(s => s.id === character.defaultSkin)
    if (defaultSkin) {
      previewColor.style.backgroundColor = `#${defaultSkin.color.toString(16).padStart(6, '0')}`
    } else {
      previewColor.style.backgroundColor = '#61f5e3'
    }
    preview.appendChild(previewColor)

    const info = createEl('div', 'character-card__info')
    const name = createEl('h3', 'character-card__name', character.name)
    const description = createEl('p', 'character-card__description', character.description)

    const stats = createEl('div', 'character-card__stats')
    const speedStat = this.createStat('Speed', '1.0x')
    const jumpStat = this.createStat('Jump', '1.0x')
    stats.append(speedStat, jumpStat)

    info.append(name, description, stats)

    if (isCurrent) {
      const currentBadge = createEl('div', 'character-card__badge', 'Equipped')
      card.appendChild(currentBadge)
    } else if (!isUnlocked) {
      const lock = createEl('div', 'character-card__lock', '🔒')
      const unlockCost = createEl('div', 'character-card__unlock-cost', `${character.unlockCost} ●`)
      card.appendChild(lock)
      card.appendChild(unlockCost)
    }

    card.append(preview, info)
    return card
  }

  private createCosmeticCard(
    item: any,
    isOwned: boolean,
    isSelected: boolean,
    isEquipped: boolean,
    type: string,
  ): HTMLDivElement {
    const card = createEl('div', `cosmetic-card ${isSelected ? 'cosmetic-card--selected' : ''} ${isOwned ? 'cosmetic-card--owned' : 'cosmetic-card--locked'}`)
    card.setAttribute('data-item-id', item.id)
    card.setAttribute('data-item-type', type)

    const preview = createEl('div', 'cosmetic-card__preview')
    const previewColor = createEl('div', 'cosmetic-card__preview-color')
    if (item.color) {
      previewColor.style.backgroundColor = `#${item.color.toString(16).padStart(6, '0')}`
    } else {
      previewColor.style.backgroundColor = '#61f5e3'
    }
    preview.appendChild(previewColor)

    const info = createEl('div', 'cosmetic-card__info')
    const name = createEl('h3', 'cosmetic-card__name', item.name)
    const description = createEl('p', 'cosmetic-card__description', item.description)

    const cost = createEl('div', 'cosmetic-card__cost')
    if (isOwned) {
      cost.textContent = 'Owned'
      cost.classList.add('cosmetic-card__cost--owned')
    } else {
      cost.textContent = `${item.unlockCost} ●`
    }

    info.append(name, description, cost)

    if (isEquipped) {
      const equippedBadge = createEl('div', 'cosmetic-card__badge', 'Equipped')
      card.appendChild(equippedBadge)
    }

    card.append(preview, info)
    return card
  }

  private createStat(label: string, value: string): HTMLDivElement {
    const stat = createEl('div', 'character-card__stat')
    const statLabel = createEl('span', 'character-card__stat-label', label)
    const statValue = createEl('span', 'character-card__stat-value', value)
    stat.append(statLabel, statValue)
    return stat
  }

  private selectCosmetic(itemId: string): void {
    this.selectedItem = itemId
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
      if (this.currentData.currentCoins >= item.unlockCost) {
        this.options.onPurchase(type, item.id, item.unlockCost)
      }
      return
    }
    const removable = type === 'accessory' && !item.isDefault
    if (!this.isEquipped(type, item.id) || removable) {
      this.options.onEquip(type, item.id)
    }
  }

  private updateSelectButton(): void {
    const item = this.selectedEntry()
    if (!this.currentData || !item) {
      this.selectButton.setLabel('Equip')
      this.selectButton.setDisabled(true)
      return
    }

    const type = this.selectedCategory
    if (!this.isOwned(type, item.id)) {
      const verb = type === 'character' ? 'Unlock' : 'Buy'
      this.selectButton.setLabel(`${verb} · ${item.unlockCost} ●`)
      this.selectButton.setDisabled(this.currentData.currentCoins < item.unlockCost)
      return
    }

    if (this.isEquipped(type, item.id)) {
      const removable = type === 'accessory' && !item.isDefault
      this.selectButton.setLabel(removable ? 'Remove' : 'Equipped')
      this.selectButton.setDisabled(!removable)
      return
    }

    this.selectButton.setLabel('Equip')
    this.selectButton.setDisabled(false)
  }
}
