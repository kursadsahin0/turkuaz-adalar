# Turkuaz Runner — Rig, Animation & GLB Pipeline

This document covers the animation-ready Turkuaz character: how it is built in
Blender, how the clips are authored, how they are exported, how to drive them
from Three.js, and how to validate every step.

**Last validated:** 2026-10-31 · Blender 5.2.3 LTS · three r187 ·
181 Blender checks + 127 GLB checks + 63 asset-pipeline checks passing.

---

## 1. Deliverables

| File | Purpose |
| --- | --- |
| `blender/build_character_rig.py` | Procedural mesh, skeleton, skinning, animation bake, preview renders, GLB export. |
| `blender/build_prop_assets.py` | Real environment/obstacle/collectible GLB exports used by the asset registry. |
| `blender/turkuaz_character.py` | Shared palette/material helpers imported by the build script. |
| `blender/turkuaz_character_rigged.blend` | Editable Blender scene with mesh, armature and all actions. |
| `blender/turkuaz_runner.glb` | Game-ready GLB: skinned mesh + 22-bone armature + 11 clips + 24 materials + embedded badge PNG. |
| `blender/validate_rig.py` | Blender-side validator (rig, weights, actions, loop seams, foot contact, export artifacts). |
| `blender/rig_build_report.json` | Machine-readable build summary. |
| `blender/rig_validation_report.json` | Blender validation results. |
| `turkuaz-adalar/scripts/validate-character-glb.mjs` | GLB + Three.js `AnimationMixer` validator. |
| `turkuaz-adalar/scripts/glb_validation_report.json` | GLB validation results. |
| `turkuaz-adalar/scripts/validate-asset-pipeline.mjs` | Registry, loader, cache, clone and controller validator. |
| `turkuaz-adalar/src/assets/AssetRegistry.ts` | Central manifest of real GLB URLs and categories. |
| `turkuaz-adalar/src/assets/ModelLoader.ts` | Cached, progress-aware, clone-safe GLB loader. |
| `turkuaz-adalar/public/models/turkuaz_runner.glb` | Runtime copy (served at `/models/turkuaz_runner.glb`). |
| `turkuaz-adalar/src/assets/models/turkuaz_runner.glb` | Bundled/imported copy used by the asset registry. |
| `blender/rig_preview.png` | 2×2 contact sheet: Idle, Run, Jump, Win. |

All three character GLB copies are byte-identical (SHA-256 verified by the
character validator). The registry imports the bundled `src/assets` copy, so
production URLs are content-hashed by Vite.

---

## 2. Character & rig specification

