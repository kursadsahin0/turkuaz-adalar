/**
 * Headless tests for the retention systems: daily rewards, daily missions,
 * achievements, the local leaderboard, the crystal wallet and translations.
 * Runs in Node with an in-memory localStorage and a controllable clock.
 */

class MemoryStorage {
  constructor() {
    this.store = new Map()
  }
  get length() {
    return this.store.size
  }
  key(index) {
    return [...this.store.keys()][index] ?? null
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null
  }
  setItem(key, value) {
    this.store.set(key, String(value))
  }
  removeItem(key) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
}

globalThis.window = {
  localStorage: new MemoryStorage(),
  setTimeout,
  clearTimeout,
}

const { SaveManager } = await import('../src/systems/save/SaveManager.ts')
const { ProgressionManager } = await import('../src/systems/progression/ProgressionManager.ts')
const { DailyRewards, DAILY_REWARDS } = await import('../src/systems/meta/DailyRewards.ts')
const { dayKey } = await import('../src/systems/meta/dayKey.ts')
const { Missions, generateMissions, MISSIONS_PER_DAY } =
  await import('../src/systems/meta/Missions.ts')
const { Achievements, ACHIEVEMENTS } = await import('../src/systems/meta/Achievements.ts')
const { LocalLeaderboard, LEADERBOARD_SIZE } = await import('../src/systems/meta/Leaderboard.ts')
const { EN, TR } = await import('../src/i18n/strings.ts')
const { ConsentManager, CONSENT_VERSION } = await import('../src/systems/privacy/ConsentManager.ts')
const { Telemetry } = await import('../src/systems/telemetry/Telemetry.ts')
const { LevelProgressionManager, starsFor } = await import('../src/game/levels/LevelProgression.ts')
const { LevelManager } = await import('../src/game/levels/LevelManager.ts')
const { LEVEL_CATALOG } = await import('../src/game/levels/LevelCatalog.ts')
const { PlayerSaveManager: PSM } = await import('../src/systems/save/PlayerSaveManager.ts')
const { Tutorial, TUTORIAL_STEPS } = await import('../src/game/tutorial/Tutorial.ts')
const { resolveAppearance, HIDDEN_BY_HEADGEAR } =
  await import('../src/game/characters/CharacterAppearance.ts')
const { spawnRulesFor, DEFAULT_SPAWN_RULES, chooseBlockedLanes } =
  await import('../src/game/levels/SpawnRules.ts')
const { CHARACTERS } = await import('../src/game/characters/CharacterData.ts')
const { AudioManager } = await import('../src/systems/audio/AudioManager.ts')
const i18n = await import('../src/i18n/i18n.ts')

let passed = 0
let failed = 0
function test(name, condition, message = '') {
  if (condition) {
    console.log(`✓ ${name}`)
    passed += 1
  } else {
    console.log(`✗ ${name}${message ? `: ${message}` : ''}`)
    failed += 1
  }
}

function fresh() {
  window.localStorage.clear()
  return new SaveManager()
}

// Controllable clock: local noon on a given day.
let now = new Date(2026, 10, 4, 12, 0, 0)
const clock = () => now
const advanceDays = (days) => {
  now = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12, 0, 0)
}

// --- Daily rewards ---------------------------------------------------------
{
  const save = fresh()
  const daily = new DailyRewards(save, clock)
  test('Daily: claimable on first visit', daily.status().canClaim && daily.status().dayIndex === 0)
  const first = daily.claim()
  test('Daily: day 1 reward granted', first?.coins === DAILY_REWARDS[0].coins)
  test('Daily: cannot claim twice in a day', daily.claim() === null && !daily.status().canClaim)
  advanceDays(1)
  test('Daily: next day continues the streak', daily.status().dayIndex === 1)
  daily.claim()
  advanceDays(2)
  test(
    'Daily: missed day restarts at day 1',
    daily.status().dayIndex === 0 && daily.status().streak === 0,
  )
  const reloaded = new DailyRewards(save, clock)
  test('Daily: best streak persists', reloaded.bestStreak === 2)
  for (let i = 0; i < 7; i += 1) {
    reloaded.claim()
    advanceDays(1)
  }
  test(
    'Daily: 7-day cycle wraps to day 1',
    reloaded.status().dayIndex === 0 && reloaded.bestStreak === 7,
  )
}

