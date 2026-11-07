/**
 * Captures store screenshots of the real game in the locally installed
 * Google Chrome (no browser download), in Turkish, English, German and Spanish.
 *
 *   npm run store:screenshots            # Play: 1080x1920 (360x640 @3x)
 *   npm run store:screenshots -- --ios   # App Store 6.7": 1290x2796 (430x932 @3x)
 *
 * Output: store/screenshots/<platform>/<lang>/NN-name.png
 *
 * Uses the Vite dev server because the dev build exposes `window.__turkuaz`,
 * which the script uses to stage each scene deterministically.
 */
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ios = process.argv.includes('--ios')
const viewport = ios ? { width: 430, height: 932 } : { width: 360, height: 640 }
const platform = ios ? 'ios' : 'play'
const languages = ['tr', 'en', 'de', 'es']
const LOCALES = { tr: 'tr-TR', en: 'en-US', de: 'de-DE', es: 'es-ES' }

const server = await createServer({
  root,
  server: { port: 5199, strictPort: false, hmr: false, watch: null },
  logLevel: 'error',
})
await server.listen()
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5199/'

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  // Software WebGL so the capture works on any machine and in CI.
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

try {
  for (const lang of languages) {
    const outDir = join(root, 'store', 'screenshots', platform, lang)
    mkdirSync(outDir, { recursive: true })
    // Generated files only: a renamed scene must not leave a stale shot behind.
    for (const file of readdirSync(outDir).filter((name) => name.endsWith('.png'))) {
      rmSync(join(outDir, file))
    }
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: LOCALES[lang],
    })
    const page = await context.newPage()
    page.on('pageerror', (error) => console.error(`[${lang}] page error:`, error.message))
    await page.goto(url)
    await page.waitForFunction(() => window.__turkuaz?.state === 'menu', null, { timeout: 120_000 })

    // A believable returning player: some coins, a few islands, cosmetics owned.
    await page.evaluate(async () => {
      const g = window.__turkuaz
      g.settingsFlow.recordConsent(false)
      g.playerSave.updateTutorial({ completed: true, completedAt: Date.now(), stepsCompleted: [] })
      g.progression.creditCoins(2480)
      g.progression.creditCrystals(36)
      g.progression.recordRun({ score: 18420, distance: 1840, crystals: 12 })
      const { LEVEL_CATALOG } = await import('/src/game/levels/LevelCatalog.ts')
      for (const level of LEVEL_CATALOG.slice(0, 6)) {
        g.levels.recordRun(level, {
          distance: level.targetDistance,
          score: 4000,
          coins: level.completionCoins,
          crystals: level === LEVEL_CATALOG[0] ? level.completionCrystals : 0,
          completed: true,
        })
      }
      g.showMenuScreen()
    })
    await wait(1500)

    const shot = async (name) => {
      await wait(900)
      await page.screenshot({ path: join(outDir, `${name}.png`) })
      console.log(`✓ ${platform}/${lang}/${name}.png`)
    }

    await shot('01-menu')

    // A run in full swing on a later island (Sunset Lagoon): keep the runner
    // alive while the camera settles.
    await page.evaluate(async () => {
      const g = window.__turkuaz
      const { LEVEL_CATALOG } = await import('/src/game/levels/LevelCatalog.ts')
      const island = LEVEL_CATALOG.find((level) => level.id === 'sunset-lagoon') ?? null
      if (island) g.levels.unlock(island.id)
      g.startRun(island)
      window.__keepAlive = setInterval(() => {
        g.invulnerabilityTimer = 999
        if (g.state === 'paused') g.resume()
      }, 100)
      setTimeout(() => g.input.queueLaneChange(-1), 1200)
      setTimeout(() => g.input.queueJump(), 2600)
    })
    await wait(3000)
    // A power-up picked up on the way would hide the runner in its glow.
    await page.evaluate(() => {
      const g = window.__turkuaz
      g.powerUps.reset()
      g.effects.reset()
      g.dash.reset()
      // The newer power-ups, shown in the HUD; neither hides the runner.
      g.powerUps.apply('slowMo')
      g.powerUps.apply('magnet')
    })
    await shot('02-run')

    // A chase island with the giant wave right behind the runner.
    await page.evaluate(async () => {
      const g = window.__turkuaz
      const { LEVEL_CATALOG } = await import('/src/game/levels/LevelCatalog.ts')
      const island = LEVEL_CATALOG.find((level) => level.chase) ?? null
      if (island) g.levels.unlock(island.id)
      g.returnToMenu()
      g.startRun(island)
      clearInterval(window.__keepAlive)
      window.__keepAlive = setInterval(() => {
        g.invulnerabilityTimer = 999
        g.chase.currentGap = 9
        if (g.state === 'paused') g.resume()
      }, 50)
    })
    await wait(2600)
    await page.evaluate(() => window.__turkuaz.powerUps.reset())
    await shot('03-chase')

    await page.evaluate(() => {
      clearInterval(window.__keepAlive)
      const g = window.__turkuaz
      g.returnToMenu()
      g.menus.showLevelSelection()
    })
    await shot('04-islands')

    // One of the newer runners, as a returning player might wear it.
    await page.evaluate(() => {
      const g = window.__turkuaz
      for (const [type, id] of [
        ['character', 'tide-mage'],
        ['color', 'color-sunset'],
        ['skin', 'skin-autumn'],
      ]) {
        g.playerSave.purchaseCosmetic(type, id)
        g.playerSave.equip(type, id)
      }
      g.shop.applyAppearance()
      g.shop.open()
    })
    await wait(1500)
    await shot('05-characters')

    await page.evaluate(async () => {
      const g = window.__turkuaz
      g.showMenuScreen()
      const { LEVEL_CATALOG } = await import('/src/game/levels/LevelCatalog.ts')
      g.startRun(LEVEL_CATALOG[2])
      g.coins = LEVEL_CATALOG[2].completionCoins + 12
      g.crystals = LEVEL_CATALOG[2].completionCrystals
      g.distance = LEVEL_CATALOG[2].targetDistance
      g.runTime = 74
      g.finishRun(false, false, false, true)
    })
    await wait(2200)
    await shot('06-level-complete')

    await page.evaluate(() => {
      const g = window.__turkuaz
      g.returnToMenu()
      // Partial progress on whatever today's missions are.
      for (const mission of g.meta.missions.list()) {
        const amount = Math.ceil(mission.target * 0.6)
        if (mission.kind === 'distance' || mission.kind === 'score' || mission.kind === 'runs') {
          g.meta.record({ kind: 'runEnd', distance: amount, score: amount })
        } else {
          g.meta.record({ kind: mission.kind, amount })
        }
      }
      g.menus.showProgress()
    })
    await shot('07-missions')

    await context.close()
  }
} finally {
  await browser.close()
  await server.close()
}