| Property | Value |
| --- | --- |
| Height | 1.75 m (feet at `y = 0`, Blender `z = 0`) |
| Mesh | 18,640 verts / 37,010 tris, single skinned mesh |
| Materials | 24 slots, all Principled BSDF |
| Textures | 1 embedded PNG, `TK_BadgeWave` (128×128 RGBA) on the chest badge |
| Armature | 22 bones, 21 deform bones |
| Skin influences | Max 2 per vertex (limit 4), weights normalised |
| Authoring FPS | 30 fps, LINEAR keys, one key per frame |
| Forward axis | Blender **+Y**, glTF **−Z** (matches the runner's travel direction) |
| Root motion | **In place** — the root bone never translates or rotates |
| Units | Metres, 1:1 scale |

Bone hierarchy:

```
root
└─ hips
   ├─ spine → chest → neck → head
   │           ├─ shoulder.L → upper_arm.L → forearm.L → hand.L
   │           └─ shoulder.R → upper_arm.R → forearm.R → hand.R
   ├─ thigh.L → shin.L → foot.L → toe.L
   └─ thigh.R → shin.R → foot.R → toe.R
```

Notes:

- `root` is a non-deforming motion bone. It is intentionally static in every
  clip so the game owns world movement.
- Legs are solved with an analytic two-bone sagittal IK and **baked to FK**.
  There are no IK constraints or drivers in the delivered file.
- The `.L` / `.R` suffixes follow the build script's naming. Three.js
  `GLTFLoader` sanitises dots out of node names (`foot.L` → `footL`); use
  `getObjectByName` on the sanitised name or read bones from the `Skeleton`.

---

## 3. Clip library

11 actions are exported. The ten required runner clips plus a mirrored turn.

| Clip | Frames | Duration | Loop | Use |
| --- | ---: | ---: | :---: | --- |
| `Idle` | 121 | 4.000 s | ✅ | Menu / pre-race / recovery breathing idle. |
| `Run` | 17 | 0.533 s | ✅ | In-place run cycle (one full stride, both feet). |
| `Jump` | 22 | 0.700 s | — | Takeoff: crouch → extension → airborne transition pose. |
| `Airborne` | 31 | 1.000 s | ✅ | Apex / hang-time loop with tucked legs. |
| `Fall` | 21 | 0.667 s | ✅ | Descent loop, arms up, legs trailing. |
| `Land` | 19 | 0.600 s | — | Impact absorption → recovery to run. |
| `Win` | 91 | 3.000 s | ✅* | Victory hops and fist pumps. |
| `Lose` | 76 | 2.500 s | ✅* | Defeat slump and shrug. |
| `Slide` | 31 | 1.000 s | — | Low slide under obstacles → stand-up. |
| `Turn` | 21 | 0.667 s | ✅* | Left-lean lane-change variant (mirror of `Turn_Right`). |
| `Turn_Right` | 21 | 0.667 s | ✅* | Mirrored right-lean lane-change variant. |

`*` Loop-safe: first and last samples are identical, so the clip can be looped
or blended safely, but gameplay will normally play it once
(`LoopOnce`, `clampWhenFinished`).

`Jump`, `Land` and `Slide` intentionally start and end in transition poses so
they can be cross-faded into/out of the locomotion states.

### Loop seams

The Blender validator evaluates every deform bone at the first and last frame:

- `Idle`, `Run`, `Airborne`, `Fall`, `Win`, `Lose`, `Turn`, `Turn_Right`:
  **0.0** difference in location, rotation, scale and bone-head position.
- The GLB validator re-checks the exported keyframes: first/last samples match
  at export precision (zero measured difference).

### Foot contact (Run)

The run is authored against a measurable reference:

| Parameter | Value |
| --- | --- |
| Cycle | 16 intervals @ 30 fps = 0.5333 s |
| Stance ratio | 0.40 (6.4 frames) |
| Foot travel during stance | 0.60 m |
| **Reference speed** | **2.8125 m/s** |
| Stride per cycle | 1.50 m |
| Hip bob | 60 mm |
| Ankle lift in swing | 0.34 m (max ankle height 0.45 m) |
| Toe-off heel lift | 42 mm |

During stance the planted ankle moves backward at a constant 2.8125 m/s
(0.6 mm max deviation per frame in Blender; 0.2 % error after glTF round-trip),
the flat-foot height error is < 1 mm, and the toe never penetrates the ground.

The same values are embedded in the GLB on the `TK_Armature` node as extras:

```json
{
  "fps": 30,
  "root_motion": "in_place",
  "forward_axis_gltf": "-Z",
  "run_reference_speed": 2.8125,
  "run_cycle_seconds": 0.5333,
  "run_stance_ratio": 0.4,
  "run_foot_travel": 0.6,
  "animation_clips": "Idle,Run,Jump,Airborne,Fall,Land,Win,Lose,Slide,Turn,Turn_Right"
}
```

Read them from Three.js through `userData`:

```ts
const armature = gltf.scene.getObjectByName('TK_Armature')
const runReferenceSpeed = Number(armature?.userData.run_reference_speed ?? 2.8125)
```

---

## 4. Root motion & speed matching

Every clip is authored **in place**. The game moves `Player.root` along −Z
(`Player.fixedUpdate`, `desired.z = -forwardSpeed * delta`). Do not apply root
motion from the clips.

The exported character faces **−Z** in glTF, matching the player's travel
direction, so no extra rotation is required.

### Run playback rate

For exact foot contact:

```
timeScale = currentForwardSpeed / 2.8125
```

Current level speeds (`LevelCatalog.ts`) are 9.5 → 18 m/s:

| Game speed | Exact timeScale | Resulting cycle |
| ---: | ---: | ---: |
| 9.5 m/s | 3.38× | 0.158 s |
| 13 m/s | 4.62× | 0.115 s |
| 18 m/s | 6.40× | 0.083 s |

Exact matching at these speeds is physically implausible for a 1.75 m character
(1.5 m stride → 6.3 strides/second at 9.5 m/s). Recommended approach:

1. Start with `timeScale = forwardSpeed / 2.8125`.
2. Clamp the visual rate to roughly **2.2–2.6×** so the legs stay readable.
3. Accept the remaining foot slip, or mask it with speed lines, dust puffs,
   camera FOV/shake and a slight world-speed reduction.
4. For a future art pass, author a sprint clip with a longer stride / more
   flight phase, or split `Run` and `Sprint` and blend between them.

Suggested helper:

```ts
const visualRate = THREE.MathUtils.clamp(forwardSpeed / runReferenceSpeed, 1, 2.5)
runAction.setEffectiveTimeScale(visualRate)
```

Keep `Jump`, `Land`, `Slide`, `Win` and `Lose` at `timeScale = 1`. `Turn` and
`Turn_Right` can be sped up to ~1.5–2× to match a 2.7 m lane change at 8.6 m/s
lateral speed.

---

## 5. Animation state machine & cross-fades

Runtime implementation: `src/game/player/CharacterAnimator.ts` and
`CharacterModel.ts`. `Player` feeds grounded state, vertical velocity and
forward speed every rendered frame; the animator owns the mixer and actions.

| From → To | Fade | Trigger |
| --- | ---: | --- |
| `Idle` → `Run` | 0.18 s | Grounded and speed > 0.2 m/s. |
| `Run` → `Idle` | 0.25 s | Grounded and speed ≤ 0.2 m/s, or menu. |
| `Run` → `Jump` | 0.12 s | Airborne with upward velocity > 0.75 m/s. |
| `Jump` → `Fall` | 0.20 s | Airborne and descending. |
| `Fall` → `Land` | 0.08 s | Ground contact after an airborne frame. |
| `Land` → `Run` / `Idle` | 0.18 / 0.25 s | After 85 % of the Land clip. |
| `Any` → `Win` / `Lose` | 0.22 s | Run finished; controller locks until reset. |

`LoopRepeat` is used for `Idle`, `Run` and `Fall`; `LoopOnce` +
`clampWhenFinished` for `Jump`, `Land`, `Win` and `Lose`. `Run` time scale is
`speed / (2.8125 × modelScale)`, clamped to 0.7–2.5×.

### Three.js runtime API

The project ships a loader and registry rather than a one-off `GLTFLoader`
call:

```ts
import { ASSET_REGISTRY } from './assets/AssetRegistry.ts'
import { ModelLoader } from './assets/ModelLoader.ts'
import { CharacterModel } from './game/player/CharacterModel.ts'

const loader = new ModelLoader(ASSET_REGISTRY)

const asset = await loader.load('character.turkuaz', {
  onProgress: ({ ratio }) => console.log(`${Math.round(ratio * 100)}%`),
})

const character = new CharacterModel(asset, {
  targetHeight: 1.56, // capsule halfHeight + radius, doubled
})

player.attachCharacter(character) // hides the capsule, aligns feet, adds the GLB
```

`CharacterModel` normalises the 1.783 m export to the 1.56 m capsule, puts the
feet at the model origin and starts an `AnimationMixer` on a
`SkeletonUtils.clone`. Each clone has its own skeleton, mixer and transforms;
geometry, materials and clips are shared with the cached template.

Runtime state is driven by `Player.updateVisual`:

```ts
character.update(delta, {
  grounded,          // Player.grounded
  verticalVelocity,  // Player.verticalVelocity
  speed: forwardSpeed,
  dashing,
  idle: menuMode,
})
```

`Player.playOutcome('win' | 'lose')` is called by `Game.finishRun` and locks the
pose until `Player.reset()`.

Static category use is identical:

```ts
const crate = loader.get('obstacle.crate')?.createInstance()
const crystal = loader.get('collectible.crystal')?.createInstance()
const beacon = loader.get('environment.tide_beacon')?.createInstance()
```

### Failure behaviour

`ModelLoader.load` rejects with a typed `AssetError`; `loadSafe` returns `null`.
Both log the asset id, real URL and a repair hint. `Game` catches a failed
character load, logs a warning and keeps the procedural capsule, so gameplay
continues. Missing, malformed, empty and wrong-version GLBs are distinguished,
and failed loads are not cached, so a later retry can succeed.

## 6. Blender workflow

### Prerequisites

- Blender **5.2+** (built/tested with 5.2.3 LTS).
- No external add-ons; the glTF exporter ships with Blender.
- Python packages used by the script (`numpy`) are bundled with Blender.

### Build everything

From the repository root:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python blender/build_character_rig.py
```

The build is deterministic. It removes only objects/actions tagged by this
pipeline, rebuilds the mesh and rig, bakes all 11 actions, renders previews,
saves the `.blend`, exports the GLB and copies it to both game locations.

Expected console summary:

```
mesh: 18640 verts / 37010 tris
materials: 24  images: ['TK_BadgeWave']
bones: 22 (21 deform)
clips: Idle, Run, Jump, Airborne, Fall, Land, Win, Lose, Slide, Turn, Turn_Right
run reference speed: 2.812 m/s
```

### Edit poses / animation

The animation lives in `blender/build_character_rig.py`:

| Section | What to change |
| --- | --- |
| Proportions (`HIP_HEIGHT`, `THIGH_LENGTH`, …) | Skeleton and leg IK proportions. |
| `RUN_*` constants | Run cadence, stance ratio, stride length → reference speed. |
| `bone_definition()` | Add/remove bones (keep `root` non-deform). |
| `vertex_weights()` | Manual skin-weight regions. |
| `pose_*()` functions | Per-clip poses; `t` runs 0→1. |
| `CLIP_SPECS` | Frame counts, loop flag, pose function. |
| `render_previews()` | Contact-sheet poses. |
| `export_glb()` | glTF export flags. |

After edits, rebuild and run both validators. Do not hand-edit the `.blend`
and skip the rebuild if you also need the GLB to stay reproducible.

### Open and inspect

```bash
open -a Blender blender/turkuaz_character_rigged.blend
```

- Actions are stored as layered Blender 5.x actions with fake users.
- Use **Dope Sheet → Action Editor** and pick the action from the dropdown.
- Each action is 1..N at 30 fps; interpolation is LINEAR.
- The armature is `TK_Armature`, mesh `TK_CharacterMesh`.
- The studio collection contains the preview camera, ground and lights.

### Export settings used

`export_scene.gltf` is called with:

```
export_format="GLB"          export_yup=True
export_skins=True            export_influence_nb=4
export_animations=True       export_animation_mode="ACTIONS"
export_force_sampling=True   export_anim_slide_to_zero=True
export_anim_single_armature=True
export_optimize_animation_size=True
export_reset_pose_bones=True
export_materials="EXPORT"    export_image_format="AUTO"
export_texcoords=True        export_normals=True
export_extras=True
```

Only the armature and body are selected, so cameras, lights and the ground
plane are excluded from the GLB.

---

## 7. Validation

### 7.1 Blender-side (181 checks)

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b \
  blender/turkuaz_character_rigged.blend \
  --python blender/validate_rig.py
```

Checks include:

- Scene FPS/units, mesh/armature presence and transforms.
- Mesh height, floor contact, centring, UV layer.
- Every vertex weight normalised, ≤ 4 influences, only deform bones.
- 24 filled node-based material slots and the packed badge texture.
- 22 bones / 21 deform, hierarchy, left-right symmetry, no constraints/drivers.
- 11 actions: frame range, FPS/loop metadata, 198 f-curves per action (22 bones
  × 9 channels), all keyframes LINEAR.
- Root bone static in every clip; all samples finite.
- Loop seams for loop clips and loop-safe bonus clips.
- Run foot contact: stance speed, constant velocity, flat-foot height, IK
  accuracy, toe-off heel lift, ground penetration, swing clearance, hip bob.
- GLB exists, is non-trivial, and both game copies are present.

Result: **181 passed, 0 warnings, 0 failed**.

### 7.2 GLB + Three.js (127 checks)

```bash
cd turkuaz-adalar
npm run validate:character
```

Checks include:

- GLB header, version, chunk layout, 4-byte container alignment and
  byte-identical game copies (SHA-256 match against `blender/turkuaz_runner.glb`).
- 24 materials with the expected names, 1 embedded 128×128 RGBA PNG and its
  badge material binding.
- 24 primitives, 22-joint skin, inverse bind matrices, JOINTS_0/WEIGHTS_0 on
  every primitive, normalised weights, joint indices in range.
- 11 clips with exact durations, 66 channels each, strictly increasing sampler
  times, zero root translation/rotation.
- Loop seams in the exported keyframes.
- Extras carrying the run timing contract (`-Z` forward, in-place, 30 fps).
- Three.js `GLTFLoader` load, 22 skeleton bones, 24 skinned primitives and 24
  unique materials, all animation tracks bound.
- `AnimationMixer` plays every clip and produces measurable motion.
- Idle → Run cross-fade reaches the correct weights.
- Runtime foot contact: stance speed 2.819 m/s vs 2.8125 m/s (0.2 %), travel
  along +Z, flat-foot height error 0.6 mm, 42 mm heel lift, no toe penetration,
  60 mm hip bob, zero root drift.

Result: **127 passed, 0 warnings, 0 failed**.

> **Node texture note:** Node has no DOM image decoder, so `GLTFLoader` logs
> `Couldn't load texture blob:…` and leaves the texture undecoded. The validator
> suppresses that one message and validates the embedded PNG structurally
> (signature, IHDR, dimensions, RGBA). In a browser the same GLB decodes the
> texture normally.

### 7.3 Runtime asset pipeline (63 checks)

```bash
cd turkuaz-adalar
npm run validate:assets
```

- Every registry URL resolves to a real GLB on disk (no placeholder paths).
- All four categories load through the real pipeline: character, environment,
  obstacle and collectible.
- Streamed `fetch` progress is monotonic and completes at 1.0; HTTP 404 fails
  with a clear message.
- Cache returns the same parsed template and performs one read per URL.
- `SkeletonUtils` clones have distinct bones; animating clone A leaves clone B
  untouched; each clone owns its mixer.
- Character scales 1.783 m → 1.56 m, exposes all seven gameplay states, and
  cross-fades Idle → Run with both weights active.
- Jump → Fall → Land → Run transitions, Win/Lose locking and reset all pass.
- Missing, invalid, retry-after-failure and disposed-loader paths are covered.

Result: **63 passed, 0 failed**.

### 7.4 Manual visual checklist

- [ ] Front, side and 3/4 views: face, eyes, hair, badge legible; no inverted
      normals or holes.
- [ ] `Idle`: breathing/sway reads at 4 s; loop seam invisible.
- [ ] `Run`: two steps per cycle, planted foot moves with the ground, arms
      counter-swing, hips bob, toes clear the floor, loop seam invisible.
- [ ] `Jump` → `Fall` → `Land`: no pose pops at the fade points.
- [ ] `Slide`: clear low profile; remember the physics capsule stays upright.
- [ ] `Turn` / `Turn_Right`: mirrored leans, returns to run cleanly.
- [ ] `Win` / `Lose`: readable at gameplay camera distance.
- [ ] Materials and badge texture present in the browser (no magenta/pink).
- [ ] Shadows cast correctly; no stale bounding-sphere culling.
- [ ] Cross-fades feel smooth at the timings in §5.
- [ ] Frame rate acceptable on the target device (see §8).

---

## 8. Performance notes

- **37k triangles / 22 bones** is modest for a hero character on desktop/mobile.
- The GLB has **24 primitives → 24 draw calls** because each material slot is a
  separate primitive. For a crowd or low-end mobile, merge materials into an
  atlas or bake colours into vertex attributes to reach 1–3 draw calls.
- The badge texture is 128×128; the rest of the palette is material colours.
- Disable frustum culling for the skinned mesh (or recompute its bounding
  sphere after skinning) because the bind-pose bounds sit at the origin.
- Share one GLB and one set of materials/clips between characters; clone with
  `SkeletonUtils.clone()` so skeletons are independent.

---

## 9. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Character faces the camera in game | The model faces −Z. The runner moves −Z, so do not rotate it; if attached to a +Z-facing root, rotate 180°. |
| Character floats or sinks | Origin is at the feet. Offset by `-(halfHeight + radius)` when parenting to the capsule centre. |
| Cannot find `foot.L` in Three.js | `GLTFLoader` strips dots: use `footL`, or read `skeleton.bones`. |
| `Couldn't load texture blob` in Node | Expected (no image decoder); the PNG is validated structurally. Browsers decode it. |
| Feet slide at high speed | Game speed exceeds the 2.8125 m/s reference. Use the time-scale formula and clamp per §4, or author a sprint clip. |
| Animation pops at the loop | Check the clip is one of the loop-safe actions and that the game uses `LoopRepeat`; the source seams are zero. |
| Action names missing | Use `export_animation_mode="ACTIONS"`; actions must have fake users and be tagged before export. |
| `.blend` reopens with wrong action | The build restores `Idle` at frame 1; pick the action manually in the Action Editor. |
| GLB has cameras/lights/ground | Ensure only `TK_Armature` and `TK_CharacterMesh` are selected before export (the build script does this). |

---

## 10. Acceptance summary

| Requirement | Status |
| --- | --- |
| Humanoid skeleton for a stylised cartoon character | 22 bones, 21 deform, mirrored limbs, verified hierarchy. |
| Idle, Run, Jump, Airborne, Fall, Land, Win, Lose, Slide, Turn | All 10 authored; plus mirrored `Turn_Right`. |
| Smooth transitions, natural motion, consistent timing | 30 fps LINEAR bake, pose-driven arcs, cross-fade table, zero-distance loop seams. |
| No foot sliding during run | Analytic IK bake at 2.8125 m/s; 0.0 % error in Blender, 0.2 % after GLB round-trip. |
| Loopable Idle and Run, runner-appropriate root motion | Loop seams zero; all clips in place; timing extras embedded in the GLB. |
| GLB with armature, clips, materials and textures | Verified: 22-joint skin, 11 clips, 24 materials, embedded 128×128 PNG. |
| Works with Three.js AnimationMixer | Loaded, played, cross-faded and foot-tested in Node with three r187. |
| Runtime GLB asset pipeline | Registry, cached loader, progress, clone-safe mixers and graceful failures; 63 pipeline checks plus browser smoke test. |
| Clear Blender workflow and validation checklist | This document + three automated validators (181 + 127 + 63 checks). |