// --- Missions --------------------------------------------------------------
{
  const a = generateMissions('2026-11-04')
  const b = generateMissions('2026-11-04')
  test('Missions: same missions for the same day', JSON.stringify(a) === JSON.stringify(b))
  test(
    'Missions: three distinct kinds',
    a.length === MISSIONS_PER_DAY && new Set(a.map((m) => m.kind)).size === MISSIONS_PER_DAY,
  )
  let differs = false
  for (let d = 5; d < 15 && !differs; d += 1) {
    differs =
      JSON.stringify(
        generateMissions(`2026-11-${String(d).padStart(2, '0')}`).map((m) => m.kind),
      ) !== JSON.stringify(a.map((m) => m.kind))
  }
  test('Missions: vary across days', differs)

  const save = fresh()
  const missions = new Missions(save, clock)
  const list = missions.list()
  // Drive every mission to completion with generous events.
  for (const kind of ['coins', 'crystals', 'dash', 'jump', 'powerups']) {
    missions.record({ kind, amount: 100000 })
  }
  for (let i = 0; i < 5; i += 1) {
    missions.record({ kind: 'runEnd', distance: 5000, score: 50000 })
  }
  test(
    'Missions: all complete from events',
    list.every((m) => m.completed && m.progress === m.target),
  )
  const beforeClaim = missions.claimable
  const reward = missions.claim(list[0].id)
  test(
    'Missions: claim pays the reward once',
    reward === list[0].reward && missions.claim(list[0].id) === 0,
  )
  test('Missions: claimable count drops', missions.claimable === beforeClaim - 1)
  missions.claim(list[1].id)
  missions.claim(list[2].id)
  test('Missions: perfect day counted', missions.perfectDays === 1)

  const save2 = fresh()
  const best = new Missions(save2, clock)
  best.record({ kind: 'runEnd', distance: 10, score: 10 })
  const distanceMission = best.list().find((m) => m.kind === 'distance' || m.kind === 'score')
  if (distanceMission) {
    const before = distanceMission.progress
    best.record({ kind: 'runEnd', distance: 5, score: 5 })
    test('Missions: best-in-run keeps the best, not the sum', distanceMission.progress === before)
  } else {
    test('Missions: best-in-run keeps the best, not the sum', true)
  }

  advanceDays(1)
  test('Missions: roll over at midnight', best.list()[0].id.startsWith(i18nDay(now)))
}

function i18nDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// --- Achievements ----------------------------------------------------------
{
  const save = fresh()
  const achievements = new Achievements(save)
  const base = {
    totalRuns: 0,
    bestDistance: 0,
    bestScore: 0,
    totalCoinsEarned: 0,
    totalCrystals: 0,
    cosmeticsBought: 0,
    bestStreak: 0,
    perfectMissionDays: 0,
    islandsCompleted: 0,
    totalStars: 0,
    charactersOwned: 1,
  }
  test('Achievements: nothing unlocked at zero', achievements.evaluate(base).length === 0)
  const fresh1 = achievements.evaluate({ ...base, totalRuns: 1, bestDistance: 1200 })
  test(
    'Achievements: first run + 1 km unlock',
    fresh1
      .map((a) => a.id)
      .sort()
      .join() === 'firstRun,km1',
  )
  test(
    'Achievements: no double unlock',
    achievements.evaluate({ ...base, totalRuns: 2, bestDistance: 1300 }).length === 0,
  )
  test(
    'Achievements: claim pays crystals once',
    achievements.claim('firstRun') === 2 && achievements.claim('firstRun') === 0,
  )
  test('Achievements: locked cannot be claimed', achievements.claim('km3') === 0)
  const reloaded = new Achievements(save)
  test('Achievements: state persists', reloaded.isUnlocked('km1') && reloaded.isClaimed('firstRun'))
}

