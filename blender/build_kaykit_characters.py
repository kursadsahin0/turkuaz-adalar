#!/usr/bin/env python3
"""
Turkuaz Adalar - runner characters from the KayKit Adventurers pack.

Builds the game's character GLB from Kay Lousberg's KayKit : Adventurers
Character Pack 1.0 (CC0, https://kaylousberg.com). The pack's characters share
one 41-joint rig, so the three runners are bound to a single armature and the
game shows one of them at a time:

    runner  <- Rogue          (tunic recoloured turquoise)
    swift   <- Rogue_Hooded   (tunic recoloured crimson)
    ocean   <- Barbarian      (shirt recoloured ocean blue)
    mage    <- Mage + hat     (coat recoloured sea blue, turquoise cape)
    sage    <- Mage, no hat   (coat recoloured coral, sand cape)
    knight  <- Knight + helm  (turquoise cape)
    guardian<- Knight, no helm (gold cape)

Weapons, shields, hats and mugs are dropped. The animation clips the game
uses are renamed to its contract (Idle, Run, Jump, Airborne, Fall, Land, Win,
Lose, Slide, Hit) and the rest are removed.

Run with:
    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \\
        --python blender/build_kaykit_characters.py --python-exit-code 1

The pack's source GLBs live in blender/kaykit_source/ (pass another folder
after `--` to use a different copy).

Output:
    blender/turkuaz_character.blend   the three runners, one collection each
    blender/turkuaz_runner.glb        the game asset, also copied to
                                      turkuaz-adalar/src/assets/models/
    blender/kaykit_preview.png, blender/kaykit_build_report.json

The earlier procedural character is kept in blender/legacy/.
"""

from __future__ import annotations

import json
import math
import shutil
import sys
from pathlib import Path

import bpy
import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
GAME_ROOT = SCRIPT_DIR.parent / "turkuaz-adalar"
SOURCE_DIR = SCRIPT_DIR / "kaykit_source"
BLEND_PATH = SCRIPT_DIR / "turkuaz_character.blend"
GLB_PATH = SCRIPT_DIR / "turkuaz_runner.glb"
GAME_GLB_PATHS = [
    GAME_ROOT / "src" / "assets" / "models" / "turkuaz_runner.glb",
]
PREVIEW_PATH = SCRIPT_DIR / "kaykit_preview.png"
REPORT_PATH = SCRIPT_DIR / "kaykit_build_report.json"

#: Game clip name -> KayKit clip name.
CLIPS = {
    "Idle": "Idle",
    "Run": "Running_A",
    "Jump": "Jump_Start",
    "Airborne": "Jump_Idle",
    "Fall": "Jump_Idle",
    "Land": "Jump_Land",
    "Win": "Cheer",
    "Lose": "Death_A",
    "Slide": "Dodge_Forward",
    "Hit": "Hit_A",
    # Each runner's own celebration (Win stays the shared default: Cheer).
    "Win_swift": "Jump_Full_Short",
    "Win_ocean": "Unarmed_Melee_Attack_Punch_A",
    "Win_mage": "Spellcast_Raise",
    "Win_sage": "Spellcast_Shoot",
    "Win_knight": "Unarmed_Melee_Attack_Kick",
}

#: Texture atlas cells (row from the top, column), 8 x 4 swatches.
CELL_COLUMNS = 8
CELL_ROWS = 4

MAGE_BODY = ["Mage_Head", "Mage_Body", "Mage_ArmLeft", "Mage_ArmRight", "Mage_LegLeft", "Mage_LegRight"]
KNIGHT_BODY = [
    "Knight_Head",
    "Knight_Body",
    "Knight_ArmLeft",
    "Knight_ArmRight",
    "Knight_LegLeft",
    "Knight_LegRight",
]

