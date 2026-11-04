#!/usr/bin/env python3
"""
Turkuaz Adalar - character rig and animation pipeline.

Builds a complete stylised explorer mascot from procedural meshes, skins it to
a humanoid armature, authors the ten runner-game animation clips, renders a
contact sheet and exports a game-ready GLB.

Run with:
    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        --python blender/build_character_rig.py --python-exit-code 1

The script is deterministic and idempotent. It removes only datablocks tagged
by this pipeline (or prefixed TK_/Turkuaz ), so it can be run repeatedly in the
same file without touching unrelated user work.

Coordinate conventions
----------------------
Blender: +Y is the character's forward direction, +Z is up, feet on Z = 0.
glTF:    the exporter maps Blender +Y to glTF/Three.js -Z, so the character
         walks toward the game's forward axis without an extra rotation.

Animation authoring
-------------------
* 30 fps, quaternion-friendly Euler keys baked on every frame.
* Legs are posed with a two-bone analytic IK solve. The planted foot therefore
  travels backward at a constant speed during the stance phase.
* The root bone never translates: every clip is in-place for a runner game.
* Run reference ground speed is stored as a custom property on the armature so
  gameplay code can time-scale the clip to remove foot sliding.
"""

from __future__ import annotations

import math
import shutil
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

# ---------------------------------------------------------------------------
# Paths and shared helpers
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
GAME_ROOT = PROJECT_ROOT / "turkuaz-adalar"

sys.path.insert(0, str(SCRIPT_DIR))
import turkuaz_character as base  # noqa: E402  (Blender adds bpy at runtime)

BLEND_PATH = SCRIPT_DIR / "turkuaz_character_rigged.blend"
GLB_PATH = SCRIPT_DIR / "turkuaz_runner.glb"
PREVIEW_PATH = SCRIPT_DIR / "rig_preview.png"
VALIDATION_JSON = SCRIPT_DIR / "rig_build_report.json"

GAME_GLB_PATHS = [
    GAME_ROOT / "src" / "assets" / "models" / "turkuaz_runner.glb",
    GAME_ROOT / "public" / "models" / "turkuaz_runner.glb",
]

TAG = base.GENERATED_TAG
FPS = 30
CHARACTER_NAME = "TurkuazRunner"
MESH_NAME = "TK_CharacterMesh"
RIG_NAME = "TK_Armature"
ROOT_BONE = "root"

# ---------------------------------------------------------------------------
# Humanoid proportions (metres). Character total height is ~1.72 m.
# ---------------------------------------------------------------------------

HIP_HEIGHT = 0.90
KNEE_Y = 0.13
KNEE_HEIGHT = 0.50
ANKLE_HEIGHT = 0.11
HIP_X = 0.10
KNEE_X = 0.11
ANKLE_X = 0.11

THIGH_REST_ANGLE = math.atan2(KNEE_Y, HIP_HEIGHT - KNEE_HEIGHT)
SHIN_REST_ANGLE = math.atan2(-KNEE_Y, KNEE_HEIGHT - ANKLE_HEIGHT) - THIGH_REST_ANGLE
THIGH_LENGTH = math.hypot(HIP_HEIGHT - KNEE_HEIGHT, KNEE_Y)
SHIN_LENGTH = math.hypot(KNEE_HEIGHT - ANKLE_HEIGHT, KNEE_Y)
LEG_REACH = THIGH_LENGTH + SHIN_LENGTH

# Run cycle tuning. 16 intervals at 30 fps = 0.533 s per full stride.
RUN_INTERVALS = 16
RUN_STANCE = 0.40
RUN_FOOT_TRAVEL = 0.60
RUN_REFERENCE_SPEED = RUN_FOOT_TRAVEL / (RUN_STANCE * RUN_INTERVALS / FPS)

CLIP_ORDER = [
    "Idle",
    "Run",
    "Jump",
    "Airborne",
    "Fall",
    "Land",
    "Win",
    "Lose",
    "Slide",
    "Turn",
    "Turn_Right",
]

LOOP_CLIPS = {"Idle", "Run", "Airborne", "Fall"}
LOOPABLE_BONUS = {"Win", "Lose", "Turn", "Turn_Right"}

# ---------------------------------------------------------------------------
# Scene helpers
# ---------------------------------------------------------------------------


def set_object_mode() -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def new_collection(name: str, parent: bpy.types.Collection) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    collection[TAG] = True
    parent.children.link(collection)
    return collection


def clear_previous_build() -> None:
    """Remove only data produced by this pipeline."""
    set_object_mode()

    for obj in list(bpy.data.objects):
        if obj.get(TAG) or obj.name.startswith("TK_"):
            bpy.data.objects.remove(obj, do_unlink=True)

    for collection in list(bpy.data.collections):
        if collection.get(TAG) or collection.name.startswith("Turkuaz "):
            bpy.data.collections.remove(collection)

    for action in list(bpy.data.actions):
        if action.get(TAG) or action.name in CLIP_ORDER:
            bpy.data.actions.remove(action)

    for block_collection in (
        bpy.data.materials,
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.armatures,
        bpy.data.images,
        bpy.data.lights,
        bpy.data.cameras,
        bpy.data.worlds,
    ):
        for block in list(block_collection):
            if block.get(TAG) and block.users == 0:
                block_collection.remove(block)

    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)


def remove_startup_objects() -> None:
    if bpy.data.filepath:
        return
    for name in ("Cube", "Camera", "Light"):
        obj = bpy.data.objects.get(name)
        if obj is not None and not obj.get(TAG):
            bpy.data.objects.remove(obj, do_unlink=True)


def ensure_uv(obj: bpy.types.Object) -> None:
    if obj.data.uv_layers:
        return
    layer = obj.data.uv_layers.new(name="UVMap")
    for loop in obj.data.loops:
        layer.data[loop.index].uv = (0.0, 0.0)


def tag_action(action: bpy.types.Action) -> bpy.types.Action:
    action[TAG] = True
    return action


# ---------------------------------------------------------------------------
# Badge texture (proves the bitmap/texture export path)
# ---------------------------------------------------------------------------


def make_badge_image() -> bpy.types.Image:
    size = 128
    image = bpy.data.images.new("TK_BadgeWave", width=size, height=size, alpha=True)
    image[TAG] = True
    image.colorspace_settings.name = "sRGB"

    cream = (0.965, 0.910, 0.796)
    coral = (0.941, 0.486, 0.400)
    turquoise = (0.094, 0.659, 0.631)
    pixels = np.zeros((size, size, 4), dtype=np.float32)

    for y in range(size):
        v = (y + 0.5) / size
        for x in range(size):
            u = (x + 0.5) / size
            radius = math.hypot(u - 0.5, v - 0.5)
            colour = cream
            if radius < 0.475:
                colour = coral
            if radius < 0.435:
                wave = 0.5 + 0.105 * math.sin((u - 0.5) * math.tau * 1.55)
                if abs(v - wave) < 0.035:
                    colour = cream
                wave2 = 0.5 + 0.105 * math.sin((u - 0.5) * math.tau * 1.55 + 0.7)
                if abs(v - wave2) < 0.022:
                    colour = turquoise
            pixels[y, x, 0:3] = colour
            pixels[y, x, 3] = 1.0

    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    return image


def make_badge_material(image: bpy.types.Image) -> bpy.types.Material:
    material = bpy.data.materials.new("TK_Mat_Badge")
    material[TAG] = True
    material.use_nodes = True
    material.use_backface_culling = False
    material.diffuse_color = (0.965, 0.910, 0.796, 1.0)

    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Closest"
    texture.location = (-420, 220)
    links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.5
    bsdf.inputs["Metallic"].default_value = 0.0
    return material


# ---------------------------------------------------------------------------
# Mesh construction
# ---------------------------------------------------------------------------