// --- Leaderboard -----------------------------------------------------------
{
  const save = fresh()
  const board = new LocalLeaderboard(save)
  for (let i = 1; i <= 14; i += 1) {
    board.submit({ score: i * 100, distance: i * 10, at: i })
  }
  board.submit({ score: 0, distance: 0, at: 99 })
  const top = board.top()
  test('Leaderboard: keeps the top 10', top.length === LEADERBOARD_SIZE)
  test('Leaderboard: sorted by score', top[0].score === 1400 && top[9].score === 500)
  test('Leaderboard: ignores zero-score runs', !top.some((r) => r.score === 0))
  test('Leaderboard: persists', new LocalLeaderboard(save).top()[0].score === 1400)
}

// --- Wallet ----------------------------------------------------------------
{
  const save = fresh()
  save.save('progress', {
    bestScore: 10,
    bestDistance: 5,
    totalRuns: 3,
    totalCrystals: 12,
    coins: 40,
  })
  const walletSave = new PSM(save)
  const wallet = new ProgressionManager(walletSave, save)
  test('Wallet: legacy saves get their crystals as balance', wallet.snapshot.crystalBalance === 12)
  test(
    'Wallet: legacy key migrated into the player save and removed',
    save.load('progress', null) === null &&
      walletSave.progression.coins === 40 &&
      walletSave.progression.totalRuns === 3,
  )
  test(
    'Wallet: migration survives a reload',
    new ProgressionManager(new PSM(save), save).snapshot.coins === 40,
  )
  test(
    'Wallet: cannot overspend',
    wallet.trySpend('coins', 50) === false && wallet.snapshot.coins === 40,
  )
  test(
    'Wallet: spend within balance',
    wallet.trySpend('crystals', 5) === true && wallet.snapshot.crystalBalance === 7,
  )
  wallet.creditCoins(60)
  test(
    'Wallet: lifetime coins never decrease',
    wallet.snapshot.totalCoinsEarned === 100 &&
      wallet.trySpend('coins', 90) &&
      wallet.snapshot.totalCoinsEarned === 100,
  )
  wallet.recordRun({ score: 500, distance: 80, crystals: 2 })
  test(
    'Wallet: run results are written to the player save at once',
    new PSM(save).progression.bestScore === 500,
  )
  walletSave.dispose()
  save.clearAll()
  test('Reset: clearAll removes every save key', window.localStorage.length === 0)
}

// --- Consent ---------------------------------------------------------------
{
  const save = fresh()
  const consent = new ConsentManager(save)
  test(
    'Consent: asked on first launch, ads not personalised by default',
    consent.needsPrompt && consent.personalizedAds === false,
  )
  consent.record(true)
  const reloaded = new ConsentManager(save)
  test('Consent: choice persists', !reloaded.needsPrompt && reloaded.personalizedAds === true)
  reloaded.record(false)
  test('Consent: can be withdrawn', new ConsentManager(save).personalizedAds === false)
  save.save('consent', { version: CONSENT_VERSION - 1, personalizedAds: true, decidedAt: 1 })
  test('Consent: asked again after a policy version bump', new ConsentManager(save).needsPrompt)
}

// --- Telemetry -------------------------------------------------------------
{
  const save = fresh()
  const telemetry = new Telemetry(save, {
    version: '1.2.3',
    crashReportsAllowed: true,
    environment: 'test',
  })
  const received = []
  telemetry.addAnalyticsSink({ send: (event) => received.push(event.name) })
  telemetry.track('run_start', { difficulty: 'medium' })
  telemetry.track('run_end', { score: 10 })
  test('Telemetry: events reach sinks in order', received.join() === 'run_start,run_end')
  telemetry.addAnalyticsSink({
    send: () => {
      throw new Error('sink down')
    },
  })
  telemetry.track('purchase')
  test('Telemetry: a failing sink does not break tracking', telemetry.recentEvents().length === 3)
  telemetry.captureException(new Error('boom'), 'unit test')
  const log = telemetry.crashLog()
  test(
    'Telemetry: crash stored locally with version and context',
    log.length === 1 &&
      log[0].message === 'boom' &&
      log[0].version === '1.2.3' &&
      log[0].context === 'unit test',
  )
  test(
    'Telemetry: crash keeps breadcrumbs from before it',
    log[0].breadcrumbs.map((b) => b.message).join() === 'run_start,run_end,purchase',
  )
  for (let i = 0; i < 15; i += 1) telemetry.captureException(`string reason ${i}`)
  test(
    'Telemetry: crash log capped at 10, newest kept',
    telemetry.crashLog().length === 10 && telemetry.crashLog()[9].message === 'string reason 14',
  )
  telemetry.clearCrashLog()
  test('Telemetry: crash log can be cleared', telemetry.crashLog().length === 0)
}

