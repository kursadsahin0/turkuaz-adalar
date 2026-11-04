# Turkuaz Adalar

A mobile-first, endless island runner built with **Three.js**, **TypeScript**, **Vite** and **Rapier3D**. Guide a glowing tide-runner across recycled island platforms, dodge crates and coral spires, collect crystals and dash across the emerald shallows.

The project is a complete gameplay foundation rather than a static scene: it has a fixed-step simulation, streamed level segments, physics collisions, collectibles, a dash ability, procedural audio, persistent records and a full screen-flow UI.

## Run it

```bash
cd /Users/kursatsahin/Desktop/turkuaz/turkuaz-adalar
npm install
npm run dev
```

Then open the local URL printed by Vite (normally `http://localhost:5173`).

Production build and preview:

```bash
npm run build
npm run preview
```

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Change lane | `A` / `D` or `←` / `→` | Swipe left / right (one lane per swipe) |
| Jump | `Space`, `W` or `↑` | Tap, swipe up, or press **Jump** |
| Dash | `Shift` or `K` | Swipe down, or press **Dash** |
| Pause | `Esc` or `P` | Pause button in the HUD |
| Mute | `M` | Sound toggle on the menu / pause screen |

Touch controls are shown automatically on coarse-pointer devices. The layout respects safe areas and works in portrait as well as desktop browser windows.

## Architecture

```text
src/
├── main.ts                     Bootstrap, HMR teardown and fatal fallback
├── style.css                   UI tokens, screens, HUD and responsive layout
├── assets/
│   ├── AssetRegistry.ts        Central GLB manifest, categories and metadata
│   ├── AssetError.ts           Typed, actionable asset failures
│   ├── ModelLoader.ts          Progress, cache, validation, cloning and mixers
│   └── models/                 Real Blender GLB exports (character and props)
├── config/                     Gameplay tuning, palette, render and world settings
├── core/
│   ├── Game.ts                 Central state machine and fixed-step loop
│   ├── Renderer.ts             WebGL renderer, colour management, resizing
│   ├── SceneManager.ts         Scene ownership and disposal
│   └── Time.ts                 Frame clock and fixed-step accumulator
├── game/
│   ├── abilities/              Dash state machine
│   ├── camera/                 Isometric rig, framing math and occlusion guard
│   ├── collectibles/           Crystal spawning and pickup checks
│   ├── levels/                 Level data, catalog and difficulty ramp
│   ├── obstacles/              Static obstacle spawning and collider lookup
│   ├── platforms/              Recycled island segments, platform and island assets
│   ├── player/                 Lane controller, kinematic character, GLB attachment and animator
│   └── world/                  Sky, lighting, ocean and world composition
        ├── World.ts            Composition root wiring every world layer
        ├── WorldAssets.ts      Shared GPU resource bundle and teardown order
        ├── Environment.ts      Gradient sky, sun rig and cloud banks
        ├── Ocean.ts            Animated turquoise ocean and shoreline surf
        ├── geometry/           Vertex-colour geometry merge helper
        ├── islands/            Floating islands, checker pads, horizon silhouettes
        ├── vegetation/         Palms, trees, bushes, grass, flowers and rocks
        └── waterfalls/         Animated waterfall shader and foam rings
├── systems/
│   ├── audio/                  Procedural WebAudio feedback and ambience
│   ├── input/                  Unified keyboard and pointer input
│   ├── physics/                Thin Rapier wrapper
│   ├── progression/            Best scores, distance and crystal totals
│   └── save/                   Versioned localStorage envelope
├── ui/
│   ├── components/             Reusable buttons and icon buttons
│   ├── hud/                    In-run statistics and touch controls
│   ├── screens/                Loading, menu, pause, game-over and error
│   ├── UIManager.ts            Screen transitions and mute state
│   └── format.ts               Shared number formatting
└── utils/                      Math, random, events, errors and disposal
```

### Game loop

`Game` owns the lifecycle:

1. The loading screen appears immediately.
2. Rapier initialises asynchronously.
3. The renderer, scene, camera, world, player and input systems are created.
4. A single `requestAnimationFrame` loop runs the state machine:
   - **menu** — camera drifts around the idle runner while the ocean animates.
   - **playing** — input is consumed, simulation advances in fixed 1/60 s steps, then visuals and the camera update once per frame.
   - **paused** — simulation and rendering updates freeze; the pause overlay is shown.
   - **gameover** — the run is recorded once, a short impact beat plays, then the summary appears.
   - **error** — unrecoverable failures show a reload screen.

### World streaming