def build_character_mesh(materials: dict[str, bpy.types.Material], collection):
    parts: list[tuple[bpy.types.Object, str]] = []

    def add(obj: bpy.types.Object, region: str) -> bpy.types.Object:
        ensure_uv(obj)
        parts.append((obj, region))
        return obj

    skin = materials["skin"]
    skin_shade = materials["skin_shade"]
    skin_light = materials["skin_light"]
    hair = materials["hair"]
    hair_dark = materials["hair_dark"]
    jacket = materials["jacket"]
    jacket_dark = materials["jacket_dark"]
    jacket_light = materials["jacket_light"]
    cream = materials["cream"]
    cream_dark = materials["cream_dark"]
    shorts = materials["shorts"]
    leather = materials["leather"]
    leather_dark = materials["leather_dark"]
    backpack = materials["backpack"]
    backpack_dark = materials["backpack_dark"]
    sole = materials["sole"]
    gold = materials["gold"]
    coral = materials["coral"]
    eye_white = materials["eye_white"]
    iris = materials["iris"]
    pupil = materials["pupil"]
    brow = materials["brow"]
    mouth = materials["mouth"]
    highlight = materials["highlight"]
    badge_material = materials["badge"]

    # ---- torso and hips -------------------------------------------------
    torso_sections = [
        (0.0, 0.0, 0.965, 0.152, 0.110),
        (0.0, 0.0, 1.010, 0.150, 0.108),
        (0.0, 0.0, 1.065, 0.143, 0.101),
        (0.0, 0.0, 1.120, 0.156, 0.108),
        (0.0, 0.0, 1.180, 0.174, 0.118),
        (0.0, 0.0, 1.245, 0.188, 0.124),
        (0.0, 0.0, 1.305, 0.183, 0.117),
        (0.0, 0.0, 1.350, 0.146, 0.098),
        (0.0, 0.0, 1.372, 0.100, 0.078),
    ]
    add(
        base.make_section_loft(
            "TK_Torso",
            torso_sections,
            jacket,
            collection,
            sides=40,
            exponent=2.35,
        ),
        "torso",
    )

    # Zipper and hem.
    add(
        base.make_section_loft(
            "TK_Zipper",
            [
                (0.0, 0.110, 1.000, 0.009, 0.004),
                (0.0, 0.118, 1.120, 0.009, 0.004),
                (0.0, 0.126, 1.245, 0.009, 0.004),
                (0.0, 0.110, 1.345, 0.009, 0.004),
            ],
            cream,
            collection,
            sides=10,
            exponent=2.0,
        ),
        "torso",
    )
    add(
        base.make_torus(
            "TK_Hem",
            (0.0, 0.0, 1.005),
            0.152,
            0.010,
            jacket_dark,
            collection,
            major_segments=40,
            minor_segments=8,
            scale=(1.0, 0.72, 1.0),
        ),
        "torso",
    )
    # Zipper pull.
    add(
        base.make_superellipsoid(
            "TK_ZipperPull",
            (0.0, 0.132, 1.235),
            (0.015, 0.008, 0.022),
            gold,
            collection,
            exponent_xy=0.7,
            exponent_z=0.7,
            segments=20,
            rings=12,
        ),
        "torso",
    )
    # Pockets.
    for side in (-1, 1):
        add(
            base.make_superellipsoid(
                f"TK_Pocket_{side:+d}",
                (0.112 * side, 0.112, 1.075),
                (0.048, 0.010, 0.034),
                jacket_dark,
                collection,
                exponent_xy=0.6,
                exponent_z=0.6,
                segments=24,
                rings=14,
            ),
            "torso",
        )
    # Collar.
    add(
        base.make_torus(
            "TK_Collar",
            (0.0, 0.0, 1.360),
            0.077,
            0.013,
            cream,
            collection,
            major_segments=36,
            minor_segments=8,
            scale=(1.0, 0.82, 1.0),
        ),
        "neck",
    )

    # ---- shorts, belt and buckle ---------------------------------------
    shorts_sections = [
        (0.0, 0.0, 0.790, 0.160, 0.115),
        (0.0, 0.0, 0.835, 0.168, 0.119),
        (0.0, 0.0, 0.900, 0.166, 0.118),
        (0.0, 0.0, 0.950, 0.158, 0.113),
        (0.0, 0.0, 0.985, 0.152, 0.109),
    ]
    add(
        base.make_section_loft(
            "TK_Shorts",
            shorts_sections,
            shorts,
            collection,
            sides=36,
            exponent=2.3,
        ),
        "hips",
    )

    for side, sx in (("L", 1.0), ("R", -1.0)):
        add(
            base.make_tube_path(
                f"TK_ShortsLeg.{side}",
                [
                    (0.085 * sx, 0.000, 0.910),
                    (0.092 * sx, 0.025, 0.850),
                    (0.100 * sx, 0.045, 0.790),
                    (0.104 * sx, 0.060, 0.720),
                ],
                [0.083, 0.082, 0.079, 0.074],
                shorts,
                collection,
                sides=24,
            ),
            f"shorts.{side}",
        )

    add(
        base.make_torus(
            "TK_Belt",
            (0.0, 0.0, 0.990),
            0.154,
            0.017,
            leather,
            collection,
            major_segments=40,
            minor_segments=8,
            scale=(1.0, 0.73, 1.0),
        ),
        "hips",
    )
    add(
        base.make_superellipsoid(
            "TK_Buckle",
            (0.0, 0.121, 0.990),
            (0.037, 0.014, 0.030),
            gold,
            collection,
            exponent_xy=0.55,
            exponent_z=0.55,
            segments=24,
            rings=14,
        ),
        "hips",
    )

    # ---- legs -----------------------------------------------------------
    for side, sx in (("L", 1.0), ("R", -1.0)):
        add(
            base.make_tube_path(
                f"TK_Leg.{side}",
                [
                    (0.100 * sx, 0.000, 0.890),
                    (0.104 * sx, 0.045, 0.780),
                    (0.108 * sx, 0.090, 0.660),
                    (0.110 * sx, 0.130, 0.500),
                    (0.110 * sx, 0.100, 0.380),
                    (0.110 * sx, 0.045, 0.245),
                    (0.110 * sx, 0.000, 0.120),
                ],
                [0.079, 0.080, 0.074, 0.066, 0.072, 0.060, 0.045],
                skin,
                collection,
                sides=24,
            ),
            f"leg.{side}",
        )
        # Sock cuff.
        add(
            base.make_tube_path(
                f"TK_Sock.{side}",
                [
                    (0.110 * sx, 0.010, 0.285),
                    (0.110 * sx, 0.004, 0.225),
                    (0.110 * sx, 0.000, 0.165),
                ],
                [0.055, 0.052, 0.048],
                cream,
                collection,
                sides=20,
            ),
            f"leg.{side}",
        )
        # Boot body, sole, tongue and laces.
        add(
            base.make_superellipsoid(
                f"TK_Boot.{side}",
                (0.110 * sx, 0.050, 0.075),
                (0.076, 0.150, 0.065),
                leather,
                collection,
                exponent_xy=0.62,
                exponent_z=0.62,
                segments=32,
                rings=18,
            ),
            f"foot.{side}",
        )
        add(
            base.make_superellipsoid(
                f"TK_Sole.{side}",
                (0.110 * sx, 0.052, 0.026),
                (0.082, 0.160, 0.027),
                sole,
                collection,
                exponent_xy=0.55,
                exponent_z=0.55,
                segments=32,
                rings=14,
            ),
            f"foot.{side}",
        )
        add(
            base.make_superellipsoid(
                f"TK_BootTongue.{side}",
                (0.110 * sx, 0.128, 0.125),
                (0.044, 0.038, 0.020),
                coral,
                collection,
                exponent_xy=0.6,
                exponent_z=0.6,
                segments=20,
                rings=12,
            ),
            f"foot.{side}",
        )
        for index, y in enumerate((0.035, 0.075, 0.115)):
            add(
                base.make_tube_path(
                    f"TK_Lace_{side}_{index}",
                    [
                        (0.110 * sx - 0.042, y, 0.126),
                        (0.110 * sx + 0.042, y, 0.126),
                    ],
                    [0.006, 0.006],
                    cream_dark,
                    collection,
                    sides=8,
                ),
                f"foot.{side}",
            )

    # ---- arms -----------------------------------------------------------
    for side, sx in (("L", 1.0), ("R", -1.0)):
        add(
            base.make_ellipsoid(
                f"TK_Shoulder.{side}",
                (0.190 * sx, 0.000, 1.315),
                (0.075, 0.085, 0.072),
                jacket,
                collection,
                segments=28,
                rings=18,
            ),
            f"arm.{side}",
        )
        add(
            base.make_tube_path(
                f"TK_Arm.{side}",
                [
                    (0.195 * sx, 0.000, 1.320),
                    (0.222 * sx, 0.004, 1.230),
                    (0.248 * sx, 0.010, 1.130),
                    (0.262 * sx, 0.016, 1.060),
                    (0.272 * sx, 0.022, 0.980),
                    (0.280 * sx, 0.026, 0.900),
                ],
                [0.067, 0.062, 0.057, 0.054, 0.052, 0.049],
                jacket,
                collection,
                sides=24,
            ),
            f"arm.{side}",
        )
        add(
            base.make_tube_path(
                f"TK_Cuff.{side}",
                [
                    (0.279 * sx, 0.025, 0.915),
                    (0.281 * sx, 0.027, 0.885),
                ],
                [0.051, 0.050],
                cream,
                collection,
                sides=20,
            ),
            f"arm.{side}",
        )
        add(
            base.make_ellipsoid(
                f"TK_Hand.{side}",
                (0.284 * sx, 0.032, 0.835),
                (0.043, 0.050, 0.058),
                skin,
                collection,
                segments=28,
                rings=18,
            ),
            f"hand.{side}",
        )
        add(
            base.make_ellipsoid(
                f"TK_Thumb.{side}",
                (0.246 * sx, 0.060, 0.845),
                (0.019, 0.025, 0.030),
                skin,
                collection,
                segments=18,
                rings=12,
            ),
            f"hand.{side}",
        )

    # ---- neck and head -------------------------------------------------
    add(
        base.make_tube_path(
            "TK_Neck",
            [(0.0, 0.0, 1.330), (0.0, 0.0, 1.385), (0.0, 0.0, 1.440)],
            [0.062, 0.058, 0.055],
            skin,
            collection,
            sides=24,
        ),
        "neck",
    )
    add(
        base.make_ellipsoid(
            "TK_Head",
            (0.0, 0.006, 1.530),
            (0.155, 0.160, 0.175),
            skin,
            collection,
            segments=48,
            rings=28,
        ),
        "head",
    )
    # Hair cap sits behind the face surface and wraps over the skull.
    add(
        base.make_ellipsoid(
            "TK_Hair",
            (0.0, -0.026, 1.574),
            (0.169, 0.165, 0.174),
            hair,
            collection,
            segments=48,
            rings=28,
        ),
        "head",
    )
    # Fringe, side locks and top tuft.
    add(
        base.make_superellipsoid(
            "TK_Fringe",
            (0.0, 0.116, 1.640),
            (0.132, 0.040, 0.058),
            hair,
            collection,
            exponent_xy=0.8,
            exponent_z=0.8,
            segments=32,
            rings=18,
            rotation=Matrix.Rotation(math.radians(-8.0), 3, "X"),
        ),
        "head",
    )
    for side in (-1, 1):
        add(
            base.make_superellipsoid(
                f"TK_SideLock_{side:+d}",
                (0.128 * side, 0.075, 1.565),
                (0.035, 0.040, 0.085),
                hair,
                collection,
                exponent_xy=0.8,
                exponent_z=0.8,
                segments=24,
                rings=14,
                rotation=Matrix.Rotation(math.radians(8.0 * side), 3, "Y"),
            ),
            "head",
        )
        add(
            base.make_ellipsoid(
                f"TK_Ear_{side:+d}",
                (0.152 * side, 0.004, 1.520),
                (0.030, 0.019, 0.043),
                skin,
                collection,
                segments=20,
                rings=14,
            ),
            "head",
        )
    add(
        base.make_ellipsoid(
            "TK_HairTuft",
            (0.034, -0.005, 1.748),
            (0.042, 0.050, 0.032),
            hair_dark,
            collection,
            segments=24,
            rings=14,
            rotation=Matrix.Rotation(math.radians(22.0), 3, "Y"),
        ),
        "head",
    )

    # Eyes, brows, nose and smile.
    for side in (-1, 1):
        add(
            base.make_ellipsoid(
                f"TK_EyeWhite_{side:+d}",
                (0.063 * side, 0.147, 1.545),
                (0.043, 0.026, 0.050),
                eye_white,
                collection,
                segments=32,
                rings=20,
            ),
            "head",
        )
        add(
            base.make_ellipsoid(
                f"TK_Iris_{side:+d}",
                (0.063 * side, 0.166, 1.541),
                (0.024, 0.013, 0.030),
                iris,
                collection,
                segments=28,
                rings=16,
            ),
            "head",
        )
        add(
            base.make_ellipsoid(
                f"TK_Pupil_{side:+d}",
                (0.063 * side, 0.175, 1.539),
                (0.012, 0.008, 0.017),
                pupil,
                collection,
                segments=20,
                rings=12,
            ),
            "head",
        )
        add(
            base.make_ellipsoid(
                f"TK_Highlight_{side:+d}",
                (0.055 * side, 0.181, 1.552),
                (0.006, 0.004, 0.007),
                highlight,
                collection,
                segments=14,
                rings=10,
            ),
            "head",
        )
        add(
            base.make_superellipsoid(
                f"TK_Brow_{side:+d}",
                (0.063 * side, 0.150, 1.610),
                (0.048, 0.012, 0.011),
                brow,
                collection,
                exponent_xy=0.65,
                exponent_z=0.65,
                segments=20,
                rings=10,
                rotation=Matrix.Rotation(math.radians(-4.0 * side), 3, "Y"),
            ),
            "head",
        )
        add(
            base.make_superellipsoid(
                f"TK_Cheek_{side:+d}",
                (0.103 * side, 0.137, 1.488),
                (0.030, 0.006, 0.017),
                skin_shade,
                collection,
                exponent_xy=0.9,
                exponent_z=0.9,
                segments=20,
                rings=10,
            ),
            "head",
        )
    add(
        base.make_ellipsoid(
            "TK_Nose",
            (0.0, 0.166, 1.505),
            (0.022, 0.025, 0.020),
            skin_light,
            collection,
            segments=24,
            rings=14,
        ),
        "head",
    )
    smile_points = [
        (-0.047, 0.151, 1.466),
        (-0.028, 0.157, 1.459),
        (0.000, 0.159, 1.456),
        (0.028, 0.157, 1.459),
        (0.047, 0.151, 1.466),
    ]
    add(
        base.make_tube_path(
            "TK_Smile",
            smile_points,
            [0.0045, 0.0055, 0.0055, 0.0055, 0.0045],
            mouth,
            collection,
            sides=10,
        ),
        "head",
    )

    # ---- backpack -------------------------------------------------------
    add(
        base.make_superellipsoid(
            "TK_Backpack",
            (0.0, -0.205, 1.170),
            (0.150, 0.078, 0.172),
            backpack,
            collection,
            exponent_xy=0.62,
            exponent_z=0.62,
            segments=32,
            rings=20,
        ),
        "backpack",
    )
    add(
        base.make_superellipsoid(
            "TK_BackpackFlap",
            (0.0, -0.213, 1.310),
            (0.142, 0.070, 0.050),
            backpack_dark,
            collection,
            exponent_xy=0.62,
            exponent_z=0.62,
            segments=28,
            rings=16,
        ),
        "backpack",
    )
    add(
        base.make_superellipsoid(
            "TK_BackpackPocket",
            (0.0, -0.268, 1.115),
            (0.092, 0.026, 0.082),
            backpack_dark,
            collection,
            exponent_xy=0.62,
            exponent_z=0.62,
            segments=28,
            rings=16,
        ),
        "backpack",
    )
    for side, sx in (("L", 1.0), ("R", -1.0)):
        add(
            base.make_tube_path(
                f"TK_Strap.{side}",
                [
                    (0.113 * sx, 0.116, 1.300),
                    (0.145 * sx, 0.090, 1.350),
                    (0.148 * sx, 0.015, 1.355),
                    (0.122 * sx, -0.090, 1.305),
                    (0.100 * sx, -0.165, 1.255),
                ],
                [0.018, 0.020, 0.020, 0.019, 0.017],
                leather_dark,
                collection,
                sides=12,
            ),
            "strap",
        )

    # ---- chest badge (picture texture) ---------------------------------
    badge = make_badge_plane(
        "TK_Badge",
        (0.096, 0.124, 1.196),
        0.082,
        0.066,
        badge_material,
        collection,
    )
    add(badge, "torso")

    return parts