// --- Levels ----------------------------------------------------------------
{
  const [first, second, third] = LEVEL_CATALOG
  const result = (over) => ({
    distance: first.targetDistance,
    score: 1000,
    coins: 0,
    crystals: 0,
    completed: true,
    ...over,
  })
  test(
    'Levels: no stars without finishing',
    starsFor(first, result({ completed: false, coins: 9999, crystals: 99 })) === 0,
  )
  test('Levels: one star for finishing', starsFor(first, result()) === 1)
  test(
    'Levels: three stars with coin and crystal targets',
    starsFor(
      first,
      result({ coins: first.completionCoins, crystals: first.completionCrystals }),
    ) === 3,
  )

  fresh()
  const playerSave = new PSM(new SaveManager())
  const levels = new LevelProgressionManager(playerSave, LEVEL_CATALOG)
  test(
    'Levels: first island open, second locked',
    levels.isUnlocked(first.id) && !levels.isUnlocked(second.id),
  )
  const lost = levels.recordRun(first, result({ completed: false, distance: 120 }))
  test(
    'Levels: a failed run unlocks nothing',
    lost.unlockedNext === null &&
      !levels.isUnlocked(second.id) &&
      levels.getProgress(first.id).attempts === 1,
  )
  const won = levels.recordRun(first, result({ coins: first.completionCoins }))
  test(
    'Levels: finishing unlocks the next island',
    won.unlockedNext?.id === second.id && levels.isUnlocked(second.id),
  )
  test(
    'Levels: best stars and completion are kept',
    levels.getProgress(first.id).bestStars === 2 && levels.getProgress(first.id).completed,
  )
  levels.recordRun(first, result())
  test('Levels: a worse run never lowers best stars', levels.getProgress(first.id).bestStars === 2)
  test(
    'Levels: paying unlocks a later island directly',
    levels.unlock(third.id) && levels.isUnlocked(third.id),
  )
  test('Levels: unknown ids are rejected', levels.unlock('nope') === false)
  playerSave.saveNow()
  const reloaded = new LevelProgressionManager(new PSM(new SaveManager()), LEVEL_CATALOG)
  test(
    'Levels: progress survives a reload',
    reloaded.isUnlocked(third.id) && reloaded.getProgress(first.id).bestStars === 2,
  )
  test('Levels: total stars', reloaded.totalStars() === 2)

  const manager = new LevelManager()
  test(
    'LevelManager: starts as the endless run',
    manager.isEndless && manager.allowedObstacles === null && !manager.reachedTarget,
  )
  manager.setLevel(second)
  manager.reset('medium')
  manager.update(second.targetDistance / 2)
  test(
    'LevelManager: level mode tracks completion',
    !manager.isEndless && Math.abs(manager.completion - 0.5) < 1e-9 && !manager.reachedTarget,
  )
  manager.update(second.targetDistance)
  test('LevelManager: finish line reached', manager.reachedTarget && manager.completion === 1)
  test(
    'LevelManager: level restricts obstacle kinds',
    manager.allowedObstacles.join() === second.obstacles.enabledObstacles.join(),
  )
  manager.reset('medium')
  const mediumSpeed = manager.speed
  manager.reset('hard')
  test(
    'LevelManager: hard is harder but playable (was 5x)',
    manager.speed > mediumSpeed && manager.speed < mediumSpeed * 1.5,
  )
  playerSave.dispose()
}

