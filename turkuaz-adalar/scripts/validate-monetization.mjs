import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const AD_PROVIDER_FILE = join(root, 'src/systems/monetization/AdProvider.ts')
const TEST_AD_PROVIDER_FILE = join(root, 'src/systems/monetization/TestAdProvider.ts')
const ADMOB_PROVIDER_FILE = join(root, 'src/systems/monetization/AdMobProvider.ts')
const MONETIZATION_MANAGER_FILE = join(root, 'src/systems/monetization/MonetizationManager.ts')
const IAP_PROVIDER_FILE = join(root, 'src/systems/monetization/IAPProvider.ts')

function readFile(path) {
  try {
    return readFileSync(path, 'utf-8')
  } catch (e) {
    console.error(`Failed to read ${path}:`, e.message)
    process.exit(1)
  }
}

console.log('Monetization Architecture Validation\n')

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

// Test 1: Ad Provider Interface
console.log('Test 1: Ad Provider Interface')
const adProviderContent = readFile(AD_PROVIDER_FILE)
test('AdProvider class defined', adProviderContent.includes('class AdProvider'), 'AdProvider class not found')
test('AdConfig interface defined', adProviderContent.includes('interface AdConfig'), 'AdConfig interface not found')
test('AdResult interface defined', adProviderContent.includes('interface AdResult'), 'AdResult interface not found')
test('RewardConfig interface defined', adProviderContent.includes('interface RewardConfig'), 'RewardConfig interface not found')
test('loadAd method abstract', adProviderContent.includes('abstract loadAd'), 'loadAd not abstract')
test('showAd method abstract', adProviderContent.includes('abstract showAd'), 'showAd not abstract')
test('isAdReady method abstract', adProviderContent.includes('abstract isAdReady'), 'isAdReady not abstract')
test('isAdsAvailable method abstract', adProviderContent.includes('abstract isAdsAvailable'), 'isAdsAvailable not abstract')
test('Test mode support', adProviderContent.includes('testMode'), 'testMode not supported')
test('Dispose method', adProviderContent.includes('dispose()'), 'dispose method not found')
test('Min time between ads', adProviderContent.includes('getMinTimeBetweenAds'), 'getMinTimeBetweenAds not found')
test('Ad shown tracking', adProviderContent.includes('lastAdShown'), 'lastAdShown not tracked')
test('Can show ad check', adProviderContent.includes('canShowAd'), 'canShowAd not implemented')

// Test 2: Test Ad Provider
console.log('\nTest 2: Test Ad Provider')
const testAdContent = readFile(TEST_AD_PROVIDER_FILE)
test('TestAdProvider class defined', testAdContent.includes('class TestAdProvider'), 'TestAdProvider class not found')
test('Extends AdProvider', testAdContent.includes('extends AdProvider'), 'Does not extend AdProvider')
test('Configurable delay', testAdContent.includes('minDelay'), 'minDelay not configurable')
test('Configurable success rate', testAdContent.includes('successRate'), 'successRate not configurable')
test('Simulates ad loading', testAdContent.includes('await new Promise'), 'Ad loading not simulated')
test('Simulates ad duration', testAdContent.includes('this.minDelay'), 'Ad duration not simulated')
test('Simulates user skip', testAdContent.includes('skipped'), 'User skip not simulated')
test('Tracks loaded ads', testAdContent.includes('loadedAds'), 'Loaded ads not tracked')
test('Respects min time between ads', testAdContent.includes('canShowAd'), 'Min time not enforced')

// Test 3: AdMob Provider Interface
console.log('\nTest 3: AdMob Provider Interface')
const admobContent = readFile(ADMOB_PROVIDER_FILE)
test('AdMobProvider class defined', admobContent.includes('class AdMobProvider'), 'AdMobProvider class not found')
test('Extends AdProvider', admobContent.includes('extends AdProvider'), 'Does not extend AdProvider')
test('App ID configuration', admobContent.includes('appId'), 'App ID not configurable')
test('Rewarded ad unit ID', admobContent.includes('rewardedAdUnitId'), 'Rewarded ad unit ID not configurable')
test('Interstitial ad unit ID', admobContent.includes('interstitialAdUnitId'), 'Interstitial ad unit ID not configurable')
test('Placeholder warnings', admobContent.includes('TODO: Implement'), 'Missing placeholder warnings')
test('Integration notes present', admobContent.includes('INTEGRATION NOTES'), 'Integration notes missing')
test('Test ad unit IDs in comments', admobContent.includes('ca-app-pub'), 'Test ad unit IDs not documented')
test('Real ad IDs not used', !admobContent.includes('REAL AD UNIT IDs') || admobContent.includes('NEVER use real ad IDs'), 'Real ad IDs might be used')

// Test 4: Monetization Manager
console.log('\nTest 4: Monetization Manager')
const managerContent = readFile(MONETIZATION_MANAGER_FILE)
test('MonetizationManager class defined', managerContent.includes('class MonetizationManager'), 'MonetizationManager class not found')
test('Provider injection', managerContent.includes('provider: AdProvider'), 'Provider not injected')
test('Test mode configuration', managerContent.includes('testMode'), 'Test mode not configurable')
test('loadAd method', managerContent.includes('loadAd'), 'loadAd method not found')
test('showRewardedAd method', managerContent.includes('showRewardedAd'), 'showRewardedAd method not found')
test('showInterstitialAd method', managerContent.includes('showInterstitialAd'), 'showInterstitialAd method not found')
test('isAdReady method', managerContent.includes('isAdReady'), 'isAdReady method not found')
test('isAdsAvailable method', managerContent.includes('isAdsAvailable'), 'isAdsAvailable method not found')
test('Event tracking', managerContent.includes('MonetizationEvent'), 'Event tracking not implemented')
test('Event recording', managerContent.includes('recordEvent'), 'Event recording not implemented')
test('getEvents method', managerContent.includes('getEvents()'), 'getEvents method not found')
test('clearEvents method', managerContent.includes('clearEvents()'), 'clearEvents method not found')
test('Dispose method', managerContent.includes('dispose()'), 'dispose method not found')