#: variant -> (source GLB, body meshes, bone-parented props, recolours {cell: hex}).
VARIANTS = {
    "runner": (
        "Rogue.glb",
        ["Rogue_Head", "Rogue_Body", "Rogue_ArmLeft", "Rogue_ArmRight", "Rogue_LegLeft", "Rogue_LegRight"],
        ["Rogue_Cape"],
        {(1, 0): 0x139C93, (1, 1): 0x35D3C4},
    ),
    "swift": (
        "Rogue_Hooded.glb",
        ["Rogue_Head_Hooded", "Rogue_Body", "Rogue_ArmLeft", "Rogue_ArmRight", "Rogue_LegLeft", "Rogue_LegRight"],
        ["Rogue_Cape"],
        {(1, 0): 0xB82E3C, (1, 1): 0xE2574F},
    ),
    "ocean": (
        "Barbarian.glb",
        [
            "Barbarian_Head",
            "Barbarian_Body",
            "Barbarian_ArmLeft",
            "Barbarian_ArmRight",
            "Barbarian_LegLeft",
            "Barbarian_LegRight",
        ],
        ["Barbarian_Cape"],
        {(1, 0): 0x2A6E9E, (1, 1): 0x3F8CC2, (2, 2): 0x2A6E9E},
    ),
    "mage": (
        "Mage.glb",
        MAGE_BODY,
        ["Mage_Cape", "Mage_Hat"],
        {(1, 0): 0x1F5F8B, (1, 1): 0x1F5F8B, (1, 2): 0x2EC4B6},
    ),
    "sage": (
        "Mage.glb",
        MAGE_BODY,
        ["Mage_Cape"],
        {(1, 0): 0xD9604A, (1, 2): 0xF2B36B},
    ),
    "knight": (
        "Knight.glb",
        KNIGHT_BODY,
        ["Knight_Cape", "Knight_Helmet"],
        {(1, 0): 0x1FB5A8},
    ),
    "guardian": (
        "Knight.glb",
        KNIGHT_BODY,
        ["Knight_Cape"],
        {(1, 0): 0xE8A82E},
    ),
}

TEXTURE_SIZE = 512


def log(message: str) -> None:
    print(f"[kaykit] {message}", flush=True)


def srgb_to_linear(value: np.ndarray) -> np.ndarray:
    return np.where(value <= 0.04045, value / 12.92, ((value + 0.055) / 1.055) ** 2.4)


def hex_rgb(color: int) -> np.ndarray:
    return np.array([(color >> 16) & 255, (color >> 8) & 255, color & 255], dtype=np.float64) / 255.0


def recolour(image: bpy.types.Image, cells: dict[tuple[int, int], int]) -> None:
    """Tints atlas cells to a target colour, keeping each cell's gradient."""
    width, height = image.size
    pixels = np.array(image.pixels[:], dtype=np.float64).reshape(height, width, 4)
    # Blender stores rows bottom-up; atlas rows are counted from the top.
    for (row, col), target in cells.items():
        x0, x1 = col * width // CELL_COLUMNS, (col + 1) * width // CELL_COLUMNS
        y1 = height - row * height // CELL_ROWS
        y0 = height - (row + 1) * height // CELL_ROWS
        block = pixels[y0:y1, x0:x1, :3]
        luma = block @ np.array([0.2126, 0.7152, 0.0722])
        mean = max(float(luma.mean()), 1e-4)
        ratio = np.clip(luma / mean, 0.0, 2.0)[..., None]
        pixels[y0:y1, x0:x1, :3] = np.clip(hex_rgb(target)[None, None, :] * ratio, 0.0, 1.0)
    image.pixels.foreach_set(pixels.ravel().astype(np.float32))
    image.update()