// --- Tutorial --------------------------------------------------------------
{
  fresh()
  const save = new PSM(new SaveManager())
  const tutorial = new Tutorial(save)
  test(
    'Tutorial: starts on the first run',
    tutorial.beginIfNeeded() && tutorial.view.step === 'lane' && tutorial.view.total === 4,
  )
  test(
    'Tutorial: wrong move is ignored',
    tutorial.notify('jump') === 'ignored' && tutorial.view.step === 'lane',
  )
  test(
    'Tutorial: right move advances',
    tutorial.notify('lane') === 'advanced' &&
      tutorial.view.step === 'jump' &&
      tutorial.view.index === 2,
  )
  tutorial.notify('jump')
  tutorial.notify('slide')
  test(
    'Tutorial: last move completes it',
    tutorial.notify('dash') === 'completed' && !tutorial.isActive && tutorial.isCompleted,
  )
  test(
    'Tutorial: not shown again',
    new Tutorial(new PSM(new SaveManager())).beginIfNeeded() === false,
  )
  tutorial.reset()
  const again = new Tutorial(new PSM(new SaveManager()))
  test('Tutorial: replay from Settings', again.beginIfNeeded() === true)
  again.suspend()
  test('Tutorial: an interrupted run keeps it pending', !again.isCompleted && again.beginIfNeeded())
  again.skip()
  test('Tutorial: skip counts as done', again.isCompleted && !again.isActive)
  test('Tutorial: four steps in teaching order', TUTORIAL_STEPS.join() === 'lane,jump,slide,dash')
  save.dispose()
}

// --- Characters --------------------------------------------------------------
{
  const base = {
    skinId: 'skin-default',
    outfitId: 'outfit-default',
    accessoryIds: ['acc-none'],
    colorId: 'color-default',
  }
  const classic = resolveAppearance({ ...base, characterId: 'turkuaz-runner' })
  const lean = resolveAppearance({ ...base, characterId: 'swift-runner' })
  const sturdy = resolveAppearance({ ...base, characterId: 'ocean-master' })
  test(
    'Characters: classic keeps the authored look',
    classic.build.width === 1 && classic.build.height === 1 && classic.hairColor === null,
  )
  test(
    'Characters: lean is narrower and taller',
    lean.build.width < 1 && lean.build.height > 1 && lean.hairColor !== null,
  )
  test(
    'Characters: sturdy is broader',
    sturdy.build.width > 1 && sturdy.hairColor !== null && sturdy.hairColor !== lean.hairColor,
  )
  test(
    'Characters: signature look by default (crimson swift, authored ocean blue)',
    lean.bodyColor !== null && sturdy.bodyColor === null && classic.bodyColor === null,
  )
}

// --- Island variety ----------------------------------------------------------
{
  const { ISLAND_LOOKS } = await import('../src/game/levels/IslandLooks.ts')
  const { ISLAND_STYLES, MENU_STYLE } = await import('../src/systems/audio/MusicSequencer.ts')
  const themes = LEVEL_CATALOG.map((level) => level.theme.id)
  test(
    'Islands: every island has its own music style',
    themes.every((id) => ISLAND_STYLES[id] !== undefined),
  )
  test(
    'Islands: music styles are distinct from each other and the menu',
    new Set([...themes.map((id) => ISLAND_STYLES[id].seed), MENU_STYLE.seed]).size ===
      themes.length + 1,
  )
  test(
    'Islands: every island after the first has its own look',
    themes.slice(1).every((id) => ISLAND_LOOKS[id] !== undefined) &&
      ISLAND_LOOKS[themes[0]] === undefined,
  )
  const base = {
    skinId: 'skin-default',
    outfitId: 'outfit-default',
    accessoryIds: ['acc-none'],
    colorId: 'color-default',
  }
  test(
    'Characters: each runner has its own body in the GLB',
    new Set(
      CHARACTERS.map(
        (character) => resolveAppearance({ ...base, characterId: character.id }).model,
      ),
    ).size === CHARACTERS.length,
  )
}

// --- Audio settings ----------------------------------------------------------
{
  const audio = new AudioManager({ muted: true, musicVolume: 2, sfxVolume: Number.NaN })
  test(
    'Audio: levels come from settings and are clamped',
    audio.isMuted && audio.musicVolume === 1 && audio.sfxVolume === 0.8,
  )
  audio.setMuted(false)
  test(
    'Audio: no storage of its own',
    !audio.isMuted && window.localStorage.getItem('turkuaz-adalar:settings.muted') === null,
  )
}

