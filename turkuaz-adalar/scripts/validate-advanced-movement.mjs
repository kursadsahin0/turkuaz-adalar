#!/usr/bin/env node
/**
 * Advanced movement validation for Task 08.
 *
 * Exercises the real TypeScript modules through Vite SSR:
 *  - InputManager: held-jump tracking, keyboard/pointer slide intent, reset.
 *  - MovementEffects: data-driven multipliers, stacking, expiry, invulnerability.
 *  - RunRecovery: checkpoint tracking, fall threshold, cooldown and respawn offset.
 *  - Player + Rapier: variable jump cut, effect multipliers, slide capsule state,
 *    headroom, slide speed reward and cooldown.
 *  - Beam obstacle: standing collision versus sliding clearance.
 *  - Bounce/speed pads: collider lookup, proximity triggers, cooldown, launch height.
 *  - Moving platform: kinematic motion, queried velocity and rider tracking.
 *  - Checkpoints and deterministic interaction population.
 *
 * Usage: npm run validate:advanced
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { createServer } from 'vite'

globalThis.self = globalThis

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(HERE, '..')

let passed = 0
let failed = 0
const failures = []

function report(ok, name, detail) {
  const suffix = detail ? ` — ${detail}` : ''
  if (ok) {
    passed += 1
    console.log(`  [PASS] ${name}${suffix}`)
  } else {
    failed += 1
    failures.push(`${name}${suffix}`)
    console.log(`  [FAIL] ${name}${suffix}`)
  }
}

function check(name, fn, detail) {
  try {
    const result = fn()
    report(result !== false, name, detail)
    return result
  } catch (error) {
    report(false, name, `${detail ? `${detail}; ` : ''}${error.message}`)
    return false
  }
}

function approx(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance
}

/** Minimal EventTarget for running InputManager without a browser. */
class FakeTarget {
  constructor() {
    this.listeners = new Map()
  }

  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }

  removeEventListener(type, listener) {
    const list = this.listeners.get(type) ?? []
    this.listeners.set(
      type,
      list.filter((entry) => entry !== listener),
    )
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

function keyboardEvent(code, repeat = false) {
  return {
    code,
    repeat,
    defaultPrevented: false,
    preventDefault() {},
  }
}

function pointerEvent(pointerId, x, y, extra = {}) {
  return {
    pointerId,
    isPrimary: true,
    pointerType: 'touch',
    button: 0,
    clientX: x,
    clientY: y,
    preventDefault() {},
    ...extra,
  }
}

function makeCanvas() {
  const canvas = new FakeTarget()
  canvas.captured = new Set()
  canvas.setPointerCapture = (pointerId) => canvas.captured.add(pointerId)
  canvas.hasPointerCapture = (pointerId) => canvas.captured.has(pointerId)
  canvas.releasePointerCapture = (pointerId) => canvas.captured.delete(pointerId)
  return canvas
}

const server = await createServer({
  root: PROJECT_ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const { GAME_CONFIG } = await server.ssrLoadModule('/src/config/GameConfig.ts')
  const { InputManager } = await server.ssrLoadModule('/src/systems/input/InputManager.ts')
  const { PhysicsWorld } = await server.ssrLoadModule(
    '/src/systems/physics/PhysicsWorld.ts',
  )
  const { Player } = await server.ssrLoadModule('/src/game/player/Player.ts')
  const { MovementEffects } = await server.ssrLoadModule(
    '/src/game/player/MovementEffects.ts',
  )
  const { RunRecovery } = await server.ssrLoadModule(
    '/src/game/player/RunRecovery.ts',
  )
  const { InteractionManager } = await server.ssrLoadModule(
    '/src/game/interactions/InteractionManager.ts',
  )
  const { ObstacleAssets } = await server.ssrLoadModule(
    '/src/game/obstacles/ObstacleAssets.ts',
  )
  const { Rng } = await server.ssrLoadModule('/src/utils/random.ts')

  const playerConfig = GAME_CONFIG.player
  const track = GAME_CONFIG.track
  const slide = playerConfig.slide
  const DT = 1 / 60
  const RADIUS = playerConfig.radius
  const HALF = playerConfig.halfHeight
  const SPAWN_Y = track.topY + HALF + RADIUS + 0.03

  console.log('\nAdvanced movement validation\n')

  // ------------------------------------------------------------------ input
  console.log('Input layer')

  const fakeWindow = new FakeTarget()
  fakeWindow.innerWidth = 390
  globalThis.window = fakeWindow
  const canvas = makeCanvas()
  const input = new InputManager(canvas, {
    onPause: () => {},
    onToggleMute: () => {},
  })
  const keyDown = (code, repeat = false) =>
    fakeWindow.emit('keydown', keyboardEvent(code, repeat))
  const keyUp = (code) => fakeWindow.emit('keyup', keyboardEvent(code))
  const pointerDown = (id, x, y) => canvas.emit('pointerdown', pointerEvent(id, x, y))
  const pointerMove = (id, x, y) => canvas.emit('pointermove', pointerEvent(id, x, y))
  const pointerUp = (id, x, y) => canvas.emit('pointerup', pointerEvent(id, x, y))

  check(
    'input.keyboard_slide',
    () => {
      keyDown('KeyS')
      return input.consumeSlide() === true && input.consumeSlide() === false
    },
    'S queues exactly one slide',
  )
  check(
    'input.arrow_down_slide',
    () => {
      keyDown('ArrowDown')
      return input.consumeSlide() === true
    },
  )
  check(
    'input.slide_repeat_ignored',
    () => {
      keyDown('KeyS', false)
      keyDown('KeyS', true)
      input.consumeSlide()
      return input.consumeSlide() === false
    },
  )
  check(
    'input.swipe_down_slides',
    () => {
      pointerDown(1, 200, 400)
      pointerMove(1, 203, 500)
      pointerUp(1, 203, 500)
      return (
        input.consumeSlide() === true &&
        input.consumeDash() === false &&
        input.consumeLaneChange() === 0
      )
    },
    'swipe down no longer dashes',
  )
  check(
    'input.hud_slide_queue',
    () => {
      input.queueSlide()
      return input.consumeSlide() === true
    },
  )
  check(
    'input.jump_hold_key',
    () => {
      keyDown('Space')
      const held = input.isJumpHeld()
      input.consumeJump()
      keyUp('Space')
      return held === true && input.isJumpHeld() === false
    },
    'jump hold tracks key down/up',
  )
  check(
    'input.jump_hold_pointer',
    () => {
      pointerDown(2, 200, 500)
      const held = input.isJumpHeld()
      pointerUp(2, 200, 500)
      input.consumeJump()
      return held === true && input.isJumpHeld() === false
    },
    'pointer hold counts as held jump',
  )
  check(
    'input.reset_clears_slide',
    () => {
      input.queueSlide()
      input.queueJump()
      input.reset()
      return (
        input.consumeSlide() === false &&
        input.consumeJump() === false &&
        input.isJumpHeld() === false
      )
    },
  )
  input.dispose()

  // ---------------------------------------------------------------- effects
  console.log('\nMovement effects')

  const effects = new MovementEffects()
  check(
    'effects.apply_surge',
    () =>
      effects.apply('surge') === true &&
      approx(effects.speedMultiplier, GAME_CONFIG.effects.surge.speedMultiplier, 1e-9) &&
      approx(effects.laneControl, GAME_CONFIG.effects.surge.laneControl, 1e-9) &&
      effects.isActive('surge') &&
      effects.invulnerable === false,
    `speed ×${effects.speedMultiplier.toFixed(2)}`,
  )
  check(
    'effects.primary_reports_label',
    () => effects.primary?.label === GAME_CONFIG.effects.surge.label,
  )
  effects.update(GAME_CONFIG.effects.surge.duration + 0.01)
  check(
    'effects.expire',
    () =>
      !effects.isActive('surge') &&
      effects.primary === null &&
      effects.speedMultiplier === 1 &&
      effects.laneControl === 1,
  )

  check(
    'effects.stack_multipliers',
    () => {
      effects.apply('surge')
      effects.apply('recovery')
      return (
        approx(effects.speedMultiplier, GAME_CONFIG.effects.surge.speedMultiplier, 1e-9) &&
        approx(effects.gravityScale, 1, 1e-9) &&
        approx(effects.jumpScale, 1, 1e-9) &&
        effects.invulnerable === true &&
        effects.active.length === 2
      )
    },
    'recovery adds invulnerability without changing movement',
  )
  check(
    'effects.reapply_refreshes_timer',
    () => {
      effects.update(3)
      const before = effects.active.find((entry) => entry.kind === 'surge')?.remaining ?? 0
      effects.apply('surge')
      const after = effects.active.find((entry) => entry.kind === 'surge')?.remaining ?? 0
      return before < 2 && approx(after, GAME_CONFIG.effects.surge.duration, 1e-9)
    },
  )
  check('effects.unknown_rejected', () => effects.apply('unknown') === false)
  effects.reset()
  check(
    'effects.reset_clears',
    () => effects.active.length === 0 && effects.speedMultiplier === 1,
  )

  // --------------------------------------------------------------- recovery
  console.log('\nFall recovery')

  const recovery = new RunRecovery()
  check(
    'recovery.no_checkpoint',
    () =>
      recovery.shouldRecover(-50) === false &&
      recovery.recover() === null &&
      recovery.lastCheckpoint === null,
  )
  recovery.setCheckpoint({ x: 1.5, y: 2.81, z: -50 })
  check(
    'recovery.threshold',
    () =>
      recovery.shouldRecover(playerConfig.fall.recoverBelowY + 0.2) === false &&
      recovery.shouldRecover(playerConfig.fall.recoverBelowY - 0.2) === true,
    `below ${playerConfig.fall.recoverBelowY} m`,
  )
  const respawn = recovery.recover()
  check(
    'recovery.respawn_behind_checkpoint',
    () =>
      respawn !== null &&
      approx(respawn.x, 1.5, 1e-9) &&
      approx(respawn.y, 2.81, 1e-9) &&
      approx(respawn.z, -50 + playerConfig.fall.respawnOffsetZ, 1e-9) &&
      recovery.recoveryCount === 1,
    `z ${respawn?.z.toFixed(2)}`,
  )
  check(
    'recovery.cooldown_blocks_second',
    () =>
      recovery.coolingDown === true &&
      recovery.shouldRecover(-50) === false &&
      recovery.recover() === null,
  )
  recovery.update(playerConfig.fall.cooldown + 0.01)
  check(
    'recovery.ready_after_cooldown',
    () => recovery.coolingDown === false && recovery.recover() !== null,
  )
  recovery.reset()
  check(
    'recovery.reset',
    () =>
      recovery.lastCheckpoint === null &&
      recovery.recoveryCount === 0 &&
      recovery.shouldRecover(-50) === false,
  )

  // ---------------------------------------------------------------- config
  console.log('\nConfig integrity')

  check(
    'config.jump_cut',
    () =>
      playerConfig.jumpCut.enabled === true &&
      playerConfig.jumpCut.graceTime > 0 &&
      playerConfig.jumpCut.velocityMultiplier > 0 &&
      playerConfig.jumpCut.velocityMultiplier < 1 &&
      playerConfig.jumpCut.minimumHeight > 0 &&
      playerConfig.jumpCut.minimumHeight < playerConfig.jumpHeight,
  )
  check(
    'config.slide',
    () =>
      slide.duration > 0 &&
      slide.maxDuration > slide.duration &&
      slide.cooldown > 0 &&
      slide.groundGrace > 0 &&
      slide.groundGrace < slide.duration &&
      slide.halfHeight > 0 &&
      slide.halfHeight < HALF &&
      slide.speedMultiplier > 1 &&
      slide.laneControl > 0 &&
      slide.laneControl < 1 &&
      slide.visualScaleY < 1,
  )
  check(
    'config.visual_feedback',
    () =>
      playerConfig.visual.stretchY > 1 &&
      playerConfig.visual.squashY < 1 &&
      playerConfig.visual.squashDuration > 0 &&
      playerConfig.visual.damping > 0,
  )
  check(
    'config.fall',
    () =>
      playerConfig.fall.recoverBelowY > playerConfig.killY &&
      playerConfig.fall.respawnOffsetZ > 0 &&
      playerConfig.fall.cooldown > 0 &&
      playerConfig.fall.invulnerability > 0,
  )
  check(
    'config.interactions',
    () =>
      GAME_CONFIG.interactions.padCooldown > 0 &&
      GAME_CONFIG.interactions.padTriggerHeight > 0 &&
      GAME_CONFIG.interactions.bouncePad.height > playerConfig.jumpHeight &&
      GAME_CONFIG.interactions.speedPad.effect === 'surge' &&
      GAME_CONFIG.interactions.movingPlatform.amplitude > 0 &&
      GAME_CONFIG.interactions.movingPlatform.period > 0 &&
      GAME_CONFIG.interactions.checkpoint.everySegments >= 1 &&
      GAME_CONFIG.interactions.checkpoint.minDistance >= 0,
  )
  check(
    'config.effects',
    () =>
      GAME_CONFIG.effects.surge.duration > 0 &&
      GAME_CONFIG.effects.surge.speedMultiplier > 1 &&
      GAME_CONFIG.effects.recovery.invulnerable === true,
  )

  // ------------------------------------------------------------ player rigs
  const beamAssets = new ObstacleAssets()

  const spawnPoint = () => new THREE.Vector3(0, SPAWN_Y, playerConfig.startZ)

  const createRig = async ({ beam = false } = {}) => {
    const physics = await PhysicsWorld.create()
    physics.addStaticBox(
      { x: 0, y: track.topY - 1, z: -150 },
      { x: 10, y: 1, z: 160 },
    )
    let beamHandle = null
    if (beam) {
      const visual = beamAssets.create('beam')
      const body = physics.addStaticBox(
        {
          x: 0,
          y: track.topY + visual.collider.centerY,
          z: -6,
        },
        {
          x: visual.collider.halfWidth,
          y: visual.collider.halfHeight,
          z: visual.collider.halfDepth,
        },
      )
      beamHandle = body.collider.handle
    }
    const scene = new THREE.Scene()
    const player = new Player(scene, physics)
    player.reset(spawnPoint())
    return { physics, scene, player, beamHandle, manager: null }
  }

  const stepPlayer = (rig, options = {}) => {
    if (rig.manager) {
      rig.manager.fixedUpdate(DT)
    }
    rig.player.fixedUpdate(DT, {
      laneChange: options.laneChange ?? 0,
      jump: options.jump ?? false,
      jumpHeld: options.jumpHeld,
      slide: options.slide ?? false,
      forwardSpeed: options.forwardSpeed ?? 0,
      gravityScale: options.gravityScale,
      jumpScale: options.jumpScale,
      laneControl: options.laneControl,
    })
    rig.physics.step(DT)
    rig.player.syncTransform()
  }

  const settle = (rig, steps = 90, speed = 0) => {
    for (let index = 0; index < steps; index += 1) {
      stepPlayer(rig, { forwardSpeed: speed })
    }
  }

  const disposeRig = (rig) => {
    rig.player.dispose()
    rig.physics.dispose()
  }

  const measureJump = async ({ hold = 2, jumpScale = 1, gravityScale = 1 } = {}) => {
    const rig = await createRig()
    settle(rig)
    const rest = rig.player.position.y
    let peak = rest
    let airborne = false
    let landCount = 0
    rig.player.onLand = () => {
      landCount += 1
    }

    stepPlayer(rig, {
      jump: true,
      jumpHeld: hold > 0,
      forwardSpeed: 0,
      jumpScale,
      gravityScale,
    })
    let elapsed = 0
    for (let index = 0; index < 240; index += 1) {
      elapsed += DT
      stepPlayer(rig, {
        jumpHeld: elapsed < hold,
        forwardSpeed: 0,
        jumpScale,
        gravityScale,
      })
      peak = Math.max(peak, rig.player.position.y)
      if (!rig.player.isGrounded) {
        airborne = true
      } else if (airborne) {
        break
      }
    }

    const result = {
      rise: peak - rest,
      landCount,
      grounded: rig.player.isGrounded,
    }
    disposeRig(rig)
    return result
  }

  // ------------------------------------------------------------------ jump
  console.log('\nVariable jump + effect multipliers')

  const fullJump = await measureJump({ hold: 2 })
  check(
    'jump.full_height',
    () =>
      approx(fullJump.rise, playerConfig.jumpHeight, 0.22) &&
      fullJump.landCount === 1 &&
      fullJump.grounded,
    `${fullJump.rise.toFixed(2)} m`,
  )

  const tapJump = await measureJump({ hold: 0 })
  check(
    'jump.tap_is_short',
    () =>
      tapJump.rise < fullJump.rise - 0.25 &&
      tapJump.rise > 0.9 &&
      tapJump.landCount === 1,
    `${tapJump.rise.toFixed(2)} m vs ${fullJump.rise.toFixed(2)} m`,
  )
  check(
    'jump.tap_clears_crate',
    () => tapJump.rise > 1.15,
    `rise ${tapJump.rise.toFixed(2)} m > crate height 1.15 m`,
  )

  const boostedJump = await measureJump({ hold: 2, jumpScale: 1.2 })
  check(
    'jump.effect_jump_scale',
    () => boostedJump.rise > fullJump.rise + 0.4,
    `${boostedJump.rise.toFixed(2)} m with jumpScale 1.2`,
  )
  const heavyJump = await measureJump({ hold: 2, gravityScale: 1.5 })
  check(
    'jump.effect_gravity_scale',
    () => heavyJump.rise < fullJump.rise - 0.25,
    `${heavyJump.rise.toFixed(2)} m with gravityScale 1.5`,
  )

  // ----------------------------------------------------------------- slide
  console.log('\nSlide')

  const slideRig = await createRig()
  settle(slideRig)
  const restBottom =
    slideRig.player.position.y - HALF - RADIUS
  stepPlayer(slideRig, { slide: true, forwardSpeed: 0 })
  check(
    'slide.starts_grounded',
    () =>
      slideRig.player.isSliding === true &&
      approx(slideRig.player.capsuleHalfHeight, slide.halfHeight, 1e-9),
    `capsule half-height ${slideRig.player.capsuleHalfHeight.toFixed(2)}`,
  )
  check(
    'slide.feet_stay_planted',
    () => {
      const slidingBottom =
        slideRig.player.position.y - slideRig.player.capsuleHalfHeight - RADIUS
      return approx(slidingBottom, restBottom, 0.08)
    },
    `feet ${restBottom.toFixed(2)} → ${(
      slideRig.player.position.y -
      slideRig.player.capsuleHalfHeight -
      RADIUS
    ).toFixed(2)}`,
  )

  for (let index = 0; index < 50; index += 1) {
    stepPlayer(slideRig, { forwardSpeed: 0 })
  }
  check(
    'slide.auto_ends',
    () =>
      slideRig.player.isSliding === false &&
      approx(slideRig.player.capsuleHalfHeight, HALF, 1e-9) &&
      slideRig.player.slideCooldownRemaining > 0,
    `${slideRig.player.slideCooldownRemaining.toFixed(2)} s cooldown`,
  )
  stepPlayer(slideRig, { slide: true, forwardSpeed: 0 })
  check('slide.cooldown_blocks_restart', () => slideRig.player.isSliding === false)
  for (let index = 0; index < 30; index += 1) {
    stepPlayer(slideRig, { forwardSpeed: 0 })
  }
  stepPlayer(slideRig, { slide: true, forwardSpeed: 0 })
  check(
    'slide.available_after_cooldown',
    () => slideRig.player.isSliding === true,
  )
  disposeRig(slideRig)

  const slideSpeedRig = await createRig()
  const baseSpeedRig = await createRig()
  settle(slideSpeedRig)
  settle(baseSpeedRig)
  const slideStartZ = slideSpeedRig.player.position.z
  const baseStartZ = baseSpeedRig.player.position.z
  stepPlayer(slideSpeedRig, { slide: true, forwardSpeed: 9.5 })
  for (let index = 0; index < 29; index += 1) {
    stepPlayer(slideSpeedRig, { forwardSpeed: 9.5 })
    stepPlayer(baseSpeedRig, { forwardSpeed: 9.5 })
  }
  const slideDistance = slideStartZ - slideSpeedRig.player.position.z
  const baseDistance = baseStartZ - baseSpeedRig.player.position.z
  check(
    'slide.speed_reward',
    () => slideDistance > baseDistance * 1.05,
    `${slideDistance.toFixed(2)} m vs ${baseDistance.toFixed(2)} m`,
  )
  disposeRig(slideSpeedRig)
  disposeRig(baseSpeedRig)

  // ------------------------------------------------------------------ beam
  console.log('\nBeam obstacle')

  const beamVisual = beamAssets.create('beam')
  const beamBottom = track.topY + beamVisual.collider.centerY - beamVisual.collider.halfHeight
  const standingTop = SPAWN_Y + HALF + RADIUS
  const slidingTop = track.topY + 0.03 + 2 * (slide.halfHeight + RADIUS)
  check(
    'beam.collider_geometry',
    () => approx(beamBottom, track.topY + 1.1, 1e-9),
    `bar bottom ${beamBottom.toFixed(2)}`,
  )
  check(
    'beam.standing_cannot_fit',
    () => standingTop > beamBottom,
    `standing top ${standingTop.toFixed(2)} > ${beamBottom.toFixed(2)}`,
  )
  check(
    'beam.sliding_fits',
    () => slidingTop < beamBottom,
    `sliding top ${slidingTop.toFixed(2)} < ${beamBottom.toFixed(2)}`,
  )

  const standingBeamRig = await createRig({ beam: true })
  settle(standingBeamRig)
  const standingBeamHits = new Set()
  standingBeamRig.player.onCollision = (handle) => standingBeamHits.add(handle)
  for (let index = 0; index < 180; index += 1) {
    stepPlayer(standingBeamRig, { forwardSpeed: 9.5 })
  }
  check(
    'beam.blocks_standing_run',
    () =>
      standingBeamRig.beamHandle !== null &&
      standingBeamHits.has(standingBeamRig.beamHandle) &&
      standingBeamRig.player.position.z > -6,
    `z ${standingBeamRig.player.position.z.toFixed(2)}`,
  )
  disposeRig(standingBeamRig)

  const slidingBeamRig = await createRig({ beam: true })
  settle(slidingBeamRig)
  const slidingBeamHits = new Set()
  slidingBeamRig.player.onCollision = (handle) => slidingBeamHits.add(handle)
  let slideStarted = false
  for (let index = 0; index < 240; index += 1) {
    const start = !slideStarted && slidingBeamRig.player.position.z <= -2.5
    if (start) {
      slideStarted = true
    }
    stepPlayer(slidingBeamRig, { slide: start, forwardSpeed: 9.5 })
  }
  check(
    'beam.slide_passes_under',
    () =>
      slideStarted &&
      (slidingBeamRig.beamHandle === null ||
        !slidingBeamHits.has(slidingBeamRig.beamHandle)) &&
      slidingBeamRig.player.position.z < -6.5,
    `z ${slidingBeamRig.player.position.z.toFixed(2)}, beam contacts ${
      slidingBeamRig.beamHandle !== null &&
      slidingBeamHits.has(slidingBeamRig.beamHandle)
        ? 'yes'
        : 'none'
    }`,
  )
  disposeRig(slidingBeamRig)

  // ------------------------------------------------------------------ pads
  console.log('\nBounce and speed pads')

  const padRig = await createRig()
  settle(padRig)
  const padManager = new InteractionManager(padRig.scene, padRig.physics)
  padRig.manager = padManager
  const bouncePad = padManager.spawnBounce(0, 0, -6)
  const bounceTop = track.topY + GAME_CONFIG.interactions.bouncePad.thickness
  check(
    'pads.bounce_spawn',
    () =>
      padManager.findBounce(bouncePad.collider.handle) === bouncePad &&
      approx(bouncePad.topY, bounceTop, 1e-9) &&
      bouncePad.height === GAME_CONFIG.interactions.bouncePad.height,
    `top ${bouncePad.topY.toFixed(2)}`,
  )
  check(
    'pads.bounce_cooldown',
    () => {
      const first = padManager.consumeBounce(bouncePad.collider.handle)
      const second = padManager.consumeBounce(bouncePad.collider.handle)
      padManager.fixedUpdate(GAME_CONFIG.interactions.padCooldown * 0.5)
      const stillCooling = padManager.consumeBounce(bouncePad.collider.handle)
      padManager.fixedUpdate(GAME_CONFIG.interactions.padCooldown * 0.6)
      const ready = padManager.consumeBounce(bouncePad.collider.handle)
      return first === bouncePad && second === null && stillCooling === null && ready === bouncePad
    },
  )
  check(
    'pads.proximity_miss',
    () => {
      padManager.fixedUpdate(GAME_CONFIG.interactions.padCooldown)
      const far = padManager.triggerPads(
        { x: bouncePad.x + 5, y: bounceTop + 0.5, z: bouncePad.z },
        RADIUS,
      )
      const high = padManager.triggerPads(
        {
          x: bouncePad.x,
          y: bounceTop + GAME_CONFIG.interactions.padTriggerHeight + 0.5,
          z: bouncePad.z,
        },
        RADIUS,
      )
      return far.bounce === null && high.bounce === null
    },
  )
  check(
    'pads.proximity_hit',
    () => {
      padManager.fixedUpdate(GAME_CONFIG.interactions.padCooldown)
      const trigger = padManager.triggerPads(
        { x: bouncePad.x, y: bounceTop + 0.5, z: bouncePad.z },
        RADIUS,
      )
      return trigger.bounce === bouncePad
    },
  )

  padManager.fixedUpdate(GAME_CONFIG.interactions.padCooldown)
  const speedPad = padManager.spawnSpeed(0, 0, -14)
  const speedTrigger = padManager.triggerPads(
    { x: speedPad.x, y: speedPad.topY + 0.5, z: speedPad.z },
    RADIUS,
  )
  check(
    'pads.speed_spawn_and_trigger',
    () =>
      speedTrigger.speed === speedPad &&
      speedPad.effect === GAME_CONFIG.interactions.speedPad.effect,
  )

  padManager.clearSegment(0)
  check(
    'pads.clear_segment',
    () =>
      padManager.findBounce(bouncePad.collider.handle) === undefined &&
      padManager.findSpeed(speedPad.collider.handle) === undefined,
  )

  // A live run over a bounce pad: the proximity trigger must launch the runner.
  const bouncePad2 = padManager.spawnBounce(0, 0, -6)
  let bounceEvents = 0
  let bouncePeak = padRig.player.position.y
  let firstBounceZ = null
  padRig.player.onBounce = () => {
    bounceEvents += 1
  }
  for (let index = 0; index < 240; index += 1) {
    stepPlayer(padRig, { forwardSpeed: 9.5 })
    const trigger = padManager.triggerPads(padRig.player.position, RADIUS)
    if (trigger.bounce) {
      if (firstBounceZ === null) {
        firstBounceZ = padRig.player.position.z
      }
      padRig.player.bounce(trigger.bounce.height)
    }
    bouncePeak = Math.max(bouncePeak, padRig.player.position.y)
  }
  const bounceRise = bouncePeak - SPAWN_Y
  check(
    'pads.bounce_launches',
    () =>
      bounceEvents >= 1 &&
      firstBounceZ !== null &&
      firstBounceZ > bouncePad2.z &&
      bounceRise > 2.5,
    `${bounceEvents} launch(es), peak rise ${bounceRise.toFixed(2)} m`,
  )
  padManager.dispose()
  disposeRig(padRig)

  // ------------------------------------------------------- moving platform
  console.log('\nMoving platform')

  const platformRig = await createRig()
  settle(platformRig)
  const platformManager = new InteractionManager(
    platformRig.scene,
    platformRig.physics,
  )
  platformRig.manager = platformManager
  const platformConfig = GAME_CONFIG.interactions.movingPlatform
  const platform = platformManager.spawnPlatform(0, 0, -4, new Rng(4242))
  platformRig.player.platformMotionProvider = (handle) =>
    platformManager.platformVelocity(handle)

  let minTop = Number.POSITIVE_INFINITY
  let maxTop = Number.NEGATIVE_INFINITY
  let maxVerticalSpeed = 0
  for (let index = 0; index < 240; index += 1) {
    platformManager.fixedUpdate(DT)
    platformRig.physics.step(DT)
    const top = platform.centerY + platformConfig.thickness / 2
    minTop = Math.min(minTop, top)
    maxTop = Math.max(maxTop, top)
    maxVerticalSpeed = Math.max(maxVerticalSpeed, Math.abs(platform.velocity.y))
  }
  check(
    'platform.oscillates',
    () =>
      approx(minTop, track.topY + platformConfig.baseLift, 0.02) &&
      approx(
        maxTop,
        track.topY + platformConfig.baseLift + platformConfig.amplitude,
        0.02,
      ) &&
      maxVerticalSpeed > 0.1,
    `${(minTop - track.topY).toFixed(2)}–${(maxTop - track.topY).toFixed(2)} m above deck`,
  )
  check(
    'platform.kinematic_body_tracks_visual',
    () =>
      approx(
        platform.body.translation().y,
        platform.centerY,
        1e-6,
      ) &&
      approx(platform.root.position.y, platform.centerY, 1e-6),
  )
  check(
    'platform.velocity_lookup',
    () =>
      platformManager.platformVelocity(platform.collider.handle) ===
        platform.velocity &&
      platformManager.platformVelocity(999999) === null,
  )

  const platformTop = platform.centerY + platformConfig.thickness / 2
  platformRig.player.reset(
    new THREE.Vector3(
      platform.x,
      platformTop + HALF + RADIUS + 0.03,
      platform.z,
    ),
  )
  let riderGrounded = 0
  let riderMinY = Number.POSITIVE_INFINITY
  let riderMaxY = Number.NEGATIVE_INFINITY
  let riderDelta = 0
  for (let index = 0; index < 120; index += 1) {
    stepPlayer(platformRig, { forwardSpeed: 0 })
    const top = platform.centerY + platformConfig.thickness / 2
    const feet = platformRig.player.position.y - HALF - RADIUS
    riderDelta = Math.max(riderDelta, Math.abs(feet - top - 0.03))
    riderMinY = Math.min(riderMinY, platformRig.player.position.y)
    riderMaxY = Math.max(riderMaxY, platformRig.player.position.y)
    if (platformRig.player.isGrounded) {
      riderGrounded += 1
    }
  }
  check(
    'platform.rider_stays_grounded',
    () => riderGrounded >= 90,
    `${riderGrounded}/120 grounded steps`,
  )
  check(
    'platform.rider_follows_motion',
    () => riderDelta < 0.12 && riderMaxY - riderMinY > 0.1,
    `height range ${(riderMaxY - riderMinY).toFixed(2)} m, max foot error ${riderDelta.toFixed(3)} m`,
  )
  platformManager.dispose()
  disposeRig(platformRig)

  // ------------------------------------------------- checkpoints + spawning
  console.log('\nCheckpoints and deterministic population')

  const interactionPhysics = await PhysicsWorld.create()
  const interactionScene = new THREE.Scene()
  const interactionManager = new InteractionManager(
    interactionScene,
    interactionPhysics,
  )

  const firstCheckpoint = interactionManager.spawnCheckpoint(1, 0, -50)
  const secondCheckpoint = interactionManager.spawnCheckpoint(2, 2.7, -80)
  check(
    'checkpoint.spawn_geometry',
    () =>
      approx(firstCheckpoint.distance, 50, 1e-9) &&
      approx(firstCheckpoint.y, SPAWN_Y, 1e-9) &&
      firstCheckpoint.z === -50,
    `distance ${firstCheckpoint.distance} m, spawn y ${firstCheckpoint.y.toFixed(2)}`,
  )
  check(
    'checkpoint.latest_lookup',
    () =>
      interactionManager.latestCheckpoint(49.9) === null &&
      interactionManager.latestCheckpoint(50) === firstCheckpoint &&
      interactionManager.latestCheckpoint(60) === firstCheckpoint &&
      interactionManager.latestCheckpoint(80) === secondCheckpoint &&
      interactionManager.latestCheckpoint(1000) === secondCheckpoint,
  )
  interactionManager.clearAll()
  check(
    'checkpoint.clear',
    () => interactionManager.latestCheckpoint(1000) === null,
  )

  const snapshot = (manager, segmentId) =>
    manager
      .interactionsIn(segmentId)
      .map((entry) => ({
        kind: entry.kind,
        x: Number(entry.x.toFixed(6)),
        z: Number(entry.z.toFixed(6)),
        radius: Number(entry.radius.toFixed(6)),
      }))
      .sort((a, b) =>
        a.kind === b.kind
          ? a.z - b.z
          : a.kind.localeCompare(b.kind),
      )

  interactionManager.populateSegment(5, -150, new Rng(123456), 0.8, () => false)
  const firstPopulation = snapshot(interactionManager, 5)
  interactionManager.clearSegment(5)
  interactionManager.populateSegment(5, -150, new Rng(123456), 0.8, () => false)
  const secondPopulation = snapshot(interactionManager, 5)
  check(
    'population.deterministic',
    () => JSON.stringify(firstPopulation) === JSON.stringify(secondPopulation),
    `${firstPopulation.length} interaction(s) per seed`,
  )
  check(
    'population.max_one_feature',
    () =>
      firstPopulation.filter((entry) => entry.kind !== 'checkpoint').length <= 1 &&
      firstPopulation.filter((entry) => entry.kind === 'checkpoint').length <= 1,
  )

  const hasCheckpoint = (centerZ, seed = 777) => {
    interactionManager.clearAll()
    interactionManager.populateSegment(7, centerZ, new Rng(seed), 0.4, () => false)
    return interactionManager
      .interactionsIn(7)
      .some((entry) => entry.kind === 'checkpoint')
  }
  check(
    'population.checkpoint_cadence',
    () =>
      hasCheckpoint(-60) === false &&
      hasCheckpoint(-90) === true &&
      hasCheckpoint(-120) === false &&
      hasCheckpoint(-180) === true,
    'one marker every third segment slot',
  )
  check(
    'population.first_segment_zone',
    () => hasCheckpoint(-30) === false,
    'checkpoint minDistance keeps the opening clear',
  )

  interactionManager.clearAll()
  const blockPad = interactionManager.spawnBounce(9, 2.7, -75)
  check(
    'population.blocking_query',
    () =>
      interactionManager.isBlocked(blockPad.x, blockPad.z, 0.3) === true &&
      interactionManager.isBlocked(blockPad.x + 6, blockPad.z, 0.3) === false,
  )
  interactionManager.clearSegment(9)
  check(
    'population.clear_removes_bodies',
    () => interactionManager.interactionsIn(9).length === 0,
  )

  interactionManager.dispose()
  interactionPhysics.dispose()
  beamAssets.dispose()
} catch (error) {
  failed += 1
  failures.push(`uncaught: ${error.message}`)
  console.error('\nUncaught validation error:', error)
} finally {
  await server.close()
}

console.log(`\n${'-'.repeat(60)}`)
console.log(`${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`Failures:\n${failures.map((entry) => ` - ${entry}`).join('\n')}`)
  process.exitCode = 1
}