def import_variant(source: Path) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(source))
    new = [obj for obj in bpy.data.objects if obj not in before]
    rig = next(obj for obj in new if obj.type == "ARMATURE")
    return rig, new


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    source_dir = Path(argv[0]).resolve() if argv else SOURCE_DIR

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 30

    main_rig: bpy.types.Object | None = None
    report: dict = {"variants": {}, "clips": {}}
    keep: list[bpy.types.Object] = []
    first_actions: set[bpy.types.Action] = set()

    for variant, (glb, body_names, prop_names, cells) in VARIANTS.items():
        actions_before = set(bpy.data.actions)
        rig, objects = import_variant(source_dir / glb)
        imported_actions = set(bpy.data.actions) - actions_before
        if main_rig is None:
            main_rig = rig
            main_rig.name = "TK_Armature"
            main_rig.data.name = "TK_Armature"
            first_actions = imported_actions

        by_name = {obj.name.split(".")[0]: obj for obj in objects}
        material = None
        bodies = []
        for name in body_names:
            obj = by_name[name]
            bodies.append(obj)
        # One material + recoloured texture per variant.
        base_material = bodies[0].active_material
        material = base_material.copy()
        material.name = f"TK_Kit_{variant}"
        image_node = next(n for n in material.node_tree.nodes if n.type == "TEX_IMAGE")
        image = image_node.image.copy()
        image.name = f"TK_Kit_{variant}"
        image.scale(TEXTURE_SIZE, TEXTURE_SIZE)
        recolour(image, cells)
        image.pack()
        image_node.image = image

        # Merge the body parts into one skinned mesh (one draw call).
        bpy.ops.object.select_all(action="DESELECT")
        for obj in bodies:
            obj.select_set(True)
            obj.data.materials.clear()
            obj.data.materials.append(material)
        bpy.context.view_layer.objects.active = bodies[0]
        bpy.ops.object.join()
        body = bpy.context.view_layer.objects.active
        body.name = f"TK_Char_{variant}"
        body.data.name = f"TK_Char_{variant}"
        keep.append(body)

        props = []
        for name in prop_names:
            prop = by_name.get(name)
            if prop:
                prop.name = f"TK_Char_{variant}_{name.split('_')[-1].lower()}"
                prop.data.materials.clear()
                prop.data.materials.append(material)
                props.append(prop)
                keep.append(prop)

        if rig is not main_rig:
            # Same rig in every KayKit character: rebind onto the shared one.
            for obj in [body, *props]:
                world = obj.matrix_world.copy()
                bone = obj.parent_bone if obj.parent_type == "BONE" else None
                obj.parent = main_rig
                if bone:
                    obj.parent_type = "BONE"
                    obj.parent_bone = bone
                obj.matrix_world = world
                for modifier in obj.modifiers:
                    if modifier.type == "ARMATURE":
                        modifier.object = main_rig
        report["variants"][variant] = {
            "source": glb,
            "vertices": len(body.data.vertices),
            "props": [p.name for p in props],
        }

        # Everything else from this import goes (weapons, shields, extra rigs).
        keep_names = {obj.name for obj in keep} | {main_rig.name}
        for obj in objects:
            try:
                name = obj.name
            except ReferenceError:  # merged away by join()
                continue
            if name not in keep_names:
                bpy.data.objects.remove(obj, do_unlink=True)
        for action in imported_actions - first_actions:
            bpy.data.actions.remove(action)

    assert main_rig is not None
    # Rename the clips the game uses; drop the rest.
    by_source = {action.name: action for action in first_actions}
    kept_actions = []
    for game_name, source_name in CLIPS.items():
        source = by_source.get(source_name)
        if source is None:
            raise SystemExit(f"Missing KayKit clip {source_name}")
        action = source if source not in kept_actions else source.copy()
        if action in kept_actions:
            action = action.copy()
        action.name = game_name
        action.use_fake_user = True
        kept_actions.append(action)
        report["clips"][game_name] = {
            "source": source_name,
            "frames": [round(action.frame_range[0]), round(action.frame_range[1])],
        }
        by_source[source_name] = action  # a later reuse gets a copy
    for action in list(bpy.data.actions):
        if action not in kept_actions:
            bpy.data.actions.remove(action)

    # The game runs along glTF -Z; KayKit faces +Z, so turn the rig around.
    main_rig.rotation_mode = "XYZ"
    main_rig.rotation_euler = (0.0, 0.0, math.pi)

    report["runReferenceSpeed"] = measure_run_speed(main_rig, next(a for a in kept_actions if a.name == "Run"))
    main_rig["runReferenceSpeed"] = report["runReferenceSpeed"]
    report["height"] = measure_height()
    log(f"run reference speed {report['runReferenceSpeed']:.3f} m/s, height {report['height']:.3f} m")

    render_preview(main_rig, kept_actions)
    export(main_rig)
    save_blend(main_rig, kept_actions)
    for path in GAME_GLB_PATHS:
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(GLB_PATH, path)
        log(f"copied to {path}")
    report["glbBytes"] = GLB_PATH.stat().st_size
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    log(f"report {REPORT_PATH}")


def measure_run_speed(rig: bpy.types.Object, action: bpy.types.Action) -> float:
    """Ground speed at which the planted foot does not slide."""
    rig.animation_data_create()
    rig.animation_data.action = action
    if hasattr(rig.animation_data, "action_slot") and action.slots:
        rig.animation_data.action_slot = action.slots[0]
    start, end = (int(v) for v in action.frame_range)
    samples = []
    for frame in range(start, end + 1):
        bpy.context.scene.frame_set(frame)
        bone = rig.pose.bones["foot.l"]
        world = rig.matrix_world @ bone.head
        samples.append((world.z, world.y))
    lowest = min(z for z, _ in samples)
    speeds = []
    for (z0, y0), (z1, y1) in zip(samples, samples[1:]):
        if z0 < lowest + 0.03 and z1 < lowest + 0.03:
            speeds.append(abs(y1 - y0) * bpy.context.scene.render.fps)
    return float(np.median(speeds)) if speeds else 2.5