def make_badge_plane(
    name: str,
    center,
    width: float,
    height: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    """Rounded rectangle in the XZ plane, facing +Y, with a 0..1 UV map."""
    cx, cy, cz = center
    radius = height * 0.22
    points: list[tuple[float, float]] = []
    corner_centers = [
        (width / 2 - radius, height / 2 - radius, 0.0),
        (-width / 2 + radius, height / 2 - radius, 0.5 * math.pi),
        (-width / 2 + radius, -height / 2 + radius, math.pi),
        (width / 2 - radius, -height / 2 + radius, 1.5 * math.pi),
    ]
    for ox, oz, start in corner_centers:
        for step in range(4):
            angle = start + step * (0.5 * math.pi / 3.0)
            points.append((ox + radius * math.cos(angle), oz + radius * math.sin(angle)))
    # Clockwise in XZ so the face normal points toward +Y.
    points.reverse()

    vertices = [(cx + x, cy, cz + z) for x, z in points]
    faces = [tuple(range(len(vertices)))]
    obj = base.make_mesh_object(
        name, vertices, faces, material, collection, smooth=False
    )
    ensure_uv(obj)
    uv_layer = obj.data.uv_layers.active
    for loop in obj.data.loops:
        co = obj.data.vertices[loop.vertex_index].co
        uv_layer.data[loop.index].uv = (
            (co.x - (cx - width / 2)) / width,
            (co.z - (cz - height / 2)) / height,
        )
    obj.data.polygons[0].use_smooth = False
    # Make sure the winding faces the camera.
    if obj.data.polygons[0].normal.y < 0:
        obj.data.flip_normals()
    return obj


# ---------------------------------------------------------------------------
# Skinning
# ---------------------------------------------------------------------------


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge1 <= edge0:
        return 0.0 if value < edge0 else 1.0
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def vertex_weights(region: str, co: Vector) -> dict[str, float]:
    x, y, z = co.x, co.y, co.z

    if region == "head":
        return {"head": 1.0}
    if region == "neck":
        t = smoothstep(1.355, 1.435, z)
        return {"neck": 1.0 - t, "head": t}
    if region == "torso":
        hips = 1.0 - smoothstep(0.965, 1.055, z)
        chest = smoothstep(1.115, 1.225, z)
        spine = max(0.0, 1.0 - hips - chest)
        return {"hips": hips, "spine": spine, "chest": chest}
    if region == "hips":
        return {"hips": 1.0}
    if region == "backpack":
        return {"chest": 0.85, "spine": 0.15}
    if region == "strap":
        return {"chest": 1.0}
    if region.startswith("shorts."):
        side = region.split(".")[1]
        t = smoothstep(0.710, 0.870, z)
        return {"thigh." + side: 1.0 - t, "hips": t}
    if region.startswith("arm."):
        side = region.split(".")[1]
        upper = "upper_arm." + side
        fore = "forearm." + side
        hand = "hand." + side
        if z >= 1.195:
            chest = smoothstep(1.255, 1.360, z) * 0.25
            return {upper: 1.0 - chest, "chest": chest}
        if z >= 1.075:
            return {upper: 1.0}
        if z >= 0.955:
            t = smoothstep(0.955, 1.075, z)
            return {fore: 1.0 - t, upper: t}
        if z >= 0.890:
            return {fore: 1.0}
        return {hand: 1.0}
    if region.startswith("hand."):
        return {"hand." + region.split(".")[1]: 1.0}
    if region.startswith("leg."):
        side = region.split(".")[1]
        thigh = "thigh." + side
        shin = "shin." + side
        foot = "foot." + side
        if z >= 0.575:
            return {thigh: 1.0}
        if z >= 0.415:
            t = smoothstep(0.415, 0.575, z)
            return {shin: 1.0 - t, thigh: t}
        if z >= 0.155:
            return {shin: 1.0}
        t = smoothstep(0.105, 0.155, z)
        return {foot: 1.0 - t, shin: t}
    if region.startswith("foot."):
        side = region.split(".")[1]
        foot = "foot." + side
        toe = "toe." + side
        t = smoothstep(0.095, 0.160, y)
        return {foot: 1.0 - t, toe: t}
    raise RuntimeError(f"Unknown skin region {region!r}")


def skin_parts(parts):
    for obj, region in parts:
        cache: dict[str, bpy.types.VertexGroup] = {}
        for vertex in obj.data.vertices:
            weights = vertex_weights(region, vertex.co)
            total = sum(weights.values())
            if total <= 1e-8:
                continue
            for bone_name, weight in weights.items():
                if weight <= 1e-4:
                    continue
                group = cache.get(bone_name)
                if group is None:
                    group = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(
                        name=bone_name
                    )
                    cache[bone_name] = group
                group.add([vertex.index], weight / total, "REPLACE")


# ---------------------------------------------------------------------------
# Armature
# ---------------------------------------------------------------------------


def bone_definition():
    """(name, head, tail, parent, connected, deform)"""
    bones = [
        (ROOT_BONE, (0.0, 0.0, 0.0), (0.0, 0.0, 0.16), None, False, False),
        ("hips", (0.0, 0.0, HIP_HEIGHT), (0.0, 0.0, 1.000), ROOT_BONE, False, True),
        ("spine", (0.0, 0.0, 1.000), (0.0, 0.0, 1.180), "hips", True, True),
        ("chest", (0.0, 0.0, 1.180), (0.0, 0.0, 1.360), "spine", True, True),
        ("neck", (0.0, 0.0, 1.360), (0.0, 0.0, 1.435), "chest", True, True),
        ("head", (0.0, 0.0, 1.435), (0.0, 0.0, 1.700), "neck", True, True),
    ]
    for side, sx in (("L", 1.0), ("R", -1.0)):
        bones += [
            (
                f"shoulder.{side}",
                (0.045 * sx, 0.0, 1.325),
                (0.195 * sx, 0.0, 1.325),
                "chest",
                False,
                True,
            ),
            (
                f"upper_arm.{side}",
                (0.195 * sx, 0.0, 1.320),
                (0.262 * sx, 0.016, 1.060),
                f"shoulder.{side}",
                True,
                True,
            ),
            (
                f"forearm.{side}",
                (0.262 * sx, 0.016, 1.060),
                (0.280 * sx, 0.026, 0.900),
                f"upper_arm.{side}",
                True,
                True,
            ),
            (
                f"hand.{side}",
                (0.280 * sx, 0.026, 0.900),
                (0.284 * sx, 0.032, 0.790),
                f"forearm.{side}",
                True,
                True,
            ),
            (
                f"thigh.{side}",
                (HIP_X * sx, 0.0, HIP_HEIGHT),
                (KNEE_X * sx, KNEE_Y, KNEE_HEIGHT),
                "hips",
                False,
                True,
            ),
            (
                f"shin.{side}",
                (KNEE_X * sx, KNEE_Y, KNEE_HEIGHT),
                (ANKLE_X * sx, 0.0, ANKLE_HEIGHT),
                f"thigh.{side}",
                True,
                True,
            ),
            (
                f"foot.{side}",
                (ANKLE_X * sx, 0.0, ANKLE_HEIGHT),
                (ANKLE_X * sx, 0.160, 0.040),
                f"shin.{side}",
                True,
                True,
            ),
            (
                f"toe.{side}",
                (ANKLE_X * sx, 0.160, 0.040),
                (ANKLE_X * sx, 0.255, 0.030),
                f"foot.{side}",
                True,
                True,
            ),
        ]
    return bones


def build_armature(collection) -> bpy.types.Object:
    data = bpy.data.armatures.new(RIG_NAME)
    data[TAG] = True
    rig = bpy.data.objects.new(RIG_NAME, data)
    rig[TAG] = True
    collection.objects.link(rig)
    rig.show_in_front = True
    data.display_type = "OCTAHEDRAL"

    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    edit_bones = {}
    for name, head, tail, parent, connected, deform in bone_definition():
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.roll = 0.0
        bone.use_deform = deform
        edit_bones[name] = bone

    for name, head, tail, parent, connected, deform in bone_definition():
        if parent is not None:
            bone = edit_bones[name]
            bone.parent = edit_bones[parent]
            bone.use_connect = connected

    bpy.ops.object.mode_set(mode="OBJECT")

    data["character"] = CHARACTER_NAME
    data["fps"] = FPS
    data["forward_axis_blender"] = "+Y"
    data["forward_axis_gltf"] = "-Z"
    data["root_motion"] = "in_place"
    data["run_reference_speed"] = RUN_REFERENCE_SPEED
    data["run_cycle_seconds"] = RUN_INTERVALS / FPS
    data["run_stance_ratio"] = RUN_STANCE
    data["run_foot_travel"] = RUN_FOOT_TRAVEL
    data["units"] = "meters"
    data["animation_clips"] = ",".join(CLIP_ORDER)

    # Mirror the metadata onto the object too: the glTF exporter writes object
    # custom properties as node extras, so the runner can read its own timing
    # contract straight from the GLB.
    for key in (
        "character",
        "fps",
        "forward_axis_blender",
        "forward_axis_gltf",
        "root_motion",
        "run_reference_speed",
        "run_cycle_seconds",
        "run_stance_ratio",
        "run_foot_travel",
        "units",
        "animation_clips",
    ):
        rig[key] = data[key]

    # Bone collections keep the outliner tidy in Blender 5.x.
    try:
        deform_collection = data.collections.new("Deform")
        root_collection = data.collections.new("Root")
        for bone in data.bones:
            target = root_collection if bone.name == ROOT_BONE else deform_collection
            target.assign(bone)
    except Exception:
        pass

    return rig


def bind_mesh(body: bpy.types.Object, rig: bpy.types.Object) -> None:
    body.parent = rig
    body.matrix_parent_inverse = rig.matrix_world.inverted()
    modifier = body.modifiers.new("Armature", "ARMATURE")
    modifier.object = rig
    modifier.use_vertex_groups = True
    modifier.use_bone_envelopes = False


# ---------------------------------------------------------------------------
# Pose helpers
# ---------------------------------------------------------------------------


def reset_pose(rig: bpy.types.Object) -> None:
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)


