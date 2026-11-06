#!/usr/bin/env node
/**
 * Camera-system validation.
 *
 * Runs the real TypeScript camera modules through Vite's SSR loader and checks
 * framing, follow smoothing, adjustable distance/height, jump/land responses,
 * menu transitions, section bounds, occlusion, aspect handling and jitter.
 *
 * Usage: npm run validate:camera
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { createServer } from 'vite'

globalThis.self = globalThis

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(HERE, '..')
const DT = 1 / 60

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

function settle(rig, target, mode, seconds, options = {}) {
  const distance = options.distance ?? 0
  const elapsedStart = options.elapsed ?? 0
  const frames = Math.max(1, Math.round(seconds / DT))
  let elapsed = elapsedStart
  for (let index = 0; index < frames; index += 1) {
    elapsed += DT
    rig.update(DT, target, mode, elapsed, distance)
  }
  return elapsed
}

function project(rig, point) {
  rig.camera.updateMatrixWorld()
  const projected = point.clone().project(rig.camera)
  return { x: projected.x, y: projected.y, z: projected.z }
}

const server = await createServer({
  root: PROJECT_ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const { IsometricCameraRig } = await server.ssrLoadModule(
    '/src/game/camera/IsometricCameraRig.ts',
  )
  const { CameraOcclusion } = await server.ssrLoadModule('/src/game/camera/CameraOcclusion.ts')
  const { baseFraming, composeFraming, resolveAspectProfile, resolveCameraSection } =
    await server.ssrLoadModule('/src/game/camera/CameraFraming.ts')
  const { CAMERA_CONFIG } = await server.ssrLoadModule('/src/config/CameraConfig.ts')

  const target = new THREE.Vector3(0, 3.36, 0)
  const makeRig = (aspect = 16 / 9, reduceMotion = true) =>
    new IsometricCameraRig(aspect, { reduceMotion })

  console.log('\nCamera system validation\n')
  console.log('Projection & aspect')

  const landscape = makeRig(16 / 9)
  landscape.snapTo(target, 'follow', 0)
  check(
    'camera.perspective',
    () => landscape.camera.isPerspectiveCamera === true,
    `fov ${landscape.camera.fov}`,
  )
  check(
    'aspect.landscape_profile',
    () => landscape.aspectProfile === 'landscape' && landscape.camera.aspect === 16 / 9,
  )
  check(
    'camera.elevated_iso',
    () => {
      const pitch = THREE.MathUtils.radToDeg(
        Math.atan2(landscape.camera.position.y - target.y, landscape.camera.position.z - target.z),
      )
      return pitch > 28 && pitch < 40
    },
    'pitch ~33°',
  )
  check(
    'camera.character_visible',
    () => {
      const feet = project(landscape, target.clone().add(new THREE.Vector3(0, -0.78, 0)))
      const head = project(landscape, target.clone().add(new THREE.Vector3(0, 0.78, 0)))
      return (
        Math.abs(feet.x) < 0.5 &&
        Math.abs(head.x) < 0.5 &&
        feet.y > -1 &&
        head.y < 1 &&
        head.y - feet.y > 0.05
      )
    },
    'runner inside the safe frame',
  )

  landscape.setAspect(0.5)
  settle(landscape, target, 'follow', 3)
  check('aspect.portrait_profile', () => landscape.aspectProfile === 'portrait')
  check(
    'aspect.portrait_fov',
    () => approx(landscape.camera.fov, CAMERA_CONFIG.projection.fov.portrait, 0.01),
    `${landscape.camera.fov.toFixed(1)}°`,
  )
  check(
    'aspect.portrait_frames_track',
    () => {
      const feet = project(landscape, target.clone().add(new THREE.Vector3(0, -0.78, 0)))
      const head = project(landscape, target.clone().add(new THREE.Vector3(0, 0.78, 0)))
      return Math.abs(feet.x) < 0.6 && Math.abs(head.x) < 0.6 && feet.y > -1 && head.y < 1
    },
    'portrait keeps the runner visible',
  )
  check(
    'aspect.portrait_pulls_back',
    () => resolveAspectProfile(0.5) === 'portrait' && resolveAspectProfile(2) === 'landscape',
  )

  console.log('\nSmooth follow')
  const followRig = makeRig()
  const moving = target.clone()
  followRig.snapTo(moving, 'follow', 0)
  let elapsed = 0
  let maxStep = 0
  let previous = followRig.camera.position.clone()
  for (let index = 0; index < 240; index += 1) {
    moving.z -= 12 * DT
    elapsed += DT
    followRig.update(DT, moving, 'follow', elapsed, Math.max(0, -moving.z))
    maxStep = Math.max(maxStep, followRig.camera.position.distanceTo(previous))
    previous = followRig.camera.position.clone()
  }
  check('follow.no_position_snap', () => maxStep < 0.6, `max frame step ${maxStep.toFixed(3)} m`)
  check(
    'follow.stays_behind',
    () => {
      const behind = followRig.camera.position.z - moving.z
      return behind > 9 && behind < 12.5
    },
    `${(followRig.camera.position.z - moving.z).toFixed(2)} m behind`,
  )
  check(
    'follow.stays_above',
    () => followRig.camera.position.y > moving.y + 4.5,
    `${(followRig.camera.position.y - moving.y).toFixed(2)} m above`,
  )

  const staticRig = makeRig()
  const staticTarget = new THREE.Vector3(0, 3.36, 0)
  staticRig.snapTo(staticTarget, 'follow', 0)
  settle(staticRig, staticTarget, 'follow', 2)
  let previousStill = staticRig.camera.position.clone()
  let jitter = 0
  for (let index = 0; index < 120; index += 1) {
    staticRig.update(DT, staticTarget, 'follow', 2 + index * DT, 0)
    jitter = Math.max(jitter, staticRig.camera.position.distanceTo(previousStill))
    previousStill = staticRig.camera.position.clone()
  }
  check('follow.no_jitter', () => jitter < 0.0005, `max drift ${jitter.toExponential(2)} m`)

  const lateralRig = makeRig()
  const lateralTarget = new THREE.Vector3(0, 3.36, 0)
  lateralRig.snapTo(lateralTarget, 'follow', 0)
  settle(lateralRig, lateralTarget, 'follow', 1)
  const beforeLane = lateralRig.camera.position.clone()
  lateralTarget.x = 2.7
  lateralRig.update(DT, lateralTarget, 'follow', 1 + DT, 0)
  const firstLaneStep = lateralRig.camera.position.distanceTo(beforeLane)
  settle(lateralRig, lateralTarget, 'follow', 2)
  check(
    'follow.lateral_eases_in',
    () => firstLaneStep > 0.001 && firstLaneStep < 0.35,
    `first step ${firstLaneStep.toFixed(3)} m`,
  )
  check(
    'follow.lateral_tracks_player',
    () => {
      // The camera sits on a diagonal, so its X is the pivot plus the yaw
      // offset. Compare against that composed target rather than the pivot.
      const framing = lateralRig.currentFraming
      const steer =
        (2.7 / CAMERA_CONFIG.sections.definitions[0].bounds.lateral) *
        CAMERA_CONFIG.rotation.steerYawDegrees
      const expectedX =
        2.7 * CAMERA_CONFIG.follow.pivotXFollow +
        Math.sin(THREE.MathUtils.degToRad(framing.yawDegrees + steer)) * framing.distance
      return Math.abs(lateralRig.camera.position.x - expectedX) < 0.2
    },
    `camera x ${lateralRig.camera.position.x.toFixed(2)}`,
  )

  console.log('\nAdjustable framing')
  const framingRig = makeRig()
  framingRig.snapTo(target, 'follow', 0)
  const baseDistance = framingRig.distance
  const baseHeight = framingRig.height
  framingRig.setDistance(14)
  framingRig.setHeight(9)
  settle(framingRig, target, 'follow', 3)
  check(
    'framing.distance_setter',
    () => approx(framingRig.distance, 14, 0.02),
    `${framingRig.distance.toFixed(2)} m`,
  )
  check(
    'framing.height_setter',
    () => approx(framingRig.height, 9, 0.02),
    `${framingRig.height.toFixed(2)} m`,
  )
  check(
    'framing.setter_moves_camera',
    () => approx(framingRig.camera.position.y - target.y, 9, 0.15),
    `${(framingRig.camera.position.y - target.y).toFixed(2)} m above`,
  )
  framingRig.adjustDistance(-1.5)
  framingRig.adjustHeight(-1)
  settle(framingRig, target, 'follow', 3)
  check(
    'framing.adjust_setters',
    () => approx(framingRig.distance, 12.5, 0.05) && approx(framingRig.height, 8, 0.05),
  )
  framingRig.setDistance(100)
  framingRig.setHeight(-5)
  settle(framingRig, target, 'follow', 4)
  check(
    'framing.clamped',
    () =>
      framingRig.distance <= CAMERA_CONFIG.bounds.maxDistance + 0.001 &&
      framingRig.height >= CAMERA_CONFIG.bounds.minHeight - 0.001,
    `distance ${framingRig.distance.toFixed(2)}, height ${framingRig.height.toFixed(2)}`,
  )
  framingRig.clearFramingOverrides()
  settle(framingRig, target, 'follow', 3)
  check(
    'framing.overrides_clear',
    () =>
      approx(framingRig.distance, baseDistance, 0.05) &&
      approx(framingRig.height, baseHeight, 0.05),
  )

  console.log('\nJump & landing feedback')
  const jumpRig = makeRig(16 / 9, false)
  jumpRig.snapTo(target, 'follow', 0)
  settle(jumpRig, target, 'follow', 1.5)
  const jumpBase = jumpRig.camera.position.y
  jumpRig.jump()
  let jumpPeak = jumpBase
  let jumpElapsed = 1.5
  for (let index = 0; index < 40; index += 1) {
    jumpElapsed += DT
    jumpRig.update(DT, target, 'follow', jumpElapsed, 0)
    jumpPeak = Math.max(jumpPeak, jumpRig.camera.position.y)
  }
  check(
    'jump.small_lift',
    () => jumpPeak > jumpBase + 0.05 && jumpPeak < jumpBase + 0.6,
    `lift ${(jumpPeak - jumpBase).toFixed(3)} m`,
  )
  settle(jumpRig, target, 'follow', 3, { elapsed: jumpElapsed })
  check(
    'jump.settles',
    () => approx(jumpRig.camera.position.y, jumpBase, 0.02),
    'returns to the baseline',
  )

  // A full jump arc: the runner must visibly rise in frame while the camera
  // only absorbs a small part of the height.
  const arcRig = makeRig(16 / 9, false)
  const arcRest = new THREE.Vector3(0, 3.36, 0)
  arcRig.snapTo(arcRest, 'follow', 0)
  settle(arcRig, arcRest, 'follow', 1.5)
  const arcBase = project(arcRig, arcRest)
  const arcBaseCameraY = arcRig.camera.position.y
  const arcPoint = arcRest.clone()
  let arcPeak = arcBase.y
  let arcCameraRise = 0
  let arcElapsed = 1.5
  arcRig.jump()
  for (let index = 0; index < 40; index += 1) {
    const progress = index / 39
    arcPoint.y = arcRest.y + Math.sin(progress * Math.PI) * 1.2
    arcElapsed += DT
    arcRig.update(DT, arcPoint, 'follow', arcElapsed, 0)
    const projected = project(arcRig, arcPoint)
    if (projected.y > arcPeak) {
      arcPeak = projected.y
      arcCameraRise = arcRig.camera.position.y - arcBaseCameraY
    }
  }
  check(
    'jump.character_rises_in_frame',
    () => arcPeak > arcBase.y + 0.03,
    `screen rise ${(arcPeak - arcBase.y).toFixed(3)} NDC`,
  )
  check(
    'jump.camera_absorbs_small_part',
    () => arcCameraRise > 0 && arcCameraRise < 1.2 * 0.6,
    `camera rose ${arcCameraRise.toFixed(2)} m of 1.20 m`,
  )

  const landRig = makeRig(16 / 9, false)
  landRig.snapTo(target, 'follow', 0)
  settle(landRig, target, 'follow', 1.5)
  const landBase = landRig.camera.position.y
  landRig.land(12)
  let landDip = landBase
  let landElapsed = 1.5
  for (let index = 0; index < 45; index += 1) {
    landElapsed += DT
    landRig.update(DT, target, 'follow', landElapsed, 0)
    landDip = Math.min(landDip, landRig.camera.position.y)
  }
  check(
    'landing.subtle_dip',
    () => landDip < landBase - 0.03 && landDip > landBase - 0.5,
    `dip ${(landBase - landDip).toFixed(3)} m`,
  )
  settle(landRig, target, 'follow', 3, { elapsed: landElapsed })
  check(
    'landing.recovers',
    () => approx(landRig.camera.position.y, landBase, 0.02),
    'returns to the baseline',
  )
  const softRig = makeRig()
  softRig.snapTo(target, 'follow', 0)
  settle(softRig, target, 'follow', 1)
  const softBase = softRig.camera.position.y
  softRig.land(1.5)
  settle(softRig, target, 'follow', 1)
  check(
    'landing.ignores_soft_touchdown',
    () => approx(softRig.camera.position.y, softBase, 0.01),
    'no dip below the impact threshold',
  )

  const reducedRig = makeRig(16 / 9, true)
  reducedRig.snapTo(target, 'follow', 0)
  settle(reducedRig, target, 'follow', 1.5)
  const reducedBase = reducedRig.camera.position.y
  reducedRig.land(12)
  let reducedDip = reducedBase
  for (let index = 0; index < 45; index += 1) {
    reducedRig.update(DT, target, 'follow', 1.5 + index * DT, 0)
    reducedDip = Math.min(reducedDip, reducedRig.camera.position.y)
  }
  check(
    'landing.reduced_motion_scaled',
    () => {
      const fullDip = landBase - landDip
      const dip = reducedBase - reducedDip
      return dip > 0.005 && dip < fullDip * 0.6
    },
    `dip ${(reducedBase - reducedDip).toFixed(3)} m vs ${(landBase - landDip).toFixed(3)} m`,
  )

  console.log('\nMenu transitions & rotation')
  const menuRig = makeRig()
  menuRig.snapTo(target, 'menu', 0)
  const menuDistance = menuRig.distance
  const menuPosition = menuRig.camera.position.clone()
  menuRig.update(DT, target, 'follow', DT, 0)
  const transitionStep = menuRig.camera.position.distanceTo(menuPosition)
  check(
    'menu.follow_transition_smooth',
    () => transitionStep > 0 && transitionStep < 0.4,
    `first step ${transitionStep.toFixed(3)} m`,
  )
  settle(menuRig, target, 'follow', 4)
  check(
    'menu.follow_framing_reached',
    () => approx(menuRig.distance, 10.8, 0.15) && menuRig.distance > menuDistance + 0.2,
    `${menuDistance.toFixed(2)} → ${menuRig.distance.toFixed(2)} m`,
  )
  const recenterRig = makeRig()
  recenterRig.snapTo(target, 'menu', 0)
  const recenterMenuDistance = recenterRig.distance
  recenterRig.recenter(new THREE.Vector3(0, 3.36, -120), 0)
  check(
    'menu.recenter_preserves_framing',
    () =>
      approx(recenterRig.distance, recenterMenuDistance, 0.001) &&
      approx(
        recenterRig.camera.position.z,
        -120 + Math.cos(THREE.MathUtils.degToRad(10)) * recenterMenuDistance,
        0.3,
      ),
  )

  const driftRig = makeRig(16 / 9, false)
  driftRig.snapTo(target, 'follow', 0)
  settle(driftRig, target, 'follow', 1)
  const driftStart = driftRig.camera.position.x
  settle(driftRig, target, 'follow', 7, { elapsed: 1 })
  const drift = Math.abs(driftRig.camera.position.x - driftStart)
  check('rotation.ambient_drift', () => drift > 0.08 && drift < 0.6, `${drift.toFixed(3)} m`)

  const stillRig = makeRig(16 / 9, true)
  stillRig.snapTo(target, 'follow', 0)
  settle(stillRig, target, 'follow', 1)
  const stillStart = stillRig.camera.position.x
  settle(stillRig, target, 'follow', 7, { elapsed: 1 })
  check(
    'rotation.reduced_motion',
    () => Math.abs(stillRig.camera.position.x - stillStart) < 0.01,
    'ambient yaw disabled',
  )
  stillRig.shake(1, 1)
  stillRig.update(DT, target, 'follow', 8, 0)
  check(
    'shake.reduced_motion',
    () => {
      const reference = makeRig(16 / 9, true)
      reference.snapTo(target, 'follow', 0)
      settle(reference, target, 'follow', 8)
      return approx(stillRig.camera.position.x, reference.camera.position.x, 0.01)
    },
    'shake ignored',
  )

  console.log('\nLevel sections & bounds')
  const sectionAt = (value) => resolveCameraSection(value).section.id
  check('section.shallows', () => sectionAt(0) === 'shallows' && sectionAt(120) === 'shallows')
  check('section.coral', () => sectionAt(200) === 'coral-reach' && sectionAt(360) === 'coral-reach')
  check(
    'section.horizon',
    () => sectionAt(420) === 'horizon-run' && sectionAt(5000) === 'horizon-run',
  )
  check('section.blends_before_boundary', () => {
    const early = resolveCameraSection(140)
    const late = resolveCameraSection(168)
    return early.blend === 0 && late.blend > 0.6 && late.next?.id === 'coral-reach'
  })
  check('section.continuous_boundary', () => {
    const before = resolveCameraSection(169.9999).framing
    const after = resolveCameraSection(170).framing
    return (
      approx(before.heightBias, after.heightBias, 1e-6) &&
      approx(before.yawBiasDegrees, after.yawBiasDegrees, 1e-6) &&
      approx(before.fovBias, after.fovBias, 1e-6)
    )
  })
  check(
    'section.tightens_bounds',
    () =>
      CAMERA_CONFIG.sections.definitions[0].bounds.lateral >
      CAMERA_CONFIG.sections.definitions[2].bounds.lateral,
  )

  const sectionRig = makeRig()
  const roamTarget = new THREE.Vector3(0, 3.36, 0)
  sectionRig.snapTo(roamTarget, 'follow', 0)
  roamTarget.x = 100
  settle(sectionRig, roamTarget, 'follow', 2, { distance: 20 })
  check(
    'bounds.shallows_lateral',
    () =>
      sectionRig.sectionId === 'shallows' &&
      Math.abs(sectionRig.camera.position.x) <= 5 + 1.4 + 0.01,
    `x ${sectionRig.camera.position.x.toFixed(2)}`,
  )
  sectionRig.snapTo(roamTarget, 'follow', 500)
  roamTarget.x = 100
  settle(sectionRig, roamTarget, 'follow', 2, { distance: 500 })
  check(
    'bounds.horizon_lateral',
    () =>
      sectionRig.sectionId === 'horizon-run' &&
      Math.abs(sectionRig.camera.position.x) <= 3.8 + 1.4 + 0.01,
    `x ${sectionRig.camera.position.x.toFixed(2)}`,
  )
  check(
    'bounds.horizon_opens_distance',
    () => sectionRig.distance > 10.8 + 1 && sectionRig.height > 7.1 + 0.6,
    `${sectionRig.distance.toFixed(2)} m / ${sectionRig.height.toFixed(2)} m`,
  )

  const floorRig = makeRig()
  const falling = new THREE.Vector3(0, 3.36, 0)
  floorRig.snapTo(falling, 'follow', 0)
  falling.y = -50
  settle(floorRig, falling, 'follow', 4)
  const floor = 2 + CAMERA_CONFIG.bounds.floorClearance
  check(
    'bounds.camera_floor',
    () => floorRig.camera.position.y >= floor - 1e-6,
    `camera y ${floorRig.camera.position.y.toFixed(2)} ≥ ${floor.toFixed(2)}`,
  )
  check(
    'bounds.look_floor',
    () => {
      const ground = new THREE.Vector3(0, 2, -4)
      const projected = project(floorRig, ground)
      return Number.isFinite(projected.y) && projected.y > -1.2
    },
    'look target stays above the deck',
  )

  console.log('\nOcclusion')
  const occlusion = new CameraOcclusion({ clearance: 0.5, minimumDistance: 2.5, boxPadding: 0 })
  const origin = new THREE.Vector3(0, 3, 0)
  const desired = new THREE.Vector3(0, 3, 10)
  const safe = new THREE.Vector3()
  const blocker = new THREE.Box3(new THREE.Vector3(-2, 1, 4), new THREE.Vector3(2, 5, 6))
  check('occlusion.without_source', () => {
    const out = new THREE.Vector3()
    const hit = occlusion.resolve(origin, desired, out)
    return hit === false && out.z === 10
  })
  occlusion.setSource(() => [blocker])
  check(
    'occlusion.pulls_camera_in',
    () => {
      const hit = occlusion.resolve(origin, desired, safe)
      return hit === true && approx(safe.z, 3.5, 0.01)
    },
    `boom ${safe.z.toFixed(2)} m`,
  )
  check('occlusion.clear_path', () => {
    const out = new THREE.Vector3()
    const hit = occlusion.resolve(origin, new THREE.Vector3(0, 3, 2), out)
    return hit === false && approx(out.z, 2, 1e-6)
  })
  check('occlusion.minimum_distance', () => {
    const closeBlocker = new THREE.Box3(new THREE.Vector3(-2, 1, 0.4), new THREE.Vector3(2, 5, 0.8))
    occlusion.setSource(() => [closeBlocker])
    const out = new THREE.Vector3()
    occlusion.resolve(origin, desired, out)
    return out.z >= 2.5 - 1e-6
  })
  occlusion.setSource(null)

  console.log('\nRobustness')
  const robust = makeRig()
  robust.snapTo(target, 'follow', 0)
  check('robust.finite_after_stress', () => {
    let value = 0
    for (let index = 0; index < 600; index += 1) {
      value += 0.37
      const point = new THREE.Vector3(
        Math.sin(value) * 40,
        3 + Math.cos(value * 0.7) * 8,
        -value * 3,
      )
      robust.update(DT, point, index % 90 < 20 ? 'menu' : 'follow', value, value * 3)
    }
    const p = robust.camera.position
    return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
  })
  check('robust.rig_dispose', () => {
    robust.dispose()
    return true
  })

  console.log('\nConfig integrity')
  check('config.aspects', () =>
    ['landscape', 'square', 'portrait'].every((profile) => baseFraming(profile).distance > 0),
  )
  check('config.sections_ordered', () =>
    CAMERA_CONFIG.sections.definitions.every(
      (section, index, list) =>
        section.to > section.from &&
        (index === list.length - 1 || section.to === list[index + 1].from),
    ),
  )
  check('config.menu_closer_than_follow', () => {
    const base = baseFraming('landscape')
    const section = resolveCameraSection(0)
    const menu = composeFraming(base, section, 'menu')
    const follow = composeFraming(base, section, 'follow')
    return menu.distance < follow.distance && menu.lookAhead < follow.lookAhead
  })
  check(
    'config.floor_clearance',
    () => CAMERA_CONFIG.bounds.floorClearance > 0 && CAMERA_CONFIG.bounds.lookFloorClearance > 0,
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
