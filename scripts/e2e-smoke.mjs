/**
 * End-to-end smoke test: boots the real game in headless Google Chrome
 * (software WebGL, no browser download) and walks the main flows — menu,
 * character screen, islands, a run, pause/resume, crash → continue → game
 * over. Fails on any uncaught page error or console error.
 *
 *   npm run test:e2e
 *
 * Uses the Vite dev server because the dev build exposes `window.__turkuaz`.
 * When `dist/` exists (run `npm run build` first) the production build is
 * also booted, to prove the release bundle — including Rapier's separately
 * shipped WASM — loads. Set CHROME_PATH to use a specific Chrome binary.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { createServer, preview } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const server = await createServer({
  root,
  // No hot reload: a file saved mid-test must not restart the game under it.
  server: { port: 5198, strictPort: false, hmr: false, watch: null },
  logLevel: 'error',
})
await server.listen()
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5198/'

const browser = await chromium.launch({
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : { channel: 'chrome' }),
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const problems = []
let passed = 0
let failed = 0

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

try {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'tr-TR',
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      problems.push(`console error: ${message.text()}`)
    }
  })

  console.log('Boot')
  const started = Date.now()
  await page.goto(url)
  await page.waitForFunction(() => window.__turkuaz?.state === 'menu', null, { timeout: 120_000 })
  check(`reaches the menu (${((Date.now() - started) / 1000).toFixed(1)}s)`, true)
  check('canvas is rendered', await page.evaluate(() => document.querySelector('canvas') !== null))
  check(
    'consent prompt shown on first launch',
    await page.evaluate(() => window.__turkuaz.consent.needsPrompt),
  )
  await page.evaluate(() => window.__turkuaz.settingsFlow.recordConsent(false))
  check('menu visible after consent', await page.evaluate(() => window.__turkuaz.ui.isMenuVisible))

  console.log('Menus')
  await page.evaluate(() => window.__turkuaz.shop.open())
  await wait(500)
  check(
    'character screen opens',
    await page.evaluate(() => window.__turkuaz.ui.isCharacterSelectionOpen),
  )
  check('showcase camera active', await page.evaluate(() => window.__turkuaz.shop.isShowcaseActive))
  await page.keyboard.press('Escape')
  await wait(300)
  check('Esc returns to the menu', await page.evaluate(() => window.__turkuaz.ui.isMenuVisible))
  await page.evaluate(() => window.__turkuaz.menus.showLevelSelection())
  await page.evaluate(() => window.__turkuaz.menus.showProgress())
  await page.evaluate(() => window.__turkuaz.settingsFlow.show())
  await page.keyboard.press('Escape')
  await wait(300)

  console.log('Tutorial run')
  await page.evaluate(() => window.__turkuaz.startRun(null))
  check(
    'first run starts the tutorial',
    await page.evaluate(() => window.__turkuaz.tutorialFlow.isActive),
  )
  // Software WebGL can be slow on a busy machine or CI runner: wait for
  // progress instead of a fixed time, so the check doesn't depend on frame rate.
  await page
    .waitForFunction(
      () => window.__turkuaz.distance > 10 || window.__turkuaz.state !== 'playing',
      null,
      {
        timeout: 30_000,
      },
    )
    .catch(() => undefined)
  const run = await page.evaluate(() => ({
    state: window.__turkuaz.state,
    distance: window.__turkuaz.distance,
  }))
  check('runner moves forward', run.state === 'playing' && run.distance > 10, JSON.stringify(run))
  await page.keyboard.press('Escape')
  check('Esc pauses the run', await page.evaluate(() => window.__turkuaz.state === 'paused'))
  await page.evaluate(() => window.__turkuaz.resume())
  check('resume continues', await page.evaluate(() => window.__turkuaz.state === 'playing'))
  await page.evaluate(() => window.__turkuaz.tutorialFlow.end('skip'))
  check(
    'tutorial can be skipped',
    await page.evaluate(() => !window.__turkuaz.tutorialFlow.isActive),
  )

  console.log('Crash, continue, game over')
  await page.evaluate(() => {
    const g = window.__turkuaz
    g.progression.creditCoins(500)
    g.finishRun(true)
  })
  check('a crash offers a continue', await page.evaluate(() => window.__turkuaz.state === 'offer'))
  await wait(1500)
  await page.evaluate(() => window.__turkuaz.continueOffer.payWithCoins())
  check('paying coins revives', await page.evaluate(() => window.__turkuaz.state === 'playing'))
  // The continue must not restart in front of the obstacle that was hit.
  const revivedAt = await page.evaluate(() => window.__turkuaz.player.position.z)
  await page
    .waitForFunction((z) => z - window.__turkuaz.player.position.z > 8, revivedAt, {
      timeout: 20_000,
    })
    .catch(() => undefined)
  const revivedRun = await page.evaluate((z) => z - window.__turkuaz.player.position.z, revivedAt)
  check('the runner gets going after a continue', revivedRun > 8, `${revivedRun.toFixed(1)} m`)
  // A checkpoint passed long ago sits on a segment that has been recycled
  // ahead: a continue must not respawn the runner over open sea.
  await page.evaluate(() => {
    const g = window.__turkuaz
    if (g.state !== 'playing') return
    g.recovery.setCheckpoint({ x: 0, y: 2.81, z: g.player.position.z + 120 })
    g.finishRun(true)
  })
  await wait(800)
  await page.evaluate(() => {
    if (window.__turkuaz.state === 'offer') window.__turkuaz.continueOffer.payWithCoins()
  })
  await wait(1200)
  const afterStale = await page.evaluate(() => ({
    state: window.__turkuaz.state,
    y: window.__turkuaz.player.position.y,
  }))
  check(
    'a continue with a stale checkpoint lands on the track',
    afterStale.state === 'playing' && afterStale.y > 2,
    `${afterStale.state}, y ${afterStale.y.toFixed(2)}`,
  )
  await page.evaluate(() => {
    if (window.__turkuaz.state === 'playing') window.__turkuaz.finishRun(true, true)
  })
  check(
    'game over after a final crash',
    await page.evaluate(() => window.__turkuaz.state === 'gameover'),
  )
  await wait(2500)
  check(
    'the share button is on the summary',
    await page
      .locator('.screen--gameover button', { hasText: /./ })
      .count()
      .then((n) => n >= 3),
  )

  console.log('Welcome chest and character trial')
  check(
    'a welcome chest opens over the first summary',
    await page.evaluate(() => window.__turkuaz.ui.isGiftOpen),
  )
  const walletBefore = await page.evaluate(() => window.__turkuaz.progression.snapshot.coins)
  await page.locator('.gift-panel .btn--primary').click()
  check(
    'opening it pays coins and offers a character trial',
    await page.evaluate(
      (before) =>
        window.__turkuaz.progression.snapshot.coins >= before + 250 &&
        document.querySelector('.gift__offer') !== null,
      walletBefore,
    ),
  )
  await page.locator('.gift-panel .btn--primary').click()
  check(
    'the trial run starts in the trial character',
    await page.evaluate(
      () =>
        window.__turkuaz.state === 'playing' &&
        window.__turkuaz.welcome.trialCharacter === 'tide-mage' &&
        !window.__turkuaz.ui.isGiftOpen,
    ),
  )
  await page.evaluate(() => window.__turkuaz.finishRun(true, true))
  await wait(2500)
  check(
    'the trial ends with its run and the chest does not come back',
    await page.evaluate(
      () => window.__turkuaz.welcome.trialCharacter === null && !window.__turkuaz.ui.isGiftOpen,
    ),
  )
  await page.evaluate(() => window.__turkuaz.returnToMenu())
  check('back to the menu', await page.evaluate(() => window.__turkuaz.state === 'menu'))

  console.log('Season road')
  await page.evaluate(() => {
    const g = window.__turkuaz
    g.meta.season.addXp(250)
    g.menus.showProgress()
  })
  await page.locator('.progress__tabs [data-tab="season"]').click()
  const tierButtons = page.locator('.progress__list [data-kind="season"]:not([disabled])')
  check('reached season tiers can be claimed', (await tierButtons.count()) === 2)
  const crystalsBefore = await page.evaluate(() => window.__turkuaz.progression.snapshot.coins)
  await tierButtons.first().click()
  check(
    'claiming a tier pays out',
    await page.evaluate(
      (before) => window.__turkuaz.progression.snapshot.coins > before,
      crystalsBefore,
    ),
  )
  await page.evaluate(() => window.__turkuaz.returnToMenu())

  console.log('Restart')
  // "Run again" right after a crash: the new run must not end at 0 m (the
  // runner's collider used to stay where the last run ended for one step).
  const restartDistances = []
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.evaluate(() => {
      const g = window.__turkuaz
      g.returnToMenu()
      g.startRun(null)
      window.__keepAlive = setInterval(() => {
        g.invulnerabilityTimer = 0
      }, 1000)
    })
    await page
      .waitForFunction(() => window.__turkuaz.state !== 'playing', null, { timeout: 60_000 })
      .catch(() => undefined)
    // The timer lives in the page, so it must be cleared there.
    await page.evaluate(() => clearInterval(window.__keepAlive))
    restartDistances.push(await page.evaluate(() => Math.round(window.__turkuaz.distance)))
  }
  await page.evaluate(() => window.__turkuaz.returnToMenu())
  check(
    'a new run never crashes at the start line',
    restartDistances.every((distance) => distance > 2),
    restartDistances.join(', '),
  )

  console.log('Island run')
  await page.evaluate(async () => {
    const { LEVEL_CATALOG } = await import('/src/game/levels/LevelCatalog.ts')
    window.__turkuaz.startRun(LEVEL_CATALOG[0])
  })
  await wait(2500)
  check('island run plays', await page.evaluate(() => window.__turkuaz.state !== 'error'))
  await page.evaluate(() => window.__turkuaz.returnToMenu())

  console.log('Finish an island')
  // Play island 1 for real, then move the runner just short of the finish
  // line and let it cross by itself: completion, stars, unlock, next island.
  await page.evaluate(async () => {
    const g = window.__turkuaz
    const { LEVEL_CATALOG } = await import('/src/game/levels/LevelCatalog.ts')
    g.returnToMenu()
    g.startRun(LEVEL_CATALOG[0])
    window.__keepAlive = setInterval(() => {
      g.invulnerabilityTimer = 99
    }, 50)
  })
  await page.waitForFunction(() => window.__turkuaz.distance > 5, null, { timeout: 30_000 })
  await page.evaluate(() => {
    const g = window.__turkuaz
    const level = g.currentLevel
    // Meet the coin and crystal goals so all three stars are earned.
    g.coins = level.completionCoins
    g.crystals = level.completionCrystals
    // Keep the stretch before the line clear while the track streams in: this
    // checks the finish flow, and an obstacle would just hold the
    // (invulnerable) runner in place.
    window.__clearTrack = setInterval(() => {
      for (const segment of [...g.world.obstacles.bySegment.keys()]) {
        g.world.obstacles.clearSegment(segment)
      }
    }, 50)
    const p = g.player.position
    // Drop in from a metre up: the track there is streamed in this same frame,
    // and the physics query only sees the recycled deck after the next step.
    // Landed straight on it, the runner would sink into the deck.
    g.player.reset({ x: p.x, y: p.y + 1.2, z: -(level.targetDistance - 25) })
  })
  const crossed = await page
    .waitForFunction(() => window.__turkuaz.state === 'gameover', null, { timeout: 60_000 })
    .then(() => true)
    .catch(() => false)
  check(
    'the runner crosses the finish line',
    crossed,
    await page.evaluate(() => {
      const g = window.__turkuaz
      return `${g.state} at ${Math.round(g.distance)} m, y ${g.player.position.y.toFixed(2)}`
    }),
  )
  const outcome = await page.evaluate(async () => {
    const g = window.__turkuaz
    const { LEVEL_CATALOG } = await import('/src/game/levels/LevelCatalog.ts')
    const progress = g.levels.getProgress(LEVEL_CATALOG[0].id)
    return {
      completed: progress.completed,
      stars: progress.bestStars,
      nextUnlocked: g.levels.isUnlocked(LEVEL_CATALOG[1].id),
      nextId: LEVEL_CATALOG[1].id,
    }
  })
  check(
    'island 1 is completed with three stars',
    outcome.completed && outcome.stars === 3,
    JSON.stringify(outcome),
  )
  check('island 2 unlocks', outcome.nextUnlocked)
  const nextButton = page.locator('.level-completed__next')
  const summaryShown = await nextButton
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false)
  check('the island complete screen appears', summaryShown)
  if (summaryShown) {
    await nextButton.click()
    await page.waitForTimeout(500)
  }
  const nextRun = await page.evaluate(() => ({
    state: window.__turkuaz.state,
    level: window.__turkuaz.currentLevel?.id,
  }))
  check(
    '"Next island" starts island 2',
    nextRun.state === 'playing' && nextRun.level === outcome.nextId,
    JSON.stringify(nextRun),
  )
  await page.evaluate(() => {
    clearInterval(window.__keepAlive)
    clearInterval(window.__clearTrack)
    window.__turkuaz.returnToMenu()
  })

  console.log('Every island')
  const islands = await page.evaluate(async () => {
    const { LEVEL_CATALOG } = await import('/src/game/levels/LevelCatalog.ts')
    return LEVEL_CATALOG.map((level) => level.id)
  })
  const broken = []
  for (const id of islands) {
    const launched = await page.evaluate(async (levelId) => {
      const g = window.__turkuaz
      const { LEVEL_CATALOG } = await import('/src/game/levels/LevelCatalog.ts')
      const level = LEVEL_CATALOG.find((entry) => entry.id === levelId)
      g.returnToMenu()
      g.levels.unlock(levelId)
      g.startRun(level)
      g.invulnerabilityTimer = 99
      return g.currentLevel?.id === levelId && g.state === 'playing'
    }, id)
    const moved = await page
      .waitForFunction(() => window.__turkuaz.distance > 1, null, { timeout: 20_000 })
      .then(() => true)
      .catch(() => false)
    if (!launched || !moved) {
      broken.push(id)
    }
  }
  await page.evaluate(() => window.__turkuaz.returnToMenu())
  check(
    `all ${islands.length} islands start and run`,
    broken.length === 0,
    broken.length ? `failed: ${broken.join(', ')}` : '',
  )

  await context.close()

  if (existsSync(join(root, 'dist', 'index.html'))) {
    console.log('Production build')
    const previewServer = await preview({
      root,
      preview: { port: 5197, strictPort: false },
      logLevel: 'error',
    })
    try {
      const prod = await browser.newContext({
        viewport: { width: 393, height: 852 },
        isMobile: true,
        hasTouch: true,
      })
      const prodPage = await prod.newPage()
      prodPage.on('pageerror', (error) => problems.push(`[prod] page error: ${error.message}`))
      prodPage.on('console', (message) => {
        if (message.type() === 'error') {
          problems.push(`[prod] console error: ${message.text()}`)
        }
      })
      const wasm = prodPage.waitForResponse((response) => response.url().endsWith('.wasm'), {
        timeout: 60_000,
      })
      await prodPage.goto(previewServer.resolvedUrls?.local[0] ?? 'http://localhost:5197/')
      const wasmResponse = await wasm
      check('physics WASM served separately', wasmResponse.ok(), `HTTP ${wasmResponse.status()}`)
      await prodPage.waitForFunction(
        () => document.querySelector('.screen--loading')?.hidden === true,
        null,
        { timeout: 120_000 },
      )
      const visible = await prodPage.evaluate(() =>
        [...document.querySelectorAll('.screen')]
          .filter((screen) => !screen.hidden)
          .map((screen) => screen.className),
      )
      // First launch: the consent prompt sits over the title screen.
      const ready = visible.some((name) => /screen--(menu|overlay)/.test(name))
      check(
        'release build reaches the menu',
        ready && !visible.some((name) => name.includes('screen--error')),
        visible.join(', '),
      )
      await prod.close()
    } finally {
      await new Promise((resolve) => previewServer.httpServer.close(resolve))
    }
  }
} catch (error) {
  failed += 1
  console.log(`  ✗ ${error instanceof Error ? error.message : String(error)}`)
} finally {
  await browser.close()
  await server.close()
}

check('no page or console errors', problems.length === 0, problems.slice(0, 5).join(' | '))
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