def set_rot(rig: bpy.types.Object, name: str, x=0.0, y=0.0, z=0.0) -> None:
    rig.pose.bones[name].rotation_euler = (x, y, z)


def set_scale(rig: bpy.types.Object, name: str, x=1.0, y=1.0, z=1.0) -> None:
    rig.pose.bones[name].scale = (x, y, z)


def set_world_offset(rig: bpy.types.Object, name: str, offset) -> None:
    """Convert a world-space offset into the bone's rest-local translation."""
    bone = rig.pose.bones[name].bone
    local = bone.matrix_local.to_3x3().inverted() @ Vector(offset)
    rig.pose.bones[name].location = local


def pose_torso(
    rig,
    hips_offset=(0.0, 0.0, 0.0),
    hips_rot=(0.0, 0.0, 0.0),
    spine=(0.0, 0.0, 0.0),
    chest=(0.0, 0.0, 0.0),
    neck=(0.0, 0.0, 0.0),
    head=(0.0, 0.0, 0.0),
    spine_scale=(1.0, 1.0, 1.0),
    chest_scale=(1.0, 1.0, 1.0),
) -> None:
    set_world_offset(rig, "hips", hips_offset)
    set_rot(rig, "hips", *hips_rot)
    set_rot(rig, "spine", *spine)
    set_rot(rig, "chest", *chest)
    set_rot(rig, "neck", *neck)
    set_rot(rig, "head", *head)
    set_scale(rig, "spine", *spine_scale)
    set_scale(rig, "chest", *chest_scale)


def pose_arm(
    rig,
    side: str,
    swing=0.0,
    lift=0.0,
    elbow=0.0,
    hand=0.0,
    twist=0.0,
) -> None:
    """Swing (forward +), lift (out/up +), elbow bend (forward +)."""
    sign = -1.0 if side == "L" else 1.0
    set_rot(rig, f"upper_arm.{side}", swing, twist, sign * lift)
    set_rot(rig, f"forearm.{side}", elbow, 0.0, 0.0)
    set_rot(rig, f"hand.{side}", hand, 0.0, 0.0)