def measure_height() -> float:
    top = 0.0
    for obj in bpy.data.objects:
        if obj.type == "MESH" and obj.name.startswith("TK_Char_"):
            for corner in obj.bound_box:
                top = max(top, (obj.matrix_world @ __import__("mathutils").Vector(corner)).z)
    return top


def render_preview(rig: bpy.types.Object, actions: list[bpy.types.Action]) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 520
    world = bpy.data.worlds.new("TK_PreviewWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.86, 0.84, 1)
    scene.world = world
    rig.animation_data.action = next(a for a in actions if a.name == "Idle")
    scene.frame_set(1)
    # Spread the three bodies out by temporarily offsetting duplicates is not
    # possible with one rig, so render each variant in turn into a strip.
    camera = bpy.data.objects.new("TK_PreviewCam", bpy.data.cameras.new("TK_PreviewCam"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.location = (0.0, -5.2, 1.0)
    camera.rotation_euler = (math.radians(88), 0.0, 0.0)
    camera.data.lens = 50
    sun = bpy.data.objects.new("TK_PreviewSun", bpy.data.lights.new("TK_PreviewSun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(45), 0.0, math.radians(25))
    scene.collection.objects.link(sun)
    scene.render.resolution_x = 320
    tiles = []
    for variant in VARIANTS:
        for obj in bpy.data.objects:
            if obj.name.startswith("TK_Char_"):
                obj.hide_render = not obj.name.startswith(f"TK_Char_{variant}")
        path = SCRIPT_DIR / f"kaykit_preview_{variant}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        tiles.append(path)
    for obj in bpy.data.objects:
        obj.hide_render = False
    # One strip, left to right: runner, swift, ocean.
    images = [bpy.data.images.load(str(path)) for path in tiles]
    strips = [np.array(image.pixels[:]).reshape(image.size[1], image.size[0], 4) for image in images]
    strip = np.concatenate(strips, axis=1)
    combined = bpy.data.images.new("TK_Preview", strip.shape[1], strip.shape[0], alpha=True)
    combined.pixels.foreach_set(strip.ravel().astype(np.float32))
    combined.filepath_raw = str(PREVIEW_PATH)
    combined.file_format = "PNG"
    combined.save()
    for image in [*images, combined]:
        bpy.data.images.remove(image)
    for path in tiles:
        path.unlink()
    log(f"preview {PREVIEW_PATH}")
    for obj in (camera, sun):
        bpy.data.objects.remove(obj, do_unlink=True)


def save_blend(rig: bpy.types.Object, actions: list[bpy.types.Action]) -> None:
    """Saves an editable .blend: one collection per runner, the runner shown."""
    scene = bpy.context.scene
    # The glTF importer's holding collection for skipped nodes is empty here.
    for leftover in [c for c in bpy.data.collections if c.name.startswith("glTF_not_exported")]:
        bpy.data.collections.remove(leftover)
    for variant in VARIANTS:
        collection = bpy.data.collections.new(f"TK_{variant.capitalize()}")
        scene.collection.children.link(collection)
        for obj in bpy.data.objects:
            if obj.name == f"TK_Char_{variant}" or obj.name.startswith(f"TK_Char_{variant}_"):
                for owner in obj.users_collection:
                    owner.objects.unlink(obj)
                collection.objects.link(obj)
        if variant != "runner":
            # Only one body at a time: toggle the collections to see the others.
            layer = bpy.context.view_layer.layer_collection.children[collection.name]
            layer.hide_viewport = True
            collection.hide_render = True
    rig.animation_data.action = next(a for a in actions if a.name == "Idle")
    if hasattr(rig.animation_data, "action_slot") and rig.animation_data.action.slots:
        rig.animation_data.action_slot = rig.animation_data.action.slots[0]
    scene.frame_start = 0
    scene.frame_end = int(rig.animation_data.action.frame_range[1])
    for image in bpy.data.images:
        if image.name.startswith("TK_Kit_") and not image.packed_file:
            image.pack()
    # Drop the pack's unused originals (materials, textures) from the file.
    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    # Solid mode ignores textures by default; show the painted atlas instead.
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    space.shading.type = "SOLID"
                    space.shading.color_type = "TEXTURE"
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), compress=True)
    log(f"saved {BLEND_PATH}")


def export(rig: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for obj in bpy.data.objects:
        if obj.name.startswith("TK_Char_"):
            obj.select_set(True)
    rig.animation_data.action = None
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_def_bones=True,
        export_leaf_bone=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_anim_slide_to_zero=True,
        export_extras=True,
        export_image_format="AUTO",
    )
    log(f"exported {GLB_PATH} ({GLB_PATH.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