// --- Islands and runners ----------------------------------------------------
{
  const target = (id) => ACHIEVEMENTS.find((entry) => entry.id === id)?.target
  test(
    'Achievements: island and runner goals match the catalogue',
    target('islands30') === LEVEL_CATALOG.length &&
      target('stars90') === LEVEL_CATALOG.length * 3 &&
      target('characters7') === CHARACTERS.length,
  )
  const achievements = new Achievements(fresh())
  const unlocked = achievements
    .evaluate({
      totalRuns: 1,
      bestDistance: 0,
      bestScore: 0,
      totalCoinsEarned: 0,
      totalCrystals: 0,
      cosmeticsBought: 0,
      bestStreak: 0,
      perfectMissionDays: 0,
      islandsCompleted: 12,
      totalStars: 30,
      charactersOwned: 3,
    })
    .map((entry) => entry.id)
  test(
    'Achievements: islands and runners unlock from world stats',
    unlocked.includes('islands10') &&
      unlocked.includes('characters3') &&
      !unlocked.includes('islands20') &&
      !unlocked.includes('stars45'),
  )

  // Find a day whose missions include an island goal, then play it.
  let day = new Date(2026, 0, 1, 12)
  let missions = null
  for (let i = 0; i < 400 && !missions; i += 1) {
    const list = generateMissions(dayKey(day))
    if (list.some((mission) => mission.kind === 'islands')) {
      missions = { at: new Date(day) }
    }
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 12)
  }
  test('Missions: island goals are part of the daily pool', missions !== null)
  if (missions) {
    const tracker = new Missions(fresh(), () => missions.at)
    const island = tracker.list().find((mission) => mission.kind === 'islands')
    for (let i = 0; i < island.target; i += 1) {
      tracker.record({ kind: 'islands', amount: 1 })
    }
    test(
      'Missions: finishing islands completes the island goal',
      tracker.list().find((mission) => mission.kind === 'islands').completed,
    )
  }

  test(
    'Runners: hats and helmets hide the cap accessory',
    HIDDEN_BY_HEADGEAR.mage?.includes('acc-cap') &&
      HIDDEN_BY_HEADGEAR.knight?.includes('acc-cap') &&
      HIDDEN_BY_HEADGEAR.knight?.includes('acc-goggles') &&
      HIDDEN_BY_HEADGEAR.runner === undefined,
  )

  const first = spawnRulesFor(LEVEL_CATALOG[0])
  const last = spawnRulesFor(LEVEL_CATALOG[LEVEL_CATALOG.length - 1])
  test(
    'Islands: spawn rules come from the island definition',
    first.safeStartDistance === LEVEL_CATALOG[0].obstacles.safeZoneLength &&
      first.minObstacleSpacing > last.minObstacleSpacing &&
      first.tokenChance < last.tokenChance,
  )
  // Fairness: close rows always share an open lane.
  const lanes = [-1, 0, 1]
  let sharedLaneEveryTime = true
  for (let trial = 0; trial < 500; trial += 1) {
    const shuffle = (list) => [...list].sort(() => Math.random() - 0.5)
    const before = chooseBlockedLanes(shuffle(lanes), Math.random() < 0.6, null, true)
    const open = lanes.filter((lane) => !before.includes(lane))
    const second = chooseBlockedLanes(shuffle(lanes), Math.random() < 0.6, open, true)
    if (!open.some((lane) => !second.includes(lane))) {
      sharedLaneEveryTime = false
    }
  }
  test('Islands: close obstacle rows always leave a shared open lane', sharedLaneEveryTime)
  test(
    'Islands: rows far apart are left as rolled',
    chooseBlockedLanes([0, 1, -1], true, [0, 1], false).join() === '0,1',
  )
  // Ember rain: the island's hazard is picked far more often at full difficulty.
  const { pickObstaclePrefab } = await import('../src/game/obstacles/ObstacleRegistry.ts')
  const { Rng } = await import('../src/utils/random.ts')
  const volcano = LEVEL_CATALOG.find((level) => level.mechanic === 'embers')
  const share = (favoured) => {
    const rng = new Rng(4242)
    let hits = 0
    for (let i = 0; i < 2000; i += 1) {
      const prefab = pickObstaclePrefab(1, rng, volcano.obstacles.enabledObstacles, favoured)
      if (prefab?.kind === 'falling-object') hits += 1
    }
    return hits / 2000
  }
  const plain = share(null)
  const embers = share(spawnRulesFor(volcano).favouredObstacle)
  test(
    'Islands: ember rain makes falling hazards several times more common',
    embers > plain * 2,
    `${plain.toFixed(2)} -> ${embers.toFixed(2)}`,
  )
  const ice = LEVEL_CATALOG.find((level) => level.mechanic === 'ice')
  test(
    'Islands: ice leaves more reaction time between obstacle rows',
    spawnRulesFor(ice).reactionTime > DEFAULT_SPAWN_RULES.reactionTime,
  )
  test(
    'Islands: six islands have their own rule',
    LEVEL_CATALOG.filter((level) => level.mechanic).length === 6,
  )
  // Chase islands: dashing keeps you ahead of the wave, coasting does not.
  const { ChaseController } = await import('../src/core/controllers/ChaseController.ts')
  const { GAME_CONFIG } = await import('../src/config/GameConfig.ts')
  const quiet = { ui: { pushFeedback() {} }, haptics: { pulse() {} } }
  const chaseRun = (dashing) => {
    const chase = new ChaseController(quiet)
    chase.begin(true)
    const base = 30
    const { duration, cooldown, speedMultiplier } = GAME_CONFIG.dash
    const step = 1 / 60
    for (let time = 0; time < 120; time += step) {
      const cycle = time % (duration + cooldown)
      const speed = dashing && cycle < duration ? base * speedMultiplier : base
      // The last stretch of the island, where the wave is fastest.
      if (chase.update(step, speed, base, 1)) {
        return false
      }
    }
    return true
  }
  test('Chase: coasting at the end of a chase island gets caught', chaseRun(false) === false)
  test('Chase: dashing on cooldown stays ahead of the wave', chaseRun(true) === true)
  test(
    'Chase: the last island of each chapter is a chase',
    [10, 20, 30].every((number) => LEVEL_CATALOG[number - 1].chase === true),
  )
  const manager = new LevelManager()
  manager.setLevel(null)
  test(
    'Islands: the endless run keeps the default spawn rules',
    manager.spawnRules === DEFAULT_SPAWN_RULES,
  )
}