def solve_leg(
    rig,
    side: str,
    target_y: float,
    target_z: float,
    foot_pitch: float = 0.0,
    toe_pitch: float = 0.0,
) -> None:
    """Analytic two-bone IK in the sagittal plane, baked to FK rotations."""
    bpy.context.view_layer.update()
    hip = rig.pose.bones[f"thigh.{side}"].head
    dy = target_y - hip.y
    dz = hip.z - target_z
    distance = math.hypot(dy, dz)
    maximum = THIGH_LENGTH + SHIN_LENGTH - 0.003
    minimum = abs(THIGH_LENGTH - SHIN_LENGTH) + 0.01

    if distance > maximum:
        scale = maximum / distance
        dy *= scale
        dz *= scale
        distance = maximum
    elif distance < minimum:
        scale = minimum / max(distance, 1e-5)
        dy *= scale
        dz *= scale
        distance = minimum

    phi = math.atan2(dy, dz)
    cos_alpha = (THIGH_LENGTH**2 + distance**2 - SHIN_LENGTH**2) / (
        2.0 * THIGH_LENGTH * distance
    )
    cos_beta = (SHIN_LENGTH**2 + distance**2 - THIGH_LENGTH**2) / (
        2.0 * SHIN_LENGTH * distance
    )
    alpha = math.acos(max(-1.0, min(1.0, cos_alpha)))
    beta = math.acos(max(-1.0, min(1.0, cos_beta)))

    thigh_world = phi + alpha
    shin_relative = -(alpha + beta)
    hips_pitch = rig.pose.bones["hips"].rotation_euler.x

    thigh_local = thigh_world - THIGH_REST_ANGLE - hips_pitch
    shin_local = shin_relative - SHIN_REST_ANGLE
    foot_local = -(hips_pitch + thigh_local + shin_local) + foot_pitch

    set_rot(rig, f"thigh.{side}", thigh_local)
    set_rot(rig, f"shin.{side}", shin_local)
    set_rot(rig, f"foot.{side}", foot_local)
    set_rot(rig, f"toe.{side}", toe_pitch)


def base_pose(rig) -> None:
    pose_torso(rig)
    pose_arm(rig, "L", swing=0.0, lift=0.02, elbow=0.10)
    pose_arm(rig, "R", swing=0.0, lift=0.02, elbow=0.10)
    solve_leg(rig, "L", 0.0, ANKLE_HEIGHT)
    solve_leg(rig, "R", 0.0, ANKLE_HEIGHT)


# ---------------------------------------------------------------------------
# Animation clips
# ---------------------------------------------------------------------------