Island segments are created once and teleported forward when they fall behind the runner. Each recycled segment clears its old obstacles and crystals, then repopulates them from a deterministic seed. The player is a kinematic Rapier capsule moved by Rapier's character controller; obstacle colliders are mapped back to gameplay obstacles by collider handle.

The decorative archipelago uses the same idea: ten floating islands and five checker pads are built once and recycled behind the camera. They are scenery only and never create colliders, so they cannot invite impossible jumps. Distant horizon silhouettes are unlit and follow the runner, giving permanent depth without any per-frame spawning.

### Movement

The runner advances automatically along `-Z` at the level's current speed. Three logical lanes sit at `track.lanePositions` (`-2.7 / 0 / 2.7` m), and movement is split into three clean layers:

- **`InputManager`** — pure intent. Keyboard keys and pointer gestures produce at most one queued lane step, one jump and one dash; it never touches physics or lane state.
- **`LaneController`** — pure arithmetic. It owns the committed lane, lateral velocity and acceleration curve. `requestLane(±1)` moves exactly one lane and clamps at the edges; `step(currentX, grounded, delta)` returns the lateral displacement for the frame, easing into the centre with `arrivalGain` and snapping at `snapDistance`.
- **`Player`** — integration. It reads the lane displacement, combines it with jump/forward motion and hands the total to Rapier's kinematic character controller.

Lane changes are responsive but never teleport: lateral speed accelerates toward `changeSpeed`, clamps at the target centre and stops without overshoot. Airborne control is a fraction (`airControl`) of ground speed. A horizontal swipe fires as soon as it crosses the threshold and then locks for the rest of the gesture, so one swipe can never skip two lanes. Keyboard repeats are ignored, and up to four discrete steps can be buffered.

Jump height is configured directly as `player.jumpHeight`; launch speed is derived from gravity (`sqrt(2 · |g| · height)`), so tuning the height never changes the arc shape. Coyote time and a short jump buffer keep inputs forgiving, while an airborne jump press is ignored (no double jump). Touchdown fires `onLand(impactSpeed)` once, which drives the landing animation and camera dip.

All movement runs on the fixed timestep (`timing.fixedDelta`), so speed and lane timing are frame-rate independent. The capsule (`r 0.36 / half-height 0.42`) is clamped to the deck and driven through Rapier, so it cannot fall through the platform or leave the lane corridor.

### Camera

`src/game/camera/` contains a modular, elevated 3/4 camera:

- **`IsometricCameraRig`** — owns the `PerspectiveCamera`, follow damping, mode blending, impulses and bounds. It reads the runner's position, travelled distance and mode; it never owns game state.
- **`CameraFraming`** — pure functions for aspect profiles, section resolution, framing composition and damping. Easy to unit test and reuse.
- **`CameraOcclusion`** — ray/box boom shortening against pooled track volumes, so a platform can never sit between the character and the lens.

The rig sits roughly 10.8 m behind and 7.1 m above the runner in landscape (pitch ≈ 33°), with a small diagonal yaw that reveals the world's depth. Portrait pulls back to 12.2 m / 7.9 m with a wider FOV so the character and track stay in frame. Menu framing is closer and looks less far ahead; switching between menu and gameplay blends at a slower lambda instead of cutting.

- **Follow** — X/Y and the pivot use exponential damping, while the running axis follows the runner exactly. That removes speed-dependent framing drift and visible jitter. Upward target motion (a jump) is absorbed slowly so the runner visibly rises in frame, while falling follows faster to keep it visible.
- **Adjustable** — `setDistance`, `adjustDistance`, `setHeight` and `adjustHeight` clamp to `CAMERA_CONFIG.bounds`; overrides survive aspect and section changes until cleared.
- **Rotation** — a slow ambient yaw (±1.3° gameplay, ±2.8° menu) plus a gentle steer toward the player's side of the track. Both are disabled or scaled under reduced motion.
- **Jump / landing** — `jump()` adds a small boom lift, look rise and roll; `land(impactSpeed)` adds a subtle dip scaled by real touchdown speed above 3 m/s.
- **Sections** — `shallows` (0–170 m), `coral-reach` (170–390 m) and `horizon-run` (390 m+) blend their distance, height, look-ahead, yaw, FOV and lateral bounds over the last 26 m before each boundary.
- **Safety** — a hard floor keeps the camera above the deck, section bounds cap lateral travel/height, and occlusion shortens the boom when a track volume blocks the view.
- **Reduced motion** — ambient yaw and shake are off; jump and landing offsets are scaled to 35%.