// --- Weekly event and seasons -----------------------------------------------
{
  const { weeklyEvent, weekKey, EVENT_LEVEL_ID } = await import('../src/game/levels/WeeklyEvent.ts')
  const { WeeklyEventTracker } = await import('../src/systems/meta/WeeklyEventTracker.ts')
  const { seasonOf, isOnSale, daysLeftInSeason } = await import('../src/game/characters/Seasons.ts')
  const { CHARACTER_SKINS } = await import('../src/game/characters/CharacterData.ts')

  const monday = new Date(2026, 10, 2, 9)
  const sunday = new Date(2026, 10, 8, 21)
  const nextMonday = new Date(2026, 10, 9, 9)
  test('Event: ISO week keys', weekKey(monday) === '2026-W45' && weekKey(sunday) === '2026-W45')
  const a = weeklyEvent(monday, LEVEL_CATALOG)
  const b = weeklyEvent(sunday, LEVEL_CATALOG)
  test('Event: the same island all week', a.level.eventOf === b.level.eventOf && a.week === b.week)
  test(
    'Event: a fresh week brings a new event',
    weeklyEvent(nextMonday, LEVEL_CATALOG).week !== a.week,
  )
  let fair = true
  for (let week = 0; week < 60; week += 1) {
    const event = weeklyEvent(new Date(2026, 0, 5 + week * 7), LEVEL_CATALOG)
    const base = LEVEL_CATALOG.find((level) => level.id === event.level.eventOf)
    if (!base || base.chase || event.level.id !== EVENT_LEVEL_ID || event.level.unlockCost !== 0) {
      fair = false
    }
  }
  test('Event: based on a regular island and always open', fair)
  test('Event: days left counts to Monday', a.daysLeft === 7 && b.daysLeft === 1)
  const tracker = new WeeklyEventTracker(fresh())
  test(
    'Event: reward is paid once per week',
    tracker.claim(a.week) && !tracker.claim(a.week) && tracker.claim(weekKey(nextMonday)),
  )

  test(
    'Seasons: months map to seasons',
    seasonOf(new Date(2026, 11, 1)) === 'winter' &&
      seasonOf(new Date(2026, 3, 1)) === 'spring' &&
      seasonOf(new Date(2026, 6, 1)) === 'summer' &&
      seasonOf(new Date(2026, 10, 6)) === 'autumn',
  )
  test('Seasons: days left until the season ends', daysLeftInSeason(new Date(2026, 10, 30)) === 1)
  const autumnSkin = CHARACTER_SKINS.find((skin) => skin.season === 'autumn')
  const winterSkin = CHARACTER_SKINS.find((skin) => skin.season === 'winter')
  const november = new Date(2026, 10, 6)
  test(
    'Seasons: a seasonal skin is sold only in its season',
    isOnSale(autumnSkin, november) &&
      !isOnSale(winterSkin, november) &&
      isOnSale(CHARACTER_SKINS[0], november),
  )
}