def curve(t: float, keys) -> float:
    """Smoothstep interpolation through (time, value) keys."""
    if t <= keys[0][0]:
        return keys[0][1]
    if t >= keys[-1][0]:
        return keys[-1][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            u = (t - t0) / max(t1 - t0, 1e-8)
            u = u * u * (3.0 - 2.0 * u)
            return v0 + (v1 - v0) * u
    return keys[-1][1]


def pose_idle(rig, t: float) -> None:
    w = math.tau * t
    breath = math.sin(w)
    sway = math.sin(w + 0.55)
    hips_z = -0.010 + 0.004 * breath
    hips_x = 0.006 * math.sin(w + 0.8)
    hips_y = 0.002 * breath

    pose_torso(
        rig,
        hips_offset=(hips_x, hips_y, hips_z),
        hips_rot=(0.006 * math.sin(w + 0.2), 0.014 * sway, 0.010 * sway),
        spine=(-0.010 + 0.006 * breath, 0.018 * sway, -0.008 * sway),
        chest=(0.012 * breath, 0.010 * sway, -0.006 * sway),
        neck=(-0.006 * breath, -0.012 * sway, 0.0),
        head=(0.010 * math.sin(w + 1.1), -0.030 * math.sin(w + 0.7), 0.012 * sway),
        chest_scale=(1.0 + 0.003 * breath, 1.0 + 0.005 * breath, 1.0 + 0.003 * breath),
    )
    pose_arm(
        rig, "L",
        swing=0.030 * math.sin(w + 0.4),
        lift=0.025 + 0.010 * math.sin(w + 1.2),
        elbow=0.12 + 0.025 * math.sin(w + 0.9),
        hand=0.02,
    )
    pose_arm(
        rig, "R",
        swing=0.030 * math.sin(w + 0.5),
        lift=0.025 + 0.010 * math.sin(w + 1.3),
        elbow=0.12 + 0.025 * math.sin(w + 1.0),
        hand=0.02,
    )
    solve_leg(rig, "L", 0.0, ANKLE_HEIGHT)
    solve_leg(rig, "R", 0.0, ANKLE_HEIGHT)


def run_leg_target(local_phase: float):
    phase = local_phase % 1.0
    if phase < RUN_STANCE:
        s = phase / RUN_STANCE
        y = RUN_FOOT_TRAVEL * 0.5 - RUN_FOOT_TRAVEL * s
        # Heel lift: as the foot pitches down into toe-off the ankle rises so
        # the planted toe stays on the ground instead of punching through it.
        heel_lift = 0.045 * smoothstep(0.62, 1.0, s)
        z = ANKLE_HEIGHT + heel_lift
        pitch = curve(s, [(0.0, 0.15), (0.20, 0.0), (0.70, 0.0), (1.0, -0.42)])
        toe = curve(s, [(0.0, 0.0), (0.65, 0.0), (1.0, 0.40)])
        return y, z, pitch, toe

    s = (phase - RUN_STANCE) / (1.0 - RUN_STANCE)
    ease = s * s * (3.0 - 2.0 * s)
    y = -RUN_FOOT_TRAVEL * 0.5 + RUN_FOOT_TRAVEL * ease
    z = ANKLE_HEIGHT + 0.34 * math.sin(math.pi * s) ** 0.8
    pitch = curve(s, [(0.0, -0.35), (0.35, 0.18), (0.70, 0.26), (1.0, 0.15)])
    toe = curve(s, [(0.0, 0.30), (0.35, 0.0), (1.0, 0.0)])
    return y, z, pitch, toe


def pose_run(rig, t: float) -> None:
    w = math.tau * t
    cos_w = math.cos(w)
    sin_w = math.sin(w)

    hips_z = -0.020 - 0.030 * math.cos(2.0 * w)
    hips_x = 0.018 * cos_w
    hips_y = 0.002 * sin_w

    pose_torso(
        rig,
        hips_offset=(hips_x, hips_y, hips_z),
        hips_rot=(-0.025, 0.070 * cos_w, -0.030 * cos_w),
        spine=(-0.115, -0.070 * cos_w, 0.020 * cos_w),
        chest=(-0.055, -0.050 * cos_w, 0.015 * cos_w),
        neck=(0.040, 0.030 * cos_w, 0.0),
        head=(0.115 + 0.010 * sin_w, 0.045 * cos_w, -0.010 * cos_w),
    )

    pose_arm(
        rig, "L",
        swing=-0.72 * cos_w,
        lift=0.10,
        elbow=1.10 + 0.12 * cos_w,
        hand=0.12,
    )
    pose_arm(
        rig, "R",
        swing=0.72 * cos_w,
        lift=0.10,
        elbow=1.10 - 0.12 * cos_w,
        hand=0.12,
    )

    for side, offset in (("L", 0.0), ("R", 0.5)):
        y, z, pitch, toe = run_leg_target(t + offset)
        solve_leg(rig, side, y, z, pitch, toe)


def pose_jump(rig, t: float) -> None:
    hips_z = curve(
        t,
        [(0.0, 0.0), (0.12, -0.165), (0.28, 0.10), (0.55, 0.22), (0.80, 0.20), (1.0, 0.18)],
    )
    hips_y = curve(t, [(0.0, 0.0), (0.12, -0.015), (0.28, 0.025), (0.55, 0.045), (1.0, 0.040)])
    spine_x = curve(t, [(0.0, 0.0), (0.12, -0.30), (0.28, -0.10), (0.55, 0.01), (1.0, 0.02)])
    head_x = curve(t, [(0.0, 0.0), (0.12, 0.22), (0.28, 0.05), (0.55, 0.06), (1.0, 0.05)])
    leg_y = curve(t, [(0.0, 0.0), (0.12, 0.0), (0.28, 0.07), (0.55, 0.17), (1.0, 0.15)])
    leg_z = curve(t, [(0.0, ANKLE_HEIGHT), (0.12, ANKLE_HEIGHT), (0.28, 0.27), (0.55, 0.44), (1.0, 0.42)])
    pitch = curve(t, [(0.0, 0.0), (0.12, 0.0), (0.28, -0.32), (0.55, 0.10), (1.0, 0.08)])

    pose_torso(
        rig,
        hips_offset=(0.0, hips_y, hips_z),
        hips_rot=(-0.03, 0.0, 0.0),
        spine=(spine_x, 0.0, 0.0),
        chest=(spine_x * 0.45, 0.0, 0.0),
        neck=(-spine_x * 0.35, 0.0, 0.0),
        head=(head_x, 0.0, 0.0),
    )
    swing = curve(t, [(0.0, 0.0), (0.12, -0.80), (0.28, 0.25), (0.55, 0.10), (1.0, 0.08)])
    lift = curve(t, [(0.0, 0.02), (0.12, 0.05), (0.28, 2.10), (0.55, 1.55), (1.0, 1.25)])
    elbow = curve(t, [(0.0, 0.10), (0.12, 0.35), (0.28, 0.20), (0.55, 0.45), (1.0, 0.55)])
    pose_arm(rig, "L", swing=swing, lift=lift, elbow=elbow, hand=0.1)
    pose_arm(rig, "R", swing=swing, lift=lift * 0.96, elbow=elbow, hand=0.1)
    solve_leg(rig, "L", leg_y + 0.015, leg_z, pitch, 0.0)
    solve_leg(rig, "R", leg_y - 0.015, leg_z - 0.01, pitch, 0.0)


def pose_airborne(rig, t: float) -> None:
    w = math.tau * t
    hips_z = 0.18 + 0.025 * math.sin(w)
    hips_y = 0.025 + 0.010 * math.sin(w + 0.6)
    hips_x = 0.010 * math.sin(w + 0.3)

    pose_torso(
        rig,
        hips_offset=(hips_x, hips_y, hips_z),
        hips_rot=(-0.02, 0.020 * math.sin(w), 0.012 * math.sin(w + 0.7)),
        spine=(-0.045 + 0.020 * math.sin(w), 0.020 * math.sin(w + 1.2), 0.010 * math.sin(w)),
        chest=(0.015 + 0.012 * math.sin(w + 0.4), 0.015 * math.sin(w + 1.5), 0.0),
        neck=(0.020, -0.015 * math.sin(w), 0.0),
        head=(0.040 + 0.012 * math.sin(w + 1.0), -0.020 * math.sin(w), 0.0),
    )
    pose_arm(
        rig, "L",
        swing=0.10 + 0.05 * math.sin(w + 1.0),
        lift=1.25 + 0.05 * math.sin(w),
        elbow=0.55 + 0.04 * math.sin(w + 0.8),
        hand=0.15,
    )
    pose_arm(
        rig, "R",
        swing=0.10 + 0.05 * math.sin(w + 1.4),
        lift=1.25 + 0.05 * math.sin(w + 0.3),
        elbow=0.55 + 0.04 * math.sin(w + 1.1),
        hand=0.15,
    )
    solve_leg(
        rig, "L",
        0.17 + 0.020 * math.sin(w),
        0.40 + 0.025 * math.sin(w + 0.4),
        0.10, 0.0,
    )
    solve_leg(
        rig, "R",
        0.03 + 0.020 * math.sin(w + math.pi),
        0.34 + 0.020 * math.sin(w + 0.4 + math.pi),
        0.02, 0.0,
    )


def pose_fall(rig, t: float) -> None:
    w = math.tau * t
    hips_z = 0.07 + 0.012 * math.sin(w)
    hips_y = -0.015 + 0.008 * math.sin(w + 0.5)

    pose_torso(
        rig,
        hips_offset=(0.006 * math.sin(w), hips_y, hips_z),
        hips_rot=(-0.05, 0.020 * math.sin(w), 0.0),
        spine=(-0.18 + 0.02 * math.sin(w), 0.03 * math.sin(w + 0.7), 0.0),
        chest=(-0.06, 0.02 * math.sin(w + 1.1), 0.0),
        neck=(0.04, 0.0, 0.0),
        head=(0.12, 0.02 * math.sin(w + 0.4), 0.0),
    )
    pose_arm(
        rig, "L",
        swing=-0.25 + 0.04 * math.sin(w + 0.5),
        lift=2.20 + 0.05 * math.sin(w),
        elbow=0.25,
        hand=0.05,
    )
    pose_arm(
        rig, "R",
        swing=-0.25 + 0.04 * math.sin(w + 1.1),
        lift=2.20 + 0.05 * math.sin(w + 0.4),
        elbow=0.25,
        hand=0.05,
    )
    solve_leg(rig, "L", -0.18 + 0.015 * math.sin(w), 0.22, -0.28, 0.10)
    solve_leg(rig, "R", -0.06 + 0.015 * math.sin(w + math.pi), 0.17, -0.24, 0.08)


def pose_land(rig, t: float) -> None:
    hips_z = curve(
        t,
        [(0.0, 0.060), (0.08, -0.200), (0.18, -0.180), (0.45, -0.040), (0.70, 0.010), (1.0, 0.0)],
    )
    spine_x = curve(t, [(0.0, 0.02), (0.08, -0.34), (0.20, -0.26), (0.50, -0.06), (1.0, 0.0)])
    chest_x = curve(t, [(0.0, 0.01), (0.08, -0.20), (0.20, -0.14), (0.50, -0.03), (1.0, 0.0)])
    squash = curve(t, [(0.0, 1.04), (0.08, 0.88), (0.20, 0.93), (0.50, 1.01), (1.0, 1.0)])
    widen = curve(t, [(0.0, 0.97), (0.08, 1.05), (0.20, 1.03), (0.50, 1.0), (1.0, 1.0)])
    arm_swing = curve(t, [(0.0, 0.10), (0.08, 0.70), (0.25, 0.45), (0.55, 0.10), (1.0, 0.0)])
    arm_lift = curve(t, [(0.0, 1.15), (0.08, 0.30), (0.25, 0.20), (0.55, 0.06), (1.0, 0.02)])
    elbow = curve(t, [(0.0, 0.55), (0.08, 0.75), (0.30, 0.45), (1.0, 0.10)])

    pose_torso(
        rig,
        hips_offset=(0.0, 0.0, hips_z),
        hips_rot=(-0.03, 0.0, 0.0),
        spine=(spine_x, 0.0, 0.0),
        chest=(chest_x, 0.0, 0.0),
        neck=(-spine_x * 0.35, 0.0, 0.0),
        head=(0.10 + spine_x * 0.25, 0.0, 0.0),
        spine_scale=(widen, squash, widen),
        chest_scale=(widen * 0.99, 1.0 + (squash - 1.0) * 0.6, widen * 0.99),
    )
    pose_arm(rig, "L", swing=arm_swing, lift=arm_lift, elbow=elbow, hand=0.05)
    pose_arm(rig, "R", swing=arm_swing, lift=arm_lift, elbow=elbow, hand=0.05)
    solve_leg(rig, "L", 0.0, ANKLE_HEIGHT, 0.05, 0.0)
    solve_leg(rig, "R", 0.0, ANKLE_HEIGHT, 0.05, 0.0)


def pose_win(rig, t: float) -> None:
    hips_z = curve(
        t,
        [
            (0.0, 0.0), (0.08, -0.105), (0.18, 0.235), (0.30, -0.075),
            (0.42, 0.195), (0.55, -0.050), (0.68, 0.105), (0.80, 0.0), (1.0, 0.0),
        ],
    )
    hop = max(0.0, hips_z)
    leg_z = ANKLE_HEIGHT + hop * 1.02
    leg_y = hop * 0.25
    spine_x = curve(
        t,
        [(0.0, 0.0), (0.08, -0.24), (0.18, 0.06), (0.30, -0.18),
         (0.42, 0.05), (0.55, -0.12), (0.68, 0.02), (0.80, 0.0), (1.0, 0.0)],
    )
    head_x = curve(
        t,
        [(0.0, 0.0), (0.08, 0.15), (0.18, -0.22), (0.30, 0.10),
         (0.42, -0.20), (0.55, 0.08), (0.68, -0.10), (0.80, 0.0), (1.0, 0.0)],
    )
    yaw = 0.12 * math.sin(math.tau * t * 2.0) * math.sin(math.pi * t)
    arm_swing = curve(
        t,
        [(0.0, 0.0), (0.08, -0.75), (0.18, 0.15), (0.30, 0.65),
         (0.42, 0.10), (0.55, 0.55), (0.68, 0.05), (0.80, 0.10), (1.0, 0.0)],
    )
    arm_lift = curve(
        t,
        [(0.0, 0.02), (0.08, 0.05), (0.18, 2.55), (0.30, 0.60),
         (0.42, 2.35), (0.55, 0.45), (0.68, 2.10), (0.80, 0.40), (1.0, 0.02)],
    )
    elbow = curve(
        t,
        [(0.0, 0.10), (0.08, 0.30), (0.18, 0.20), (0.30, 0.80),
         (0.42, 0.25), (0.55, 0.85), (0.68, 0.30), (0.80, 0.50), (1.0, 0.10)],
    )

    pose_torso(
        rig,
        hips_offset=(0.0, 0.0, hips_z),
        hips_rot=(-0.03, yaw, 0.03 * math.sin(math.tau * t * 2.0)),
        spine=(spine_x, -yaw * 0.5, 0.02 * math.sin(math.tau * t * 2.0)),
        chest=(spine_x * 0.45, -yaw * 0.4, 0.01),
        neck=(-spine_x * 0.3, yaw * 0.2, 0.0),
        head=(head_x, yaw * 0.8, 0.0),
        chest_scale=(1.0, 1.0 + 0.02 * max(0.0, math.sin(math.pi * t * 6.0)), 1.0),
    )
    pose_arm(rig, "L", swing=arm_swing, lift=arm_lift, elbow=elbow, hand=0.15)
    pose_arm(rig, "R", swing=arm_swing * 0.92, lift=arm_lift * 0.97, elbow=elbow, hand=0.15)
    solve_leg(rig, "L", leg_y + 0.02, leg_z, 0.05, 0.0)
    solve_leg(rig, "R", leg_y - 0.02, leg_z, 0.05, 0.0)


def pose_lose(rig, t: float) -> None:
    hips_z = curve(
        t,
        [(0.0, 0.0), (0.15, -0.08), (0.40, -0.095), (0.60, -0.02), (0.80, 0.01), (1.0, 0.0)],
    )
    spine_x = curve(
        t,
        [(0.0, 0.0), (0.18, -0.30), (0.42, -0.34), (0.58, -0.05),
         (0.72, 0.03), (0.86, 0.0), (1.0, 0.0)],
    )
    head_x = curve(
        t,
        [(0.0, 0.0), (0.18, -0.32), (0.42, -0.36), (0.55, 0.08),
         (0.70, 0.05), (0.86, 0.0), (1.0, 0.0)],
    )
    head_y = 0.10 * math.sin(math.tau * t * 2.0) * smoothstep(0.18, 0.30, t) * (1.0 - smoothstep(0.46, 0.58, t))
    shrug = curve(t, [(0.0, 0.0), (0.48, 0.0), (0.58, 0.75), (0.70, 0.55), (0.84, 0.0), (1.0, 0.0)])
    elbow = curve(t, [(0.0, 0.10), (0.18, 0.05), (0.50, 0.10), (0.60, 1.05), (0.75, 0.85), (0.88, 0.10), (1.0, 0.10)])

    pose_torso(
        rig,
        hips_offset=(0.0, 0.0, hips_z),
        hips_rot=(-0.02, 0.0, 0.0),
        spine=(spine_x, 0.02 * math.sin(math.tau * t), 0.0),
        chest=(spine_x * 0.45, 0.02, 0.0),
        neck=(-spine_x * 0.35, 0.0, 0.0),
        head=(head_x, head_y, 0.03 * math.sin(math.tau * t)),
    )
    pose_arm(rig, "L", swing=0.02, lift=0.02 + shrug, elbow=elbow, hand=-0.05)
    pose_arm(rig, "R", swing=0.02, lift=0.02 + shrug, elbow=elbow, hand=-0.05)
    solve_leg(rig, "L", 0.0, ANKLE_HEIGHT)
    solve_leg(rig, "R", 0.0, ANKLE_HEIGHT)


def pose_slide(rig, t: float) -> None:
    hips_z = curve(
        t,
        [(0.0, 0.0), (0.12, -0.28), (0.25, -0.32), (0.72, -0.32), (0.90, -0.05), (1.0, 0.0)],
    )
    hips_y = curve(t, [(0.0, 0.0), (0.15, -0.055), (0.30, -0.08), (0.70, -0.08), (0.90, 0.0), (1.0, 0.0)])
    spine_x = curve(
        t,
        [(0.0, 0.0), (0.12, 0.32), (0.28, 0.48), (0.70, 0.48), (0.88, 0.08), (1.0, 0.0)],
    )
    head_x = curve(
        t,
        [(0.0, 0.0), (0.15, -0.28), (0.30, -0.32), (0.70, -0.32), (0.88, 0.05), (1.0, 0.0)],
    )
    arm_swing = curve(t, [(0.0, 0.0), (0.15, -0.85), (0.30, -0.95), (0.70, -0.95), (0.88, 0.0), (1.0, 0.0)])
    arm_lift = curve(t, [(0.0, 0.02), (0.15, 0.35), (0.30, 0.45), (0.70, 0.45), (0.88, 0.05), (1.0, 0.02)])

    pose_torso(
        rig,
        hips_offset=(0.0, hips_y, hips_z),
        hips_rot=(0.05, 0.0, 0.0),
        spine=(spine_x, 0.0, 0.0),
        chest=(spine_x * 0.45, 0.0, 0.0),
        neck=(-spine_x * 0.45, 0.0, 0.0),
        head=(head_x, 0.0, 0.0),
    )
    pose_arm(rig, "L", swing=arm_swing, lift=arm_lift, elbow=0.20, hand=0.0)
    pose_arm(rig, "R", swing=arm_swing, lift=arm_lift * 1.05, elbow=0.25, hand=0.0)

    lead_y = curve(t, [(0.0, 0.0), (0.15, 0.38), (0.30, 0.43), (0.70, 0.43), (0.90, 0.0), (1.0, 0.0)])
    trail_y = curve(t, [(0.0, 0.0), (0.15, 0.14), (0.30, 0.18), (0.70, 0.18), (0.90, 0.0), (1.0, 0.0)])
    lead_z = curve(t, [(0.0, ANKLE_HEIGHT), (0.15, 0.14), (0.30, 0.12), (0.70, 0.12), (0.90, ANKLE_HEIGHT), (1.0, ANKLE_HEIGHT)])
    trail_z = curve(t, [(0.0, ANKLE_HEIGHT), (0.15, 0.20), (0.30, 0.16), (0.70, 0.16), (0.90, ANKLE_HEIGHT), (1.0, ANKLE_HEIGHT)])
    solve_leg(rig, "L", lead_y, lead_z, -0.05, 0.05)
    solve_leg(rig, "R", trail_y, trail_z, 0.05, 0.0)


def pose_turn(rig, t: float, direction: float) -> None:
    envelope = math.sin(math.pi * t)
    swing_env = envelope * envelope
    hips_x = 0.040 * envelope * direction
    yaw = 0.10 * envelope * direction
    roll = 0.070 * envelope * direction

    pose_torso(
        rig,
        hips_offset=(hips_x, 0.0, -0.008 * envelope),
        hips_rot=(-0.01, yaw, roll),
        spine=(-0.01, yaw * 0.35, roll * 0.80),
        chest=(0.0, yaw * 0.25, roll * 0.55),
        neck=(0.0, -yaw * 0.25, -roll * 0.25),
        head=(0.02 * envelope, -yaw * 0.55, -roll * 0.45),
    )
    pose_arm(
        rig, "L",
        swing=-0.10 * envelope * direction,
        lift=0.10 * swing_env,
        elbow=0.12 + 0.08 * envelope,
        hand=0.02,
    )
    pose_arm(
        rig, "R",
        swing=0.10 * envelope * direction,
        lift=0.10 * swing_env,
        elbow=0.12 + 0.08 * envelope,
        hand=0.02,
    )
    solve_leg(rig, "L", 0.0, ANKLE_HEIGHT)
    solve_leg(rig, "R", 0.0, ANKLE_HEIGHT)


# ---------------------------------------------------------------------------
# Action baking
# ---------------------------------------------------------------------------


CLIP_SPECS = {
    "Idle": (121, True, pose_idle),
    "Run": (RUN_INTERVALS + 1, True, pose_run),
    "Jump": (22, False, pose_jump),
    "Airborne": (31, True, pose_airborne),
    "Fall": (21, True, pose_fall),
    "Land": (19, False, pose_land),
    "Win": (91, True, pose_win),
    "Lose": (76, True, pose_lose),
    "Slide": (31, False, pose_slide),
    "Turn": (21, True, lambda rig, t: pose_turn(rig, t, 1.0)),
    "Turn_Right": (21, True, lambda rig, t: pose_turn(rig, t, -1.0)),
}


def channelbag_fcurves(action: bpy.types.Action):
    """Return the f-curves of a layered (Blender 5.x) or legacy action."""
    fcurves = []
    try:
        slots = list(action.slots)
        for layer in action.layers:
            for strip in layer.strips:
                if not hasattr(strip, "channelbag"):
                    continue
                for slot in slots:
                    channelbag = strip.channelbag(slot)
                    if channelbag is not None:
                        fcurves.extend(channelbag.fcurves)
    except (AttributeError, RuntimeError, TypeError):
        pass
    if fcurves:
        return fcurves
    try:
        return list(action.fcurves)  # Blender 4.x
    except (AttributeError, RuntimeError):
        return []


def force_linear_interpolation(action: bpy.types.Action) -> None:
    """Baked samples must not be re-shaped by Bezier handles."""
    for fcurve in channelbag_fcurves(action):
        for point in fcurve.keyframe_points:
            point.interpolation = "LINEAR"


def bake_action(rig: bpy.types.Object, name: str, frames: int, loop: bool, pose_func) -> bpy.types.Action:
    action = bpy.data.actions.new(name)
    tag_action(action)
    action.use_fake_user = True
    action.use_frame_range = True
    action.frame_start = 1.0
    action.frame_end = float(frames)
    action.use_cyclic = loop
    action["loop"] = loop
    action["fps"] = FPS
    action["frame_start"] = 1
    action["frame_end"] = frames

    rig.animation_data.action = action
    if action.slots:
        rig.animation_data.action_slot = action.slots[0]

    for frame in range(1, frames + 1):
        t = (frame - 1) / float(frames - 1)
        reset_pose(rig)
        pose_func(rig, t)
        bpy.context.view_layer.update()

        for pose_bone in rig.pose.bones:
            group = pose_bone.name
            pose_bone.keyframe_insert("location", frame=frame, group=group)
            pose_bone.keyframe_insert("rotation_euler", frame=frame, group=group)
            pose_bone.keyframe_insert("scale", frame=frame, group=group)

    # Blender 5.2 stores curves in layered channelbags. Explicitly force linear
    # interpolation so the baked 30 fps samples are played back unchanged.
    force_linear_interpolation(action)
    return action


def build_actions(rig: bpy.types.Object) -> dict[str, bpy.types.Action]:
    rig.animation_data_create()
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"

    actions: dict[str, bpy.types.Action] = {}
    for name in CLIP_ORDER:
        frames, loop, pose_func = CLIP_SPECS[name]
        actions[name] = bake_action(rig, name, frames, loop, pose_func)
        print(f"  baked {name}: {frames} frames ({'loop' if loop else 'one-shot'})")

    rig.animation_data.action = actions["Idle"]
    if actions["Idle"].slots:
        rig.animation_data.action_slot = actions["Idle"].slots[0]
    reset_pose(rig)
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = CLIP_SPECS["Idle"][0]
    bpy.context.scene.frame_set(1)
    return actions


# ---------------------------------------------------------------------------
# Studio preview
# ---------------------------------------------------------------------------


def build_studio(collection):
    # Ground.
    mesh = bpy.data.meshes.new("TK_GroundMesh")
    mesh[TAG] = True
    mesh.from_pydata(
        [(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)],
        [],
        [(0, 1, 2, 3)],
    )
    mesh.update()
    ground = bpy.data.objects.new("TK_Ground", mesh)
    ground[TAG] = True
    collection.objects.link(ground)

    material = bpy.data.materials.get("TK_Mat_Ground")
    if material is None:
        material = bpy.data.materials.new("TK_Mat_Ground")
        material[TAG] = True
        material.diffuse_color = (0.58, 0.86, 0.82, 1.0)
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (0.58, 0.86, 0.82, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.82
    ground.data.materials.append(material)

    # Lights.
    def add_area(name, location, energy, size, colour):
        data = bpy.data.lights.new(name, "AREA")
        data[TAG] = True
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = colour
        obj = bpy.data.objects.new(name, data)
        obj[TAG] = True
        obj.location = location
        collection.objects.link(obj)
        direction = Vector((0.0, 0.0, 1.05)) - obj.location
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        return obj

    add_area("TK_Key", (2.8, 3.6, 3.4), 520.0, 2.4, (1.0, 0.93, 0.82))
    add_area("TK_Fill", (-3.0, 2.4, 2.0), 260.0, 3.0, (0.66, 0.90, 1.0))
    add_area("TK_Rim", (0.5, -3.5, 2.8), 420.0, 2.0, (0.45, 1.0, 0.94))

    # Camera.
    camera_data = bpy.data.cameras.new("TK_PreviewCamera")
    camera_data[TAG] = True
    camera_data.lens = 50.0
    camera = bpy.data.objects.new("TK_PreviewCamera", camera_data)
    camera[TAG] = True
    camera.location = (1.75, 2.75, 1.48)
    target = Vector((0.0, 0.0, 1.02))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    collection.objects.link(camera)
    bpy.context.scene.camera = camera

    world = bpy.data.worlds.get("TK_World") or bpy.data.worlds.new("TK_World")
    world[TAG] = True
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.035, 0.13, 0.15, 1.0)
    background.inputs["Strength"].default_value = 0.65
    bpy.context.scene.world = world


def render_previews(rig, actions: dict[str, bpy.types.Action]) -> None:
    scene = bpy.context.scene
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
        scene.eevee.taa_render_samples = 24
    except Exception:
        scene.render.engine = "BLENDER_WORKBENCH"

    poses = [
        ("Idle", 30),
        ("Run", 6),
        ("Jump", 13),
        ("Win", 18),
    ]
    images = []
    for clip, frame in poses:
        action = actions[clip]
        rig.animation_data.action = action
        if action.slots:
            rig.animation_data.action_slot = action.slots[0]
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        path = SCRIPT_DIR / f"rig_preview_{clip.lower()}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        images.append(path)

    # Contact sheet with numpy (2 x 2).
    tiles = []
    for path in images:
        image = bpy.data.images.load(str(path), check_existing=False)
        width, height = image.size
        data = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
        tiles.append(data)
        bpy.data.images.remove(image)

    if tiles:
        height, width = tiles[0].shape[:2]
        sheet = np.ones((height * 2, width * 2, 4), dtype=np.float32)
        sheet[height:, :width] = tiles[0]
        sheet[height:, width:] = tiles[1]
        sheet[:height, :width] = tiles[2]
        sheet[:height, width:] = tiles[3]
        out = bpy.data.images.new("TK_RigPreview", width=width * 2, height=height * 2)
        out.pixels.foreach_set(sheet.ravel())
        out.filepath_raw = str(PREVIEW_PATH)
        out.file_format = "PNG"
        out.save()
        bpy.data.images.remove(out)

    # Leave the file in idle.
    rig.animation_data.action = actions["Idle"]
    if actions["Idle"].slots:
        rig.animation_data.action_slot = actions["Idle"].slots[0]
    scene.frame_set(1)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


def export_glb(rig: bpy.types.Object, body: bpy.types.Object) -> None:
    base.select_only([rig, body])
    bpy.context.view_layer.objects.active = rig

    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_skins=True,
        export_all_influences=False,
        export_influence_nb=4,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_normals=True,
        export_tangents=False,
        export_texcoords=True,
        export_extras=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_nla_strips=False,
        export_anim_single_armature=True,
        export_anim_scene_split_object=False,
        export_force_sampling=True,
        export_bake_animation=False,
        export_frame_range=False,
        export_anim_slide_to_zero=True,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True,
        export_reset_pose_bones=True,
        export_def_bones=False,
        export_hierarchy_flatten_bones=False,
    )

    for destination in GAME_GLB_PATHS:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(GLB_PATH, destination)


