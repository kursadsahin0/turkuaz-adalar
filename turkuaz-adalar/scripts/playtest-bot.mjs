/**
 * Bot playtest: a simple runner AI plays chosen islands in headless Chrome and
 * reports how far it gets and what knocks it out. It steers through the same
 * inputs a player uses (lane step, jump, slide), sees ~1 s ahead and reacts
 * every 0.1 s, so it is a *relative* difficulty meter — compare islands with
 * each other — not a replacement for playing by hand.
 *
 *   npm run playtest                      # default island set, 3 tries each
 *   npm run playtest -- 13 24 30 --tries 5
 *
 * The simulation runs several fixed steps per frame with rendering switched
 * off, so a full island takes seconds. Needs the dev server's `__turkuaz`.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const triesAt = args.indexOf('--tries')
const tries = triesAt >= 0 ? Number(args[triesAt + 1]) : 3
const picked = args.filter((arg, index) => /^\d+$/.test(arg) && index !== triesAt + 1)
const islands = (
  picked.length > 0 ? picked : [1, 5, 9, 10, 12, 13, 14, 17, 19, 20, 24, 25, 26, 27, 28, 29, 30]
).map(Number)

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// No hot reload: editing a file mid-playtest must not restart the page.
const server = await createServer({
  root,
  server: { port: 5199, hmr: false, watch: null },
  logLevel: 'error',
})
await server.listen()
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5199/'
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : { channel: 'chrome' }),
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

try {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } })
  if (process.env.BOT_DEBUG) {
    await page.addInitScript(() => (window.__BOT_DEBUG = true))
    page.on('console', (message) => message.text().startsWith('{') && console.log(message.text()))
  }
  page.on('pageerror', (error) => console.log(`page error: ${error.message}`))
  await page.goto(url)
  await page.waitForFunction(() => window.__turkuaz?.state === 'menu', null, { timeout: 120_000 })

  await page.evaluate(() => {
    const g = window.__turkuaz
    g.settingsFlow.recordConsent(false)
    // Get the first-run tutorial out of the way.
    g.startRun(null)
    g.tutorialFlow.end('skip')
    g.returnToMenu()

    // Fast-forward: no drawing, eight fixed steps per frame.
    g.renderer.render = () => undefined
    g.time.consumeFixedSteps = () => 8

    const LANES = [-2.7, 0, 2.7]
    const STANDABLE = new Set(['moving-platform', 'disappearing-platform'])
    const bot = { cooldown: 0, laneSteps: 0 }
    window.__bot = bot

    const hazardsAhead = (playerZ, look) => {
      const result = []
      for (const list of g.world.obstacles.bySegment.values()) {
        for (const o of list) {
          if (!o.active || STANDABLE.has(o.kind)) continue
          const ahead = playerZ - o.z // the runner travels along -Z
          if (ahead > -(o.radius + 0.4) && ahead < look) result.push({ o, ahead })
        }
      }
      return result
    }

    const original = g.player.fixedUpdate.bind(g.player)
    g.player.fixedUpdate = (delta, input) => {
      bot.cooldown -= delta
      if (bot.cooldown > 0 || g.state !== 'playing') {
        return original(delta, input)
      }
      bot.cooldown = 0.1
      const p = g.player.position
      const speed = Math.max(4, input.forwardSpeed)
      const look = speed * 1.5 + 3
      const hazards = hazardsAhead(p.z, look)
      // Nearest blocking distance per lane (Infinity = clear).
      const nearest = LANES.map((laneX) =>
        Math.min(
          Infinity,
          ...hazards
            .filter(({ o }) => Math.abs(o.x - laneX) < o.radius + 0.75)
            .map(({ ahead }) => ahead),
        ),
      )
      const lane = g.player.laneIndex
      bot.last = {
        lane,
        x: +p.x.toFixed(2),
        y: +p.y.toFixed(2),
        speed: +speed.toFixed(1),
        nearest: nearest.map((n) => (Number.isFinite(n) ? +n.toFixed(1) : null)),
        hazards: hazards.map(
          ({ o, ahead }) =>
            `${o.prefabId}@x${o.x.toFixed(1)} r${o.radius.toFixed(1)} +${ahead.toFixed(1)}`,
        ),
      }
      let laneChange = 0
      let jump = false
      let slide = false
      const blockersAt = (x) =>
        hazards
          .filter(({ o }) => Math.abs(o.x - x) < o.radius + 0.75)
          .sort((a, b) => a.ahead - b.ahead)
      // Where the runner physically is (mid lane change on ice, say) counts too.
      const here = blockersAt(p.x)[0]
      const threatened = nearest[lane] < look || (here !== undefined && here.ahead < look)
      if (threatened) {
        // Head for the lane that stays clear longest, via clear lanes only.
        const score = (index) => Math.min(nearest[index], look + 10) - Math.abs(index - lane) * 1.5
        const target = LANES.map((_, index) => index).sort((a, b) => score(b) - score(a))[0]
        const step = Math.sign(target - lane)
        const passable = step !== 0 && nearest[lane + step] > speed * 0.35 + 1.5
        if (target !== lane && passable && score(target) > score(lane) + 1) {
          laneChange = step
          bot.laneSteps += 1
        }
        const blocker = here ?? blockersAt(LANES[lane])[0]
        if (laneChange === 0 && blocker && blocker.ahead < speed * 0.32 + blocker.o.radius) {
          if (blocker.o.prefabId === 'static-barrier-beam') slide = true
          else if (g.player.isGrounded) jump = true
        }
      }
      return original(delta, {
        ...input,
        laneChange: laneChange || input.laneChange,
        jump: jump || input.jump,
        slide: slide || input.slide,
      })
    }
  })

  const rows = []
  for (const number of islands) {
    const results = []
    for (let attempt = 0; attempt < tries; attempt += 1) {
      const meta = await page.evaluate(async (index) => {
        const g = window.__turkuaz
        const { LEVEL_CATALOG } = await import('/src/game/levels/LevelCatalog.ts')
        const level = LEVEL_CATALOG[index - 1]
        g.returnToMenu()
        g.levels.unlock(level.id)
        g.startRun(level)
        return { id: level.id, mechanic: level.mechanic ?? '', chase: level.chase === true }
      }, number)
      await page
        .waitForFunction(() => window.__turkuaz.state !== 'playing', null, { timeout: 240_000 })
        .catch(() => undefined)
      const outcome = await page.evaluate(() => {
        const g = window.__turkuaz
        const events = g.telemetry.recentEvents()
        const crash = events.toReversed().find((event) => event.name === 'crash')
        const result = {
          state: g.state,
          progress: Math.round(g.level.completion * 100),
          seconds: Math.round(g.runTime),
          cause: g.state === 'offer' ? (crash?.props.cause ?? '?') : '',
        }
        if (g.state === 'offer' && window.__BOT_DEBUG)
          console.log(JSON.stringify(window.__bot.last))
        g.returnToMenu()
        return result
      })
      results.push({ ...meta, ...outcome })
    }
    const finished = results.filter((r) => r.progress >= 100).length
    const average = Math.round(results.reduce((sum, r) => sum + r.progress, 0) / results.length)
    const causes = results.filter((r) => r.cause).map((r) => `${r.cause}@${r.progress}%`)
    const tag = [results[0].mechanic, results[0].chase ? 'chase' : ''].filter(Boolean).join('+')
    rows.push({ island: number, tag, finished: `${finished}/${tries}`, average, causes })
    console.log(
      `${String(number).padStart(2)} ${tag.padEnd(12)} finished ${finished}/${tries}` +
        `  avg ${String(average).padStart(3)}%  ${causes.join(', ')}`,
    )
  }
} finally {
  await browser.close()
  await server.close()
}
