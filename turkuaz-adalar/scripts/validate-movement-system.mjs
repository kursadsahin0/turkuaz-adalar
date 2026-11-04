#!/usr/bin/env node
/**
 * Movement-system validation.
 *
 * Exercises the real TypeScript modules through Vite SSR:
 *  - LaneController: three-lane state, smoothing, acceleration, air control,
 *    boundaries, reset and delta-time independence.
 *  - InputManager: keyboard lane steps, tap jump, horizontal/vertical swipes,
 *    one-lane-per-gesture locking, repeat suppression and reset.
 *  - Player + Rapier: grounding, jump height, landing detection, capsule
 *    alignment, collision, no fall-through and forward speed consistency.
 *
 * Usage: npm run validate:movement
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
  const { LaneController } = await server.ssrLoadModule(
    '/src/game/player/LaneController.ts',
  )
  const { InputManager } = await server.ssrLoadModule(
    '/src/systems/input/InputManager.ts',
  )
  const { PhysicsWorld } = await server.ssrLoadModule(
    '/src/systems/physics/PhysicsWorld.ts',
  )
  const { Player } = await server.ssrLoadModule('/src/game/player/Player.ts')
  const { GAME_CONFIG } = await server.ssrLoadModule('/src/config/GameConfig.ts')

  const playerConfig = GAME_CONFIG.player
  const track = GAME_CONFIG.track
  const laneConfig = playerConfig.lane
  const positions = track.lanePositions
  const centerLane = Math.floor(positions.length / 2)
  const DT = 1 / 60

  console.log('\nMovement system validation\n')

  // ------------------------------------------------------------------ lanes
  console.log('Lane controller')

  const lanes = new LaneController()
  check(
    'lane.starts_center',
    () => lanes.laneIndex === centerLane && approx(lanes.laneX, 0, 1e-9),
    `lane ${lanes.laneIndex} at x ${lanes.laneX}`,
  )
  check(
    'lane.count',
    () => lanes.laneCount === 3 && positions.length === 3,
    `${lanes.laneCount} logical lanes`,
  )

  check(
    'lane.request_left',
    () => {
      lanes.requestLane(-1)
      return lanes.laneIndex === 0 && approx(lanes.laneX, positions[0], 1e-9)
    },
    `lane ${lanes.laneIndex} → x ${lanes.laneX}`,
  )
  check(
    'lane.request_right_from_left',
    () => {
      lanes.requestLane(1)
      return lanes.laneIndex === 1 && approx(lanes.laneX, positions[1], 1e-9)
    },
  )
  check(
    'lane.request_right',
    () => {
      lanes.requestLane(1)
      return lanes.laneIndex === 2 && approx(lanes.laneX, positions[2], 1e-9)
    },
  )
  check(
    'lane.clamps_right_boundary',
    () => {
      for (let index = 0; index < 5; index += 1) {
        lanes.requestLane(1)
      }
      return lanes.laneIndex === 2
    },
    'five right requests stay in the right lane',
  )
  check(
    'lane.clamps_left_boundary',
    () => {
      for (let index = 0; index < 5; index += 1) {
        lanes.requestLane(-1)
      }
      return lanes.laneIndex === 0
    },
    'five left requests stay in the left lane',
  )
  check('lane.zero_request_is_noop', () => lanes.requestLane(0) === 0)

  const smooth = new LaneController()
  smooth.reset()
  smooth.requestLane(-1)
  let x = 0
  let largestStep = 0
  let crossedTarget = false
  let elapsed = 0
  const targetX = positions[0]
  let previousX = x
  while (elapsed < 1 && smooth.isTransitioning) {
    const deltaX = smooth.step(x, true, DT)
    previousX = x
    x += deltaX
    largestStep = Math.max(largestStep, Math.abs(deltaX))
    if (previousX < targetX - 1e-6 || x < targetX - 1e-6) {
      crossedTarget = true
    }
    elapsed += DT
    if (elapsed > 1.2) break
  }
  x += smooth.step(x, true, DT)
  check(
    'lane.smooth_transition',
    () => elapsed > 0.08 && elapsed < 0.6 && Math.abs(x - targetX) <= laneConfig.snapDistance + 0.001,
    `arrived in ${elapsed.toFixed(3)} s`,
  )
  check(
    'lane.no_teleport',
    () => largestStep <= laneConfig.changeSpeed * DT + 0.001,
    `largest step ${largestStep.toFixed(4)} m`,
  )
  check('lane.no_overshoot', () => crossedTarget === false)
  check(
    'lane.aligned_after_transition',
    () => !smooth.isTransitioning && approx(smooth.lateralVelocity, 0, 1e-9),
  )
  check(
    'lane.steer_is_normalized',
    () => {
      const probe = new LaneController()
      probe.requestLane(1)
      let position = 0
      for (let index = 0; index < 10; index += 1) {
        position += probe.step(position, true, DT)
      }
      return probe.steer > 0 && probe.steer <= 1
    },
  )

  const air = new LaneController()
  const ground = new LaneController()
  air.requestLane(-1)
  ground.requestLane(-1)
  let airX = 0
  let groundX = 0
  for (let index = 0; index < 12; index += 1) {
    airX += air.step(airX, false, DT)
    groundX += ground.step(groundX, true, DT)
  }
  check(
    'lane.air_control_reduced',
    () => Math.abs(airX) > 0 && Math.abs(airX) < Math.abs(groundX) * 0.85,
    `air ${Math.abs(airX).toFixed(2)} m vs ground ${Math.abs(groundX).toFixed(2)} m`,
  )
  check(
    'lane.air_control_still_moves',
    () => Math.abs(airX) > 0.2,
    `${Math.abs(airX).toFixed(2)} m during 0.2 s airborne`,
  )

  const faster = new LaneController({ ...laneConfig, acceleration: laneConfig.acceleration * 4 })
  const base = new LaneController()
  faster.requestLane(-1)
  base.requestLane(-1)
  let fasterX = 0
  let baseX = 0
  for (let index = 0; index < 6; index += 1) {
    fasterX += faster.step(fasterX, true, DT)
    baseX += base.step(baseX, true, DT)
  }
  check(
    'lane.acceleration_adjustable',
    () => Math.abs(fasterX) > Math.abs(baseX) + 0.01,
    `faster ${Math.abs(fasterX).toFixed(2)} m vs base ${Math.abs(baseX).toFixed(2)} m`,
  )

  const simulate = (frequency, seconds) => {
    const controller = new LaneController()
    controller.requestLane(1)
    let position = 0
    const delta = 1 / frequency
    for (let index = 0; index < Math.round(seconds * frequency); index += 1) {
      position += controller.step(position, true, delta)
    }
    return position
  }
  const at60 = simulate(60, 0.3)
  const at120 = simulate(120, 0.3)
  check(
    'lane.delta_independent',
    () => approx(at60, at120, 0.02),
    `60 Hz ${at60.toFixed(3)} m vs 120 Hz ${at120.toFixed(3)} m`,
  )

  const many = new LaneController()
  many.reset(0)
  check(
    'lane.reset_lane',
    () => many.laneIndex === 0 && approx(many.laneX, positions[0], 1e-9),
  )
  many.reset()
  check('lane.reset_center', () => many.laneIndex === centerLane)
  check(
    'lane.invalid_change_ignored',
    () => many.requestLane(Number.NaN) === centerLane,
  )

  // ------------------------------------------------------------------ input
  console.log('\nInput layer')

  const fakeWindow = new FakeTarget()
  fakeWindow.innerWidth = 390
  globalThis.window = fakeWindow
  const canvas = makeCanvas()
  const input = new InputManager(canvas, {
    onPause: () => {},
    onToggleMute: () => {},
  })
  const key = (code, repeat = false) =>
    fakeWindow.emit('keydown', keyboardEvent(code, repeat))
  const down = (id, x, y) => canvas.emit('pointerdown', pointerEvent(id, x, y))
  const move = (id, x, y) => canvas.emit('pointermove', pointerEvent(id, x, y))
  const up = (id, x, y) => canvas.emit('pointerup', pointerEvent(id, x, y))

  check(
    'input.key_left',
    () => {
      key('KeyA')
      return input.consumeLaneChange() === -1 && input.consumeLaneChange() === 0
    },
  )
  check(
    'input.key_right',
    () => {
      key('KeyD')
      return input.consumeLaneChange() === 1
    },
  )
  check(
    'input.arrow_left',
    () => {
      key('ArrowLeft')
      return input.consumeLaneChange() === -1
    },
  )
  check(
    'input.arrow_right',
    () => {
      key('ArrowRight')
      return input.consumeLaneChange() === 1
    },
  )
  check(
    'input.key_repeat_ignored',
    () => {
      key('KeyA', false)
      key('KeyA', true)
      return input.consumeLaneChange() === -1 && input.consumeLaneChange() === 0
    },
  )
  check(
    'input.space_jumps',
    () => {
      key('Space')
      return input.consumeJump() === true && input.consumeJump() === false
    },
  )
  check(
    'input.jump_repeat_ignored',
    () => {
      key('Space', false)
      key('Space', true)
      input.consumeJump()
      return input.consumeJump() === false
    },
  )
  check(
    'input.slide_key',
    () => {
      key('KeyS')
      return input.consumeSlide() === true && input.consumeSlide() === false
    },
  )
  check(
    'input.slide_repeat_ignored',
    () => {
      key('ArrowDown', false)
      key('ArrowDown', true)
      input.consumeSlide()
      return input.consumeSlide() === false
    },
  )
  check(
    'input.jump_hold_key',
    () => {
      key('Space')
      const held = input.isJumpHeld()
      fakeWindow.emit('keyup', keyboardEvent('Space'))
      input.consumeJump()
      return held === true && input.isJumpHeld() === false
    },
    'held jump is reported while the key is down',
  )
  check(
    'input.queue_is_bounded',
    () => {
      for (let index = 0; index < 20; index += 1) {
        key('KeyD')
      }
      let count = 0
      while (input.consumeLaneChange() !== 0) {
        count += 1
      }
      return count === 4
    },
    'at most four buffered steps',
  )

  check(
    'input.swipe_left_one_lane',
    () => {
      down(1, 220, 500)
      move(1, 170, 500)
      // Continuing the same gesture must not queue a second lane.
      move(1, 80, 500)
      move(1, 30, 500)
      up(1, 30, 500)
      const lane = input.consumeLaneChange()
      return lane === -1 && input.consumeLaneChange() === 0 && input.consumeJump() === false
    },
  )
  check(
    'input.swipe_right_one_lane',
    () => {
      down(2, 80, 500)
      move(2, 140, 500)
      move(2, 240, 500)
      up(2, 240, 500)
      return input.consumeLaneChange() === 1 && input.consumeLaneChange() === 0
    },
  )
  check(
    'input.new_gesture_can_change_again',
    () => {
      down(3, 100, 500)
      move(3, 150, 500)
      up(3, 150, 500)
      down(4, 200, 500)
      move(4, 150, 500)
      up(4, 150, 500)
      return input.consumeLaneChange() === 1 && input.consumeLaneChange() === -1
    },
  )
  check(
    'input.diagonal_swipe_changes_lane',
    () => {
      down(5, 200, 500)
      move(5, 120, 470)
      up(5, 120, 470)
      return input.consumeLaneChange() === -1 && input.consumeJump() === false
    },
  )
  check(
    'input.tap_jumps',
    () => {
      down(6, 200, 500)
      up(6, 204, 503)
      return input.consumeJump() === true && input.consumeLaneChange() === 0
    },
  )
  check(
    'input.swipe_up_jumps',
    () => {
      down(7, 200, 500)
      move(7, 202, 410)
      up(7, 202, 410)
      return input.consumeJump() === true && input.consumeLaneChange() === 0
    },
  )
  check(
    'input.swipe_down_slides',
    () => {
      down(8, 200, 400)
      move(8, 203, 500)
      up(8, 203, 500)
      return (
        input.consumeSlide() === true &&
        input.consumeDash() === false &&
        input.consumeLaneChange() === 0
      )
    },
  )
  check(
    'input.swipe_down_no_jump',
    () => {
      down(11, 200, 400)
      move(11, 205, 500)
      up(11, 205, 500)
      return input.consumeJump() === false && input.consumeSlide() === true
    },
    'a downward swipe is a slide, never a jump',
  )
  check(
    'input.vertical_swipe_no_lane',
    () => {
      down(9, 200, 500)
      move(9, 210, 400)
      up(9, 210, 400)
      const lane = input.consumeLaneChange()
      const jumped = input.consumeJump()
      return lane === 0 && jumped === true
    },
    'vertical swipe jumps without changing lane',
  )
  check(
    'input.pointer_cancel_no_action',
    () => {
      down(10, 200, 500)
      // Stay below the swipe threshold; cancelling must not queue anything.
      move(10, 190, 504)
      canvas.emit('pointercancel', pointerEvent(10, 190, 504))
      return input.consumeLaneChange() === 0 && input.consumeJump() === false
    },
  )
  check(
    'input.blur_resets_queues',
    () => {
      key('KeyA')
      key('Space')
      input.queueSlide()
      fakeWindow.emit('blur', {})
      return (
        input.consumeLaneChange() === 0 &&
        input.consumeJump() === false &&
        input.consumeDash() === false &&
        input.consumeSlide() === false &&
        input.isJumpHeld() === false
      )
    },
  )
  check(
    'input.reset_clears_queues',
    () => {
      key('KeyD')
      key('Space')
      input.queueDash()
      input.queueSlide()
      input.reset()
      return (
        input.consumeLaneChange() === 0 &&
        input.consumeJump() === false &&
        input.consumeDash() === false &&
        input.consumeSlide() === false &&
        input.isJumpHeld() === false
      )
    },
  )
  input.dispose()
  check(
    'input.dispose_removes_listeners',
    () => {
      const before = fakeWindow.listeners.get('keydown')?.length ?? 0
      return before === 0 && (canvas.listeners.get('pointerdown')?.length ?? 0) === 0
    },
  )

  // --------------------------------------------------------------- physics
  console.log('\nPlayer + Rapier')

  const spawnPoint = () =>
    new THREE.Vector3(
      0,
      track.topY + playerConfig.halfHeight + playerConfig.radius + 0.03,
      playerConfig.startZ,
    )

  const createRig = async (withBlocker = false) => {
    const physics = await PhysicsWorld.create()
    physics.addStaticBox(
      { x: 0, y: track.topY - 1, z: -150 },
      { x: 10, y: 1, z: 160 },
    )
    let blockerColliderHandle = null
    if (withBlocker) {
      const blocker = physics.addStaticBox(
        { x: 0, y: track.topY + 0.55, z: -6 },
        { x: 0.55, y: 0.55, z: 0.55 },
      )
      blockerColliderHandle = blocker.collider.handle
    }
    const scene = new THREE.Scene()
    const player = new Player(scene, physics)
    player.reset(spawnPoint())
    return { physics, scene, player, blockerColliderHandle }
  }

  const advance = (rig, count, options = {}) => {
    const delta = options.delta ?? DT
    const speed = options.speed ?? 9.5
    const laneChange = options.laneChange ?? 0
    const jump = options.jump ?? false
    for (let index = 0; index < count; index += 1) {
      rig.player.fixedUpdate(delta, {
        laneChange: index === 0 ? laneChange : 0,
        jump: jump && index === 0,
        forwardSpeed: speed,
      })
      rig.physics.step(delta)
      rig.player.syncTransform()
    }
  }

  const main = await createRig()
  advance(main, 90)
  check(
    'physics.grounded_on_platform',
    () => main.player.isGrounded === true && main.player.position.y > track.topY,
    `y ${main.player.position.y.toFixed(2)}`,
  )
  check(
    'physics.capsule_stays_on_deck',
    () => {
      const capsuleBottom =
        main.player.position.y - playerConfig.halfHeight - playerConfig.radius
      return capsuleBottom >= track.topY - 0.06
    },
    `capsule bottom ${(
      main.player.position.y -
      playerConfig.halfHeight -
      playerConfig.radius
    ).toFixed(2)} ≥ ${track.topY}`,
  )

  const restY = main.player.position.y
  let jumpCount = 0
  let landCount = 0
  let landImpact = 0
  main.player.onJump = () => {
    jumpCount += 1
  }
  main.player.onLand = (impactSpeed) => {
    landCount += 1
    landImpact = impactSpeed
  }
  main.player.fixedUpdate(DT, { laneChange: 0, jump: true, forwardSpeed: 9.5 })
  main.physics.step(DT)
  main.player.syncTransform()
  let peakY = main.player.position.y
  let peakGrounded = main.player.isGrounded
  let airborneSteps = 0
  for (let index = 0; index < 90; index += 1) {
    main.player.fixedUpdate(DT, { laneChange: 0, jump: false, forwardSpeed: 9.5 })
    main.physics.step(DT)
    main.player.syncTransform()
    peakY = Math.max(peakY, main.player.position.y)
    peakGrounded = peakGrounded && main.player.isGrounded
    if (!main.player.isGrounded) airborneSteps += 1
  }
  check(
    'jump.height_configurable',
    () => approx(peakY - restY, playerConfig.jumpHeight, 0.2),
    `${(peakY - restY).toFixed(2)} m of ${playerConfig.jumpHeight} m`,
  )
  check('jump.once_per_input', () => jumpCount === 1, `${jumpCount} launch(es)`)
  check(
    'jump.leaves_ground',
    () => !peakGrounded && airborneSteps > 15,
    `${airborneSteps} airborne steps`,
  )
  check(
    'landing.detected',
    () => landCount === 1 && main.player.isGrounded && approx(main.player.position.y, restY, 0.05),
    `${landCount} touchdown(s), impact ${landImpact.toFixed(1)} m/s`,
  )
  check(
    'landing.impact_speed',
    () => landImpact > playerConfig.gravity * -0.2,
    `${landImpact.toFixed(2)} m/s`,
  )

  // No double jump: pressing again mid-air must be ignored.
  advance(main, 90)
  const jumpsBeforeDouble = jumpCount
  main.player.fixedUpdate(DT, { laneChange: 0, jump: true, forwardSpeed: 9.5 })
  advance(main, 8)
  const airborneForDouble = !main.player.isGrounded
  main.player.fixedUpdate(DT, { laneChange: 0, jump: true, forwardSpeed: 9.5 })
  advance(main, 12)
  check(
    'jump.no_double_jump',
    () =>
      airborneForDouble &&
      !main.player.isGrounded &&
      jumpCount === jumpsBeforeDouble + 1,
    `${jumpCount - jumpsBeforeDouble} launch(es) after an airborne press`,
  )

  // Let it land and settle before lane checks.
  advance(main, 90)
  const laneStartX = main.player.position.x
  const laneStartZ = main.player.position.z
  advance(main, 1, { laneChange: -1 })
  let laneMaxStep = 0
  let lanePreviousX = main.player.position.x
  for (let index = 0; index < 60; index += 1) {
    main.player.fixedUpdate(DT, { laneChange: 0, jump: false, forwardSpeed: 9.5 })
    main.physics.step(DT)
    main.player.syncTransform()
    laneMaxStep = Math.max(laneMaxStep, Math.abs(main.player.position.x - lanePreviousX))
    lanePreviousX = main.player.position.x
  }
  check(
    'player.lane_left',
    () =>
      main.player.laneIndex === 0 &&
      approx(main.player.position.x, positions[0], 0.03) &&
      !main.player.isChangingLane,
    `x ${main.player.position.x.toFixed(2)}`,
  )
  check(
    'player.lane_capsule_aligned',
    () => {
      const bodyX = main.player.position.x
      return approx(bodyX, main.player.laneX, 0.03)
    },
  )
  check(
    'player.lane_smooth_integration',
    () => laneMaxStep > 0.02 && laneMaxStep < laneConfig.changeSpeed * DT + 0.01,
    `max step ${laneMaxStep.toFixed(3)} m`,
  )
  check(
    'player.lane_moves_toward_target',
    () => Math.abs(laneStartX) < 0.05 && main.player.position.x < -2,
    `${laneStartX.toFixed(2)} → ${main.player.position.x.toFixed(2)}`,
  )
  check(
    'player.forward_speed_consistent',
    () => {
      const travelled = main.player.position.z - laneStartZ
      const expected = -9.5 * (61 / 60)
      return approx(travelled, expected, 0.25)
    },
    `${(main.player.position.z - laneStartZ).toFixed(2)} m in ~1 s`,
  )
  check(
    'player.lane_locked_after_input',
    () => {
      const laneBefore = main.player.laneIndex
      advance(main, 30)
      return main.player.laneIndex === laneBefore
    },
    'no drift without new input',
  )

  // A second lane step while still transitioning must accumulate cleanly.
  main.player.reset(spawnPoint())
  advance(main, 90)
  advance(main, 1, { laneChange: 1 })
  advance(main, 4)
  advance(main, 1, { laneChange: 1 })
  advance(main, 90)
  check(
    'player.two_steps_smoothly',
    () =>
      main.player.laneIndex === 2 &&
      approx(main.player.position.x, positions[2], 0.03),
    `lane ${main.player.laneIndex} at x ${main.player.position.x.toFixed(2)}`,
  )

  // Air control in the real controller.
  main.player.reset(spawnPoint())
  advance(main, 90)
  const groundStartX = main.player.position.x
  advance(main, 1, { laneChange: -1 })
  advance(main, 12)
  const groundTravel = Math.abs(main.player.position.x - groundStartX)

  main.player.reset(spawnPoint())
  advance(main, 90)
  advance(main, 1, { jump: true })
  advance(main, 8)
  const airStartX = main.player.position.x
  advance(main, 1, { laneChange: -1 })
  advance(main, 12)
  const airTravel = Math.abs(main.player.position.x - airStartX)
  check(
    'player.air_control',
    () => !main.player.isGrounded && airTravel > 0.1 && airTravel < groundTravel * 0.9,
    `air ${airTravel.toFixed(2)} m vs ground ${groundTravel.toFixed(2)} m`,
  )

  // Delta-time independence with a full physics rig.
  const runFor = async (frequency, seconds) => {
    const rig = await createRig()
    const delta = 1 / frequency
    advance(rig, Math.round(1.2 * frequency), { delta })
    advance(rig, 1, { delta, laneChange: -1 })
    advance(rig, Math.round(seconds * frequency), { delta })
    const result = {
      x: rig.player.position.x,
      z: rig.player.position.z,
      y: rig.player.position.y,
    }
    rig.player.dispose()
    rig.physics.dispose()
    return result
  }
  const run60 = await runFor(60, 0.5)
  const run120 = await runFor(120, 0.5)
  check(
    'physics.delta_independent_lateral',
    () => approx(run60.x, run120.x, 0.03),
    `x ${run60.x.toFixed(3)} vs ${run120.x.toFixed(3)}`,
  )
  check(
    'physics.delta_independent_forward',
    () => approx(run60.z, run120.z, 0.2),
    `z ${run60.z.toFixed(2)} vs ${run120.z.toFixed(2)}`,
  )

  // Collision + no fall-through.
  const blocked = await createRig(true)
  let collisions = 0
  const collidedHandles = new Set()
  let minY = Number.POSITIVE_INFINITY
  blocked.player.onCollision = (handle) => {
    collisions += 1
    collidedHandles.add(handle)
  }
  for (let index = 0; index < 240; index += 1) {
    blocked.player.fixedUpdate(DT, {
      laneChange: 0,
      jump: false,
      forwardSpeed: 9.5,
    })
    blocked.physics.step(DT)
    blocked.player.syncTransform()
    minY = Math.min(minY, blocked.player.position.y)
  }
  check(
    'physics.collides_with_obstacle',
    () =>
      collisions > 0 &&
      blocked.blockerColliderHandle !== null &&
      collidedHandles.has(blocked.blockerColliderHandle),
    `${collisions} contact(s), blocker included: ${
      collidedHandles.has(blocked.blockerColliderHandle) ? 'yes' : 'no'
    }`,
  )
  check(
    'physics.never_falls_through',
    () =>
      minY - playerConfig.halfHeight - playerConfig.radius >=
        track.topY - 0.08,
    `lowest capsule bottom ${(
      minY -
      playerConfig.halfHeight -
      playerConfig.radius
    ).toFixed(2)}`,
  )
  check(
    'physics.stays_on_track_lanes',
    () => {
      const maxLane = track.width / 2 - playerConfig.radius - 0.55
      return Math.abs(blocked.player.position.x) <= maxLane + 0.001
    },
  )

  for (const rig of [main, blocked]) {
    rig.player.dispose()
    rig.physics.dispose()
  }

  // ------------------------------------------------------------ config
  console.log('\nConfig integrity')
  check(
    'config.three_lanes',
    () =>
      positions.length === 3 &&
      positions[0] < positions[1] &&
      positions[1] === 0 &&
      positions[2] > positions[1],
    positions.join(' / '),
  )
  check(
    'config.jump_height',
    () => playerConfig.jumpHeight > 0.5 && playerConfig.gravity < 0,
    `${playerConfig.jumpHeight} m`,
  )
  check(
    'config.lane_tuning',
    () =>
      laneConfig.changeSpeed > 0 &&
      laneConfig.acceleration > 0 &&
      laneConfig.airControl > 0 &&
      laneConfig.airControl < 1 &&
      laneConfig.arrivalGain > 0,
  )
  check(
    'config.legacy_fields_removed',
    () =>
      playerConfig.jumpSpeed === undefined &&
      playerConfig.lateralSpeed === undefined &&
      playerConfig.lateralAcceleration === undefined,
  )
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