# ---------------------------------------------------------------------------
# Build report
# ---------------------------------------------------------------------------


def build_report(body, rig, actions) -> dict:
    import json

    mesh = body.data
    triangles = sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)
    material_names = [slot.material.name for slot in body.material_slots if slot.material]
    images = sorted({img.name for img in bpy.data.images if img.get(TAG)})
    max_influences = 0
    for vertex in mesh.vertices:
        max_influences = max(max_influences, len(vertex.groups))

    clips = {}
    for name in CLIP_ORDER:
        action = actions[name]
        frames = CLIP_SPECS[name][0]
        clips[name] = {
            "frames": frames,
            "duration_seconds": round((frames - 1) / FPS, 4),
            "loop": CLIP_SPECS[name][1],
        }

    report = {
        "character": CHARACTER_NAME,
        "blender_version": bpy.app.version_string,
        "fps": FPS,
        "units": "meters",
        "height_meters": 1.75,
        "mesh": {
            "name": body.name,
            "vertices": len(mesh.vertices),
            "triangles": triangles,
            "material_slots": len(body.material_slots),
            "materials": material_names,
            "images": images,
            "max_vertex_influences": max_influences,
            "uv_layers": [layer.name for layer in mesh.uv_layers],
        },
        "armature": {
            "name": rig.name,
            "bones": len(rig.data.bones),
            "deform_bones": sum(1 for bone in rig.data.bones if bone.use_deform),
            "bone_names": [bone.name for bone in rig.data.bones],
        },
        "clips": clips,
        "root_motion": "in_place",
        "run_reference_speed_mps": round(RUN_REFERENCE_SPEED, 4),
        "run_cycle_seconds": round(RUN_INTERVALS / FPS, 4),
        "run_stance_ratio": RUN_STANCE,
        "forward_axis_blender": "+Y",
        "forward_axis_gltf": "-Z",
        "export_path": str(GLB_PATH),
        "game_copies": [str(path) for path in GAME_GLB_PATHS],
    }
    return report


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    print("Turkuaz rig pipeline: start")
    set_object_mode()
    remove_startup_objects()
    clear_previous_build()

    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"

    master = new_collection("Turkuaz Character Rig", scene.collection)
    mesh_collection = new_collection("Turkuaz Character Mesh", master)
    rig_collection = new_collection("Turkuaz Character Armature", master)
    studio_collection = new_collection("Turkuaz Rig Studio", scene.collection)

    print("  materials")
    materials = base.create_materials()
    materials["badge"] = make_badge_material(make_badge_image())

    print("  mesh")
    parts = build_character_mesh(materials, mesh_collection)
    skin_parts(parts)

    # Join everything into one skinned mesh. The torso has a UV layer, so the
    # joined result preserves the badge UV island.
    base.select_only([obj for obj, _ in parts])
    bpy.context.view_layer.objects.active = parts[0][0]
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = MESH_NAME
    body.data.name = MESH_NAME
    body.data.materials  # keep material slots

    # Recalculate outward normals, then smooth-shade organic surfaces.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    for polygon in body.data.polygons:
        polygon.use_smooth = True

    print("  armature")
    rig = build_armature(rig_collection)
    bind_mesh(body, rig)

    print("  actions")
    actions = build_actions(rig)

    print("  studio")
    build_studio(studio_collection)

    print("  export")
    export_glb(rig, body)

    print("  preview")
    try:
        render_previews(rig, actions)
    except Exception as error:  # pragma: no cover - render backend can vary
        print(f"  preview render skipped: {error}")

    # Save after export so the .blend is ready for an artist.
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    report = build_report(body, rig, actions)
    import json

    VALIDATION_JSON.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("\nSummary")
    print(f"  mesh: {report['mesh']['vertices']} verts / {report['mesh']['triangles']} tris")
    print(f"  materials: {len(report['mesh']['materials'])}  images: {report['mesh']['images']}")
    print(f"  bones: {report['armature']['bones']} ({report['armature']['deform_bones']} deform)")
    print(f"  clips: {', '.join(CLIP_ORDER)}")
    print(f"  run reference speed: {RUN_REFERENCE_SPEED:.3f} m/s")
    print(f"  blend: {BLEND_PATH}")
    print(f"  glb:   {GLB_PATH}")
    print("Turkuaz rig pipeline: done")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback

        traceback.print_exc()
        raise