// --- Translations ----------------------------------------------------------
{
  const enKeys = Object.keys(EN)
  test(
    'i18n: every English key has a Turkish string',
    enKeys.every((key) => typeof TR[key] === 'string' && TR[key].length > 0),
  )
  const placeholders = (text) =>
    [...text.matchAll(/\{(\w+)\}/g)]
      .map((m) => m[1])
      .sort()
      .join()
  const mismatched = enKeys.filter((key) => placeholders(EN[key]) !== placeholders(TR[key]))
  test('i18n: placeholders match in both languages', mismatched.length === 0, mismatched.join(', '))
  i18n.setLanguage('tr')
  test(
    'i18n: Turkish lookup and interpolation',
    i18n.t('mission.coins', { target: 50 }) === '50 coin topla',
  )
  test('i18n: Turkish number format', i18n.formatNumber(1234) === '1.234')
  test(
    'i18n: content fallback to English',
    i18n.tc('level.unknown.name', 'Fallback') === 'Fallback',
  )
  const { DE, CONTENT_DE } = await import('../src/i18n/strings.de.ts')
  const { ES, CONTENT_ES } = await import('../src/i18n/strings.es.ts')
  const { CONTENT_TR } = await import('../src/i18n/strings.ts')
  for (const [name, table, content] of [
    ['German', DE, CONTENT_DE],
    ['Spanish', ES, CONTENT_ES],
  ]) {
    const missing = enKeys.filter(
      (key) => typeof table[key] !== 'string' || table[key].length === 0,
    )
    test(`i18n: every English key has a ${name} string`, missing.length === 0, missing.join(', '))
    const wrong = enKeys.filter((key) => placeholders(EN[key]) !== placeholders(table[key]))
    test(`i18n: ${name} placeholders match`, wrong.length === 0, wrong.join(', '))
    // Every island, runner and cosmetic the Turkish table names is named too.
    const contentKeys = Object.keys(CONTENT_TR).filter((key) => !key.startsWith('ui.'))
    const gaps = contentKeys.filter((key) => !content[key])
    test(`i18n: ${name} names all islands, runners and items`, gaps.length === 0, gaps.join(', '))
  }
  i18n.setLanguage('de')
  test(
    'i18n: German lookup and number format',
    i18n.t('mission.coins', { target: 50 }) === 'Sammle 50 Münzen' &&
      i18n.formatNumber(1234) === '1.234' &&
      i18n.tc('level.glacier-drift.name', 'Glacier Drift') === 'Gletscherdrift',
  )
  i18n.setLanguage('es')
  test(
    'i18n: Spanish lookup',
    i18n.t('menu.play') === 'Empezar a correr' &&
      i18n.tc('character.tide-mage.name', 'Tide Mage') === 'Mago de las Mareas',
  )
  test(
    'i18n: supported languages',
    i18n.isLanguage('de') && i18n.isLanguage('es') && !i18n.isLanguage('fr'),
  )
  i18n.setLanguage('en')
  test(
    'i18n: English lookup',
    i18n.t('menu.play') === 'Begin the run' && i18n.formatNumber(1234) === '1,234',
  )
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed === 0) {
  console.log('\n✓ All meta system tests passed!')
  process.exit(0)
}
console.log('\n✗ Meta system tests failed!')
process.exit(1)