All tuning lives in `src/config/CameraConfig.ts`; there is no camera math in gameplay code. `Game` feeds `distance` each frame, wires `Player.onJump`/`onLand`, exposes `World.cameraOccluders()`, and calls `recenter` (translation only) when a run restarts so framing blends instead of gliding across the map.

### Art direction

The environment is a single, friendly toy-like archipelago:

- **Track** — an inset white/turquoise checker surface, a rounded white rim, a turquoise under-trim, yellow pinstripe studs and two rotating yellow gear mechanisms per segment.
- **Islands** — grass banks, a soft sand terrace and a faceted rock keel, decorated with palms, round trees, pines, bushes, flowers and stylised boulders.
- **Water** — an animated turquoise ocean with layered swells, crest foam, sun glitter and surf that hugs the island edge.
- **Waterfalls** — a shared animated waterfall shader with a curved fall and additive foam ring, reused by track segments and floating islands.
- **Atmosphere** — gradient sky, a warm haze band, two layers of drifting low-poly clouds and muted distant islands.

Every colour is centralised in `src/config/Palette.ts`, and environment tuning (platform proportions, island sizes, scenery gaps, waterfall sizes, cloud heights) lives in `src/config/WorldConfig.ts`. Gameplay values remain in `GameConfig.ts`.

### Performance

- Loose primitives for each asset are merged into a single vertex-coloured geometry, so a whole platform frame, gear mechanism, cloud or floating island is one draw call.
- `WorldAssets` creates checker textures, vegetation, terrain variants and waterfall shaders once and shares them across the streamed track, scenery and horizon.
- Recycling only rewrites transforms and colliders; no geometry or material allocation happens during a run.
- Shadows are cast only by meaningful silhouettes, the shadow camera is tight around the runner and the pixel ratio is capped at 2.
- All scattered asset building is ready to be replaced by Blender GLB exports without touching gameplay code.

### Persistence

`SaveManager` wraps `localStorage` in a versioned envelope and degrades gracefully when storage is unavailable. `ProgressionManager` keeps the best score, farthest distance, total runs and total crystals between sessions. Mute state is stored separately by `AudioManager`.

### Rendering

- ACES filmic tone mapping, sRGB output and PCF shadows.
- A gradient sky shader with a sun disc, warm haze and two drifting cloud layers.
- An animated ocean shader with layered waves, fresnel shading, sun glitter and shoreline surf.
- Distance fog bridges the streamed archipelago and the muted horizon islands.
- Poster-sized mobile HUD scaled with CSS custom properties.
- Pixel ratio capped at 2 for predictable mobile performance.
- Reduced-motion preferences disable UI animation, ambient camera rotation and camera shake, and scale jump/landing feedback to 35%.

### Assets

World scenery is still generated procedurally, while characters and reusable props are authored in Blender and loaded as GLB. The character, the crate and coral-spire obstacles and the relic-token crystal are used in gameplay; each prop falls back to its procedural version if its GLB fails to load. The tide beacon is registered and validated but not placed yet.

Cosmetics bought on the Characters screen are applied live: skins recolour the jacket, colours the coral/gold accents, outfits the shorts and trims, and accessories (cap, goggles, bandana, bedroll, wings) are fitted to the head, neck and chest bones from bind-pose measurements, so they follow every animation.

```text
src/assets/models/
├── turkuaz_runner.glb     22-bone character, 11 clips
├── environment/           tide beacon
├── obstacles/             crate, coral spire
└── collectibles/          tide crystal
```

`AssetRegistry.ts` is the single manifest. Each entry declares an id, category, label, real URL, `required` flag and metadata:

```ts
const model = await loader.load('character.turkuaz', {
  onProgress: ({ ratio }) => loadingScreen.setProgress(ratio),
})

const instance = model.createInstance()      // SkeletonUtils clone + own skeleton
const mixer = instance.createMixer()         // one AnimationMixer per clone
const crate = loader.get('obstacle.crate')?.createInstance()
```

- **Cache** — a URL is parsed once; repeated `load` calls share the same template. Clones share geometry, materials and clips, but never skeletons, mixers or transforms.
- **Safe cloning** — `SkeletonUtils.clone` rebuilds bones and skin bindings, so animated models never alias each other.
- **Progress** — `load(..., { onProgress })` reports streamed bytes; `prefetchCategory` / `prefetch` aggregate progress across concurrent loads.
- **Graceful failures** — `loadSafe` returns `null` and logs a precise warning with the asset id, URL and fix. `load` rejects with an `AssetError` (`ASSET_NOT_REGISTERED`, `ASSET_FETCH_FAILED`, `ASSET_INVALID`, `ASSET_PARSE_FAILED`, `ASSET_EMPTY`).
- **No phantom assets** — every URL is created with `new URL(..., import.meta.url)` from an existing file. Vite fingerprints the binaries into `dist/assets`, and `npm run validate:assets` fails if a registered file is missing.