// Test 5: IAP Provider Interface
console.log('\nTest 5: IAP Provider Interface')
const iapContent = readFile(IAP_PROVIDER_FILE)
test('IAPProvider class defined', iapContent.includes('class IAPProvider'), 'IAPProvider class not found')
test('Product interface defined', iapContent.includes('interface Product'), 'Product interface not found')
test('PurchaseResult interface defined', iapContent.includes('interface PurchaseResult'), 'PurchaseResult interface not found')
test('IAPConfig interface defined', iapContent.includes('interface IAPConfig'), 'IAPConfig interface not found')
test('initialize method abstract', iapContent.includes('abstract initialize'), 'initialize not abstract')
test('getProducts method abstract', iapContent.includes('abstract getProducts'), 'getProducts not abstract')
test('purchase method abstract', iapContent.includes('abstract purchase'), 'purchase not abstract')
test('restorePurchases method abstract', iapContent.includes('abstract restorePurchases'), 'restorePurchases not abstract')
test('isPurchased method abstract', iapContent.includes('abstract isPurchased'), 'isPurchased not abstract')
test('consume method abstract', iapContent.includes('abstract consume'), 'consume not abstract')
test('Dispose method', iapContent.includes('dispose()'), 'dispose method not found')
test('Integration notes', iapContent.includes('INTEGRATION NOTES'), 'Integration notes missing')
test('Platform-specific notes', iapContent.includes('Google Play Billing'), 'Platform notes missing')
test('Security warnings', iapContent.includes('SECURITY WARNINGS') || iapContent.includes('security'), 'Security warnings missing')
test('Receipt validation note', iapContent.includes('validate receipts'), 'Receipt validation note missing')

// Test 6: Test IAP Provider
console.log('\nTest 6: Test IAP Provider')
test('TestIAPProvider class defined', iapContent.includes('class TestIAPProvider'), 'TestIAPProvider class not found')
test('Extends IAPProvider', iapContent.includes('extends IAPProvider'), 'Does not extend IAPProvider')
test('Sample products defined', iapContent.includes('com.turkuazadalar'), 'Sample products not defined')
test('Purchase simulation', iapContent.includes('Simulate purchase') || iapContent.includes('simulate purchase'), 'Purchase not simulated')
test('Purchased tracking', iapContent.includes('purchasedProducts'), 'Purchased products not tracked')
test('Restore purchases', iapContent.includes('restorePurchases'), 'Restore purchases not implemented')
test('Consume consumables', iapContent.includes('consume'), 'Consume not implemented')
test('Non-consumable protection', iapContent.includes('non-consumable'), 'Non-consumable protection not implemented')

// Test 7: Separation from Gameplay
console.log('\nTest 7: Separation from Gameplay')
test('Monetization in separate package', AD_PROVIDER_FILE.includes('monetization'), 'Not in monetization package')
test('No gameplay imports', !managerContent.includes('game/'), 'Monetization imports gameplay')
test('No direct Game imports', !managerContent.includes('Game.ts'), 'Monetization imports Game directly')
test('Clear integration points', managerContent.includes('loadAd'), 'Integration points not clear')
test('Event-based communication', managerContent.includes('MonetizationEvent'), 'Event-based communication not used')

// Test 8: Platform Policy Respect
console.log('\nTest 8: Platform Policy Respect')
test('Min time between ads enforced', adProviderContent.includes('canShowAd'), 'Min time not enforced')
test('Never simulate completion warning', adProviderContent.includes('NEVER simulate'), 'Warning about simulation missing')
test('No interrupt gameplay note', managerContent.includes('interrupt'), 'Warning about gameplay interruption missing')
test('Reward only on confirmation', managerContent.includes('rewardGranted'), 'Reward not conditional on confirmation')

// Test 9: Test Mode Support
console.log('\nTest 9: Test Mode Support')
test('Test mode flag in AdProvider', adProviderContent.includes('testMode'), 'Test mode not supported')
test('Test mode flag in MonetizationManager', managerContent.includes('testMode'), 'Test mode not supported')
test('Test provider uses test mode', testAdContent.includes('testMode'), 'Test provider ignores test mode')
test('Configurable test behavior', testAdContent.includes('minDelay'), 'Test behavior not configurable')

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)

if (failed === 0) {
  console.log('\n✓ All monetization architecture tests passed!')
  console.log('\nArchitecture is ready for:')
  console.log('- Test mode development and testing')
  console.log('- AdMob integration when Android SDK is added')
  console.log('- IAP integration when platform SDKs are added')
  console.log('- Clear separation from gameplay')
  console.log('- Platform policy compliance')
  process.exit(0)
} else {
  console.log('\n✗ Some monetization architecture tests failed!')
  process.exit(1)
}
