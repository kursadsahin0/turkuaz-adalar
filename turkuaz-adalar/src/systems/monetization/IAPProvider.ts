/**
 * In-app purchase interface for future premium features.
 * Placeholder showing integration points for IAP systems.
 *
 * INTEGRATION NOTES:
 * - Android: Google Play Billing Library
 * - iOS: StoreKit 2 (StoreKit Framework)
 * - Web: IAP providers (Paddle, RevenueCat, etc.)
 * - Always validate receipts with platform servers
 * - Store purchase records securely
 * - Handle refunds gracefully
 *
 * PRODUCT IDs (example):
 * - com.tidelark.skin.crimson
 * - com.tidelark.outfit.explorer
 * - com.tidelark.premium.no_ads
 * - com.tidelark.premium.double_coins
 *
 * SECURITY WARNINGS:
 * - Never trust client-side purchase validation
 * - Always verify receipts with platform servers
 * - Store cryptographic keys securely (not in code)
 * - Handle subscription cancellations
 */

export type PurchasePlatform = 'ios' | 'android' | 'web'

export interface Product {
  id: string
  type: 'consumable' | 'non-consumable' | 'subscription'
  name: string
  description: string
  price: string
  priceInCents: number
  currency: string
}

export interface PurchaseResult {
  success: boolean
  productId: string
  transactionId?: string
  receipt?: string
  error?: string
}

export interface IAPConfig {
  platform: PurchasePlatform
  testMode: boolean
  /** Platform-specific configuration */
  platformConfig?: {
    googlePlayPublicKey?: string
    appleBundleId?: string
    webProvider?: string
  }
}

/**
 * Abstract IAP provider interface.
 * Implementations must validate receipts with platform servers.
 */
export abstract class IAPProvider {
  protected readonly testMode: boolean
  protected disposed = false

  constructor(testMode = false) {
    this.testMode = testMode
  }

  /**
   * Initialize the IAP system and load products.
   */
  abstract initialize(): Promise<void>

  /**
   * Get all available products.
   */
  abstract getProducts(): Promise<Product[]>

  /**
   * Purchase a product.
   */
  abstract purchase(productId: string): Promise<PurchaseResult>

  /**
   * Restore previous purchases.
   */
  abstract restorePurchases(): Promise<PurchaseResult[]>

  /**
   * Check if a product is purchased.
   */
  abstract isPurchased(productId: string): boolean

  /**
   * Consume a consumable purchase.
   */
  abstract consume(productId: string): Promise<void>

  /**
   * Dispose the provider.
   */
  dispose(): void {
    this.disposed = true
  }
}

/**
 * Test IAP provider for development.
 * Simulates purchases without real payment processing.
 */
export class TestIAPProvider extends IAPProvider {
  private readonly products: Product[] = [
    {
      id: 'com.tidelark.skin.crimson',
      type: 'consumable',
      name: 'Crimson Tide Skin',
      description: 'Bold red color for daring runners.',
      price: '$0.99',
      priceInCents: 99,
      currency: 'USD',
    },
    {
      id: 'com.tidelark.skin.golden',
      type: 'consumable',
      name: 'Golden Sun Skin',
      description: 'Shine bright like the tropical sun.',
      price: '$1.49',
      priceInCents: 149,
      currency: 'USD',
    },
    {
      id: 'com.tidelark.premium.no_ads',
      type: 'non-consumable',
      name: 'No Ads',
      description: 'Remove all advertisements permanently.',
      price: '$4.99',
      priceInCents: 499,
      currency: 'USD',
    },
  ]
  private readonly purchasedProducts = new Set<string>()

  constructor(testMode = true) {
    super(testMode)
  }

  async initialize(): Promise<void> {
    // Test provider doesn't need initialization
  }

  async getProducts(): Promise<Product[]> {
    return [...this.products]
  }

  async purchase(productId: string): Promise<PurchaseResult> {
    const product = this.products.find((p) => p.id === productId)
    if (!product) {
      return { success: false, productId, error: 'Product not found' }
    }

    if (this.purchasedProducts.has(productId) && product.type === 'non-consumable') {
      return { success: false, productId, error: 'Already owned' }
    }

    // Simulate purchase processing (test mode only)
    await new Promise((resolve) => setTimeout(resolve, 500))

    const transactionId = `test_txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.purchasedProducts.add(productId)

    return {
      success: true,
      productId,
      transactionId,
      receipt: `test_receipt_${transactionId}`,
    }
  }

  async restorePurchases(): Promise<PurchaseResult[]> {
    const results: PurchaseResult[] = []
    for (const productId of this.purchasedProducts) {
      results.push({
        success: true,
        productId,
        transactionId: `restored_${productId}`,
        receipt: `test_receipt_${productId}`,
      })
    }
    return results
  }

  isPurchased(productId: string): boolean {
    return this.purchasedProducts.has(productId)
  }

  async consume(productId: string): Promise<void> {
    const product = this.products.find((p) => p.id === productId)
    if (!product) {
      throw new Error('Product not found')
    }

    if (product.type !== 'consumable') {
      throw new Error('Cannot consume non-consumable product')
    }

    this.purchasedProducts.delete(productId)
  }

  dispose(): void {
    super.dispose()
    this.purchasedProducts.clear()
  }
}