The character is scaled to the 1.56 m gameplay capsule, its feet are aligned to the capsule bottom, and its own `CharacterAnimator` handles Idle → Run → Jump → Fall → Land transitions with cross-fades. Win and Lose lock the controller until `Player.reset()`.

Register a new model by exporting a real GLB and adding one entry to `AssetRegistry.ts`; there is no separate asset list to keep in sync.

## Tuning

Most gameplay values live in `src/config/GameConfig.ts`:

- Track width, segment length/count, top height and lane centres.
- Player jump height, gravity, lane speed/acceleration, air control and coyote/buffer timing.
- Dash duration, cooldown and speed multiplier.
- Scoring and collectible pickup radius.
- Fixed timestep and HUD refresh interval.

Lane feel lives under `player.lane`: raise `changeSpeed` for snappier side-steps, `acceleration` for a harder launch into the change, `airControl` for more mid-air authority, and `arrivalGain` for a firmer stop at the centre. Lane centres are `track.lanePositions`; adding a fourth position extends the system automatically.

Level pacing lives in `src/game/levels/LevelCatalog.ts`. Add another `LevelDefinition` to introduce a chapter without changing gameplay systems.

## Verification

```bash
npx tsc --noEmit              # strict type check
npm run build                 # type check + production bundle
npm run validate:assets       # registry, loading, cache, clones, controller
npm run validate:character    # GLB + Three.js runtime contract
npm run validate:camera       # projection, follow, impulses, sections, occlusion
npm run validate:movement     # lanes, input gestures, jump, landing, Rapier + delta
```

`validate:movement` drives the real `LaneController`, `InputManager` and `Player` through Vite SSR. It checks the three-lane state machine, boundary clamping, smooth accelerated transitions without teleport/overshoot, ground vs air control, adjustable acceleration, lane reset and frame-rate independence; keyboard/A-D/arrow input, repeat suppression, bounded buffering, tap/up/down/horizontal swipes, one-lane-per-gesture locking, diagonal handling, pointer cancel and blur reset; then runs a real Rapier capsule through grounding, configurable jump height, single-jump enforcement, landing detection/impact speed, lane alignment, forward-speed consistency, collision with a named blocker collider, no fall-through and 60/120 Hz equivalence.

`validate:camera` drives the real rig through Vite SSR. It checks perspective projection and elevation, landscape/portrait/square framing, character visibility, smooth follow without per-frame snaps or jitter, lateral tracking, distance/height overrides and clamping, jump lift plus screen-space jump visibility, landing dip/recovery, soft-touchdown rejection, menu transitions, ambient rotation and reduced motion, section blending and bounds, the camera floor, ray/box occlusion and a 600-frame stress run.

`validate:assets` loads every registered GLB through the real pipeline (Vite SSR), including an HTTP download to exercise `FetchAssetReader`. It checks cache identity, progress monotonicity, per-clone mixers, skeleton independence, animation cross-fades and the missing/invalid/retry paths. The Blender GLBs are rebuilt with:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python blender/build_prop_assets.py
/Applications/Blender.app/Contents/MacOS/Blender -b \
  --python blender/build_character_rig.py
```

The production bundle currently includes Three.js and the Rapier WASM runtime in one main chunk; Vite reports the usual large-chunk advisory for this dependency pair.

The environment has also been exercised in headless Chrome (SwiftShader):

- Menu → play → pause within the first second → resume works.
- Crash → summary → menu → second run resets score and HUD correctly.
- 140 forced stream/recycle steps out past 3.2 km keep geometry, texture and shader counts constant (49 geometries, 5 textures, 13 programs) with no exceptions or console errors.
- Screenshot pixel checks confirm the turquoise/green/white/yellow palette, checker and mechanism details, and no black frames.
- Camera smoke runs in landscape (1280×800) and portrait (390×844), covering menu, run, jumps, a live resize and pause; both viewports render non-blank frames with no exceptions.
- Movement smoke drives the live game through `A`/`D`, arrows, Space, keyboard repeats, tap, swipe left/right/up/down, a long one-lane swipe, pause → resume, and a live portrait resize. Every lane change lands on the expected lane centre, jumps leave and return to the ground, dash activates, and no console exception is raised.
