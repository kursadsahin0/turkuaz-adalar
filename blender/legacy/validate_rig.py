#!/usr/bin/env python3
"""Validate the Turkuaz character rig, its baked actions and export readiness.

Run headless against the generated .blend:

    /Applications/Blender.app/Contents/MacOS/Blender -b \
        blender/turkuaz_character_rigged.blend \
        --python blender/validate_rig.py

The script writes ``blender/rig_validation_report.json`` and exits with a
non-zero status when a hard check fails.  Warnings do not fail the build.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
REPORT_PATH = SCRIPT_DIR / "rig_validation_report.json"

FPS = 30
MESH_NAME = "TK_CharacterMesh"
RIG_NAME = "TK_Armature"
ROOT_BONE = "root"
HEIGHT_TARGET = 1.75

CLIP_SPECS = {
    "Idle": (121, True),
    "Run": (17, True),
    "Jump": (22, False),
    "Airborne": (31, True),
    "Fall": (21, True),
    "Land": (19, False),
    "Win": (91, True),
    "Lose": (76, True),
    "Slide": (31, False),
    "Turn": (21, True),
    "Turn_Right": (21, True),
}
LOOP_CLIPS = {"Idle", "Run", "Airborne", "Fall"}
LOOPABLE_BONUS = {"Win", "Lose", "Turn", "Turn_Right"}

EXPECTED_PARENTS = {
    "root": None,
    "hips": "root",
    "spine": "hips",
    "chest": "spine",
    "neck": "chest",
    "head": "neck",
    "shoulder.L": "chest",
    "upper_arm.L": "shoulder.L",
    "forearm.L": "upper_arm.L",
    "hand.L": "forearm.L",
    "shoulder.R": "chest",
    "upper_arm.R": "shoulder.R",
    "forearm.R": "upper_arm.R",
    "hand.R": "forearm.R",
    "thigh.L": "hips",
    "shin.L": "thigh.L",
    "foot.L": "shin.L",
    "toe.L": "foot.L",
    "thigh.R": "hips",
    "shin.R": "thigh.R",
    "foot.R": "shin.R",
    "toe.R": "foot.R",
}

CHANNELS_PER_BONE = 9  # location(3) + rotation_euler(3) + scale(3)
ANKLE_HEIGHT = 0.11
STANCE_Z_TOLERANCE = 0.025
IK_POSITION_TOLERANCE = 0.015
FOOT_SPEED_TOLERANCE = 0.08  # 8 % of the authored stance speed

checks: list[dict] = []
metrics: dict = {}


def record(name: str, status: str, detail) -> None:
    checks.append({"name": name, "status": status, "detail": detail})
    print(f"  [{status.upper():4}] {name}: {detail}")


def check(name: str, condition: bool, detail, warning: bool = False) -> bool:
    record(name, "pass" if condition else ("warn" if warning else "fail"), detail)
    return condition


def finite(values) -> bool:
    return all(math.isfinite(float(v)) for v in values)


def angle_delta(a: float, b: float) -> float:
    return abs(math.atan2(math.sin(a - b), math.cos(a - b)))


def evaluate_action(rig, action, frame: int) -> None:
    animation_data = rig.animation_data or rig.animation_data_create()
    animation_data.action = action
    if action.slots:
        animation_data.action_slot = action.slots[0]
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()


def sample_pose(rig) -> dict:
    return {
        bone.name: {
            "location": tuple(bone.location),
            "rotation": tuple(bone.rotation_euler),
            "scale": tuple(bone.scale),
            "head": tuple(bone.head),
            "tail": tuple(bone.tail),
        }
        for bone in rig.pose.bones
    }


def sample_frames(rig, action, frames: list[int]) -> dict[int, dict]:
    samples = {}
    for frame in frames:
        evaluate_action(rig, action, frame)
        samples[frame] = sample_pose(rig)
    return samples


def loop_seam(samples: dict[int, dict], first: int, last: int) -> dict:
    delta_location = delta_rotation = delta_scale = delta_position = 0.0
    for name, pose_first in samples[first].items():
        pose_last = samples[last][name]
        delta_location = max(
            delta_location,
            max(abs(a - b) for a, b in zip(pose_first["location"], pose_last["location"])),
        )
        delta_rotation = max(
            delta_rotation,
            max(angle_delta(a, b) for a, b in zip(pose_first["rotation"], pose_last["rotation"])),
        )
        delta_scale = max(
            delta_scale,
            max(abs(a - b) for a, b in zip(pose_first["scale"], pose_last["scale"])),
        )
        delta_position = max(
            delta_position,
            max(abs(a - b) for a, b in zip(pose_first["head"], pose_last["head"])),
        )
    return {
        "location": delta_location,
        "rotation_radians": delta_rotation,
        "scale": delta_scale,
        "bone_head_meters": delta_position,
    }


# ---------------------------------------------------------------------------
# Individual validation groups
# ---------------------------------------------------------------------------


def validate_scene(scene) -> None:
    fps = scene.render.fps / scene.render.fps_base
    check("scene.fps", abs(fps - FPS) < 1e-6, f"{fps:g} fps (expected {FPS})")
    check(
        "scene.units",
        scene.unit_settings.system == "METRIC",
        f"{scene.unit_settings.system} / {scene.unit_settings.length_unit}",
    )

    mesh_object = bpy.data.objects.get(MESH_NAME)
    rig = bpy.data.objects.get(RIG_NAME)
    check("object.mesh.exists", mesh_object is not None, MESH_NAME)
    check("object.rig.exists", rig is not None, RIG_NAME)
    if mesh_object is None or rig is None:
        raise SystemExit(2)

    check(
        "object.mesh.type",
        mesh_object.type == "MESH",
        f"{mesh_object.type}",
    )
    check("object.rig.type", rig.type == "ARMATURE", f"{rig.type}")

    modifiers = [m for m in mesh_object.modifiers if m.type == "ARMATURE"]
    check(
        "mesh.armature_modifier",
        len(modifiers) == 1 and modifiers[0].object == rig,
        f"{len(modifiers)} armature modifier(s), target="
        f"{modifiers[0].object.name if modifiers and modifiers[0].object else None}",
    )
    check(
        "mesh.object_transform",
        mesh_object.location.length < 1e-6
        and all(abs(v - 1.0) < 1e-6 for v in mesh_object.scale),
        "mesh object at origin with unit scale",
    )
    check(
        "rig.object_transform",
        rig.location.length < 1e-6
        and all(abs(v - 1.0) < 1e-6 for v in rig.scale),
        "rig object at origin with unit scale",
    )
    check(
        "rig.display",
        rig.data.display_type in {"OCTAHEDRAL", "STICK", "BBONE", "WIRE"},
        f"armature display type {rig.data.display_type}",
        warning=True,
    )
    check(
        "rig.animation_data",
        rig.animation_data is not None,
        "armature has animation data",
    )


def validate_mesh(mesh_object) -> None:
    mesh = mesh_object.data
    vertices = len(mesh.vertices)
    triangles = sum(max(0, len(poly.vertices) - 2) for poly in mesh.polygons)
    metrics["mesh"] = {
        "vertices": vertices,
        "triangles": triangles,
        "material_slots": len(mesh_object.material_slots),
        "uv_layers": [layer.name for layer in mesh.uv_layers],
    }

    check("mesh.triangles", triangles > 5000, f"{triangles} triangles")
    check("mesh.uv_layer", len(mesh.uv_layers) >= 1, [l.name for l in mesh.uv_layers])

    # Rest-pose dimensions.
    zs = [vertex.co.z for vertex in mesh.vertices]
    xs = [vertex.co.x for vertex in mesh.vertices]
    ys = [vertex.co.y for vertex in mesh.vertices]
    height = max(zs) - min(zs)
    metrics["mesh"]["bounds"] = {
        "x": [round(min(xs), 4), round(max(xs), 4)],
        "y": [round(min(ys), 4), round(max(ys), 4)],
        "z": [round(min(zs), 4), round(max(zs), 4)],
    }
    check(
        "mesh.height",
        abs(height - HEIGHT_TARGET) < 0.1,
        f"{height:.3f} m (target {HEIGHT_TARGET} m)",
    )
    check(
        "mesh.feet_on_ground",
        -0.01 <= min(zs) <= 0.05,
        f"lowest vertex z={min(zs):.4f} m",
    )
    check(
        "mesh.centered",
        abs(min(xs) + max(xs)) < 0.05,
        f"x bounds {min(xs):.3f}..{max(xs):.3f}",
    )

    # Skin weights.
    group_names = {group.index: group.name for group in mesh_object.vertex_groups}
    deform_names = {
        bone.name for bone in bpy.data.objects[RIG_NAME].data.bones if bone.use_deform
    }
    unknown_groups = sorted(set(group_names.values()) - deform_names)
    check(
        "weights.groups_map_to_deform_bones",
        not unknown_groups,
        f"unexpected groups: {unknown_groups}" if unknown_groups else "all groups are deform bones",
    )

    unweighted = 0
    max_influences = 0
    bad_sum = 0
    bad_range = 0
    non_deform_weights = 0
    for vertex in mesh.vertices:
        influences = [element for element in vertex.groups if element.weight > 1e-6]
        if not influences:
            unweighted += 1
            continue
        max_influences = max(max_influences, len(influences))
        total = sum(element.weight for element in influences)
        if abs(total - 1.0) > 1e-4:
            bad_sum += 1
        if any(element.weight < 0.0 or element.weight > 1.0 for element in influences):
            bad_range += 1
        non_deform_weights += sum(
            1 for element in influences if group_names[element.group] not in deform_names
        )

    metrics["weights"] = {
        "max_influences": max_influences,
        "unweighted_vertices": unweighted,
        "vertices_with_bad_sum": bad_sum,
    }
    check(
        "weights.max_influences",
        max_influences <= 4,
        f"{max_influences} influences per vertex (limit 4)",
    )
    check("weights.no_unweighted", unweighted == 0, f"{unweighted} unweighted vertices")
    check(
        "weights.normalized",
        bad_sum == 0,
        f"{bad_sum} vertices with weight sum != 1",
    )
    check("weights.range", bad_range == 0, f"{bad_range} vertices with weight outside 0..1")
    check(
        "weights.only_deform_bones",
        non_deform_weights == 0,
        f"{non_deform_weights} weights on non-deform bones",
    )

    # Materials and textures.
    materials = [slot.material for slot in mesh_object.material_slots]
    missing = [i for i, material in enumerate(materials) if material is None]
    metrics["mesh"]["materials"] = [m.name for m in materials if m]
    check("materials.no_empty_slots", not missing, f"empty slots: {missing}" if missing else "24/24 filled")
    check(
        "materials.node_based",
        all(m and m.use_nodes for m in materials),
        f"{sum(1 for m in materials if m and m.use_nodes)}/{len(materials)} node-based",
    )

    images = sorted({node.image.name for m in materials for node in (m.node_tree.nodes if m and m.use_nodes else []) if getattr(node, "image", None)})
    metrics["mesh"]["images"] = images
    check("textures.image_nodes", bool(images), images or "no image textures found")

    packed_ok = True
    for name in images:
        image = bpy.data.images.get(name)
        if image is None:
            packed_ok = False
            continue
        check(
            f"textures.{name}.resolution",
            image.size[0] > 0 and image.size[1] > 0,
            f"{image.size[0]}x{image.size[1]}",
        )
        check(
            f"textures.{name}.packed",
            image.packed_file is not None,
            "packed into .blend" if image.packed_file else "not packed (export risk)",
            warning=False,
        )
        packed_ok = packed_ok and image.packed_file is not None
    if images:
        check("textures.export_ready", packed_ok, "all textures packed")


def validate_armature(rig) -> None:
    armature = rig.data
    bones = armature.bones
    names = [bone.name for bone in bones]
    deform = [bone.name for bone in bones if bone.use_deform]
    metrics["armature"] = {
        "bones": len(bones),
        "deform_bones": len(deform),
        "names": names,
    }

    check("armature.bone_count", len(bones) == 22, f"{len(bones)} bones")
    check("armature.deform_count", len(deform) == 21, f"{len(deform)} deform bones")
    check(
        "armature.required_bones",
        set(EXPECTED_PARENTS) <= set(names),
        f"missing: {sorted(set(EXPECTED_PARENTS) - set(names))}" if set(EXPECTED_PARENTS) - set(names) else "all required bones present",
    )

    parent_errors = []
    for name, expected in EXPECTED_PARENTS.items():
        bone = armature.bones.get(name)
        if bone is None:
            continue
        actual = bone.parent.name if bone.parent else None
        if actual != expected:
            parent_errors.append(f"{name}: {actual} != {expected}")
    check(
        "armature.hierarchy",
        not parent_errors,
        parent_errors or "hierarchy matches humanoid template",
    )

    symmetry_errors = []
    for name in names:
        if not name.endswith(".L"):
            continue
        other = armature.bones.get(name[:-2] + ".R")
        if other is None:
            symmetry_errors.append(f"missing {name[:-2]}.R")
            continue
        left, right = armature.bones[name], other
        if abs(left.head_local.x + right.head_local.x) > 1e-4:
            symmetry_errors.append(f"{name} head x")
        if abs(left.head_local.y - right.head_local.y) > 1e-4:
            symmetry_errors.append(f"{name} head y")
        if abs(left.head_local.z - right.head_local.z) > 1e-4:
            symmetry_errors.append(f"{name} head z")
    check(
        "armature.left_right_symmetry",
        not symmetry_errors,
        symmetry_errors or "mirrored left/right bones",
    )

    check(
        "armature.root_non_deform",
        not armature.bones[ROOT_BONE].use_deform,
        "root drives motion but does not deform the mesh",
    )

    constrained = [
        f"{pose_bone.name}:{constraint.type}"
        for pose_bone in rig.pose.bones
        for constraint in pose_bone.constraints
    ]
    check(
        "armature.baked_no_constraints",
        not constrained,
        constrained or "no pose constraints (all motion is baked FK)",
    )

    driven = list(rig.animation_data.drivers) if rig.animation_data else []
    check("armature.no_drivers", not driven, f"{len(driven)} driver(s)")

    extras = {
        "run_reference_speed": armature.get("run_reference_speed"),
        "run_cycle_seconds": armature.get("run_cycle_seconds"),
        "run_stance_ratio": armature.get("run_stance_ratio"),
    }
    metrics["armature"]["extras"] = extras
    check(
        "armature.run_metadata",
        all(value is not None for value in extras.values()),
        extras,
    )


def validate_action_channels(rig, action) -> None:
    expected_paths = {
        f'pose.bones["{bone.name}"].{prop}'
        for bone in rig.pose.bones
        for prop in ("location", "rotation_euler", "scale")
    }
    channelbag = None
    if action.layers and action.layers[0].strips:
        slot = action.slots[0] if action.slots else None
        try:
            channelbag = action.layers[0].strips[0].channelbag(slot)
        except Exception:
            channelbag = None

    if channelbag is None:
        record(f"action.{action.name}.channels", "warn", "channelbag API unavailable")
        return

    paths = {fcurve.data_path for fcurve in channelbag.fcurves}
    missing = sorted(expected_paths - paths)
    extra = sorted(paths - expected_paths)
    check(
        f"action.{action.name}.channels",
        not missing and not extra,
        f"{len(channelbag.fcurves)} fcurves; missing={missing[:3]} extra={extra[:3]}",
    )

    frames = CLIP_SPECS[action.name][0]
    short = [
        (fcurve.data_path, fcurve.array_index, len(fcurve.keyframe_points))
        for fcurve in channelbag.fcurves
        if len(fcurve.keyframe_points) != frames
    ]
    check(
        f"action.{action.name}.keyframe_count",
        not short,
        f"all channels keyed on {frames} frames" if not short else f"{len(short)} channels with wrong count (e.g. {short[0]})",
    )

    non_linear = sum(
        1
        for fcurve in channelbag.fcurves
        for point in fcurve.keyframe_points
        if point.interpolation != "LINEAR"
    )
    check(
        f"action.{action.name}.interpolation",
        non_linear == 0,
        f"{non_linear} non-linear keys" if non_linear else "all keys linear",
    )


def validate_actions(rig) -> dict[str, bpy.types.Action]:
    actions = {}
    for name in CLIP_SPECS:
        action = bpy.data.actions.get(name)
        check(f"clip.{name}.exists", action is not None, name)
        if action is not None:
            actions[name] = action

    check(
        "clips.required_set",
        set(actions) == set(CLIP_SPECS),
        f"{len(actions)}/{len(CLIP_SPECS)} required clips",
    )

    unexpected = sorted(
        action.name for action in bpy.data.actions if action.name not in CLIP_SPECS
    )
    check(
        "clips.no_unexpected_actions",
        not unexpected,
        unexpected or "only the authored clips exist",
        warning=True,
    )

    for name, action in actions.items():
        frames, loop = CLIP_SPECS[name]
        start, end = action.frame_range
        check(
            f"clip.{name}.frame_range",
            abs(start - 1.0) < 1e-4 and abs(end - frames) < 1e-4,
            f"{start:g}..{end:g} (expected 1..{frames})",
        )
        check(
            f"clip.{name}.fps_metadata",
            action.get("fps") == FPS,
            f"fps={action.get('fps')}",
        )
        check(
            f"clip.{name}.loop_metadata",
            bool(action.get("loop", loop)) == loop,
            f"loop={action.get('loop')}",
        )
        check(
            f"clip.{name}.cyclic_flag",
            bool(action.use_cyclic) == loop,
            f"use_cyclic={action.use_cyclic}",
        )

        validate_action_channels(rig, action)

        # Root must remain completely still: all locomotion is in place.
        scene = bpy.context.scene
        root_max_location = 0.0
        root_max_rotation = 0.0
        non_finite = 0
        samples = []
        for frame in range(1, frames + 1):
            evaluate_action(rig, action, frame)
            root = rig.pose.bones[ROOT_BONE]
            root_max_location = max(root_max_location, Vector(root.location).length)
            root_max_rotation = max(
                root_max_rotation,
                max(abs(value) for value in root.rotation_euler),
            )
            pose = sample_pose(rig)
            samples.append(pose)
            if not finite(
                [v for data in pose.values() for key in ("location", "rotation", "scale", "head", "tail") for v in data[key]]
            ):
                non_finite += 1
        check(
            f"clip.{name}.root_in_place",
            root_max_location < 1e-6 and root_max_rotation < 1e-6,
            f"max root translation {root_max_location:.2e} m, rotation {root_max_rotation:.2e} rad",
        )
        check(
            f"clip.{name}.finite",
            non_finite == 0,
            f"{non_finite} frames with non-finite values",
        )

        if loop:
            seam = loop_seam({1: samples[0], frames: samples[-1]}, 1, frames)
            check(
                f"clip.{name}.loop_seam",
                seam["rotation_radians"] < 1e-4
                and seam["location"] < 1e-5
                and seam["scale"] < 1e-5
                and seam["bone_head_meters"] < 1e-4,
                {key: round(value, 8) for key, value in seam.items()},
            )
            metrics.setdefault("loop_seams", {})[name] = {
                key: round(value, 8) for key, value in seam.items()
            }
        else:
            record(
                f"clip.{name}.one_shot",
                "pass",
                "start/end poses intentionally differ (transition clip)",
            )

    for name in sorted(LOOPABLE_BONUS):
        action = actions.get(name)
        if action is None:
            continue
        frames = CLIP_SPECS[name][0]
        evaluate_action(rig, action, 1)
        first = sample_pose(rig)
        evaluate_action(rig, action, frames)
        last = sample_pose(rig)
        seam = loop_seam({1: first, frames: last}, 1, frames)
        check(
            f"clip.{name}.loop_safe",
            seam["rotation_radians"] < 1e-4 and seam["bone_head_meters"] < 1e-4,
            {key: round(value, 8) for key, value in seam.items()},
        )

    return actions


def validate_run_feet(rig, actions) -> None:
    action = actions.get("Run")
    if action is None:
        record("run.foot_contact", "fail", "Run action missing")
        return

    armature = rig.data
    stance_ratio = float(armature.get("run_stance_ratio", 0.40))
    foot_travel = float(armature.get("run_foot_travel", 0.60))
    reference_speed = float(armature.get("run_reference_speed", 2.8125))
    frames = CLIP_SPECS["Run"][0]
    intervals = frames - 1
    per_frame_expected = -foot_travel / (stance_ratio * intervals)
    expected_speed = -reference_speed

    samples = {}
    for frame in range(1, frames + 1):
        evaluate_action(rig, action, frame)
        samples[frame] = {
            "phase": (frame - 1) / intervals,
            "foot": {
                side: {
                    "head": Vector(rig.pose.bones[f"foot.{side}"].head),
                    "tail": Vector(rig.pose.bones[f"toe.{side}"].tail),
                }
                for side in ("L", "R")
            },
            "hips_z": float(rig.pose.bones["hips"].head.z),
        }

    report = {}
    for side, offset in (("L", 0.0), ("R", 0.5)):
        stance = [
            frame
            for frame in range(1, frames)  # exclude duplicate loop frame
            if (samples[frame]["phase"] + offset) % 1.0 < stance_ratio
        ]
        # Split into contiguous groups.
        groups = []
        for frame in stance:
            if groups and frame == groups[-1][-1] + 1:
                groups[-1].append(frame)
            else:
                groups.append([frame])

        if not groups:
            record(f"run.{side}.stance_detected", "fail", "no stance frames found")
            continue

        for group_index, group in enumerate(groups):
            ys = [samples[frame]["foot"][side]["head"].y for frame in group]
            zs = [samples[frame]["foot"][side]["head"].z for frame in group]
            velocities = [
                (ys[index + 1] - ys[index]) for index in range(len(ys) - 1)
            ]
            actual_speed = (
                (ys[-1] - ys[0]) / ((len(group) - 1) / FPS) if len(group) > 1 else 0.0
            )
            speed_error = abs(actual_speed - expected_speed) / abs(expected_speed)
            speed_spread = max(abs(v - per_frame_expected) for v in velocities) if velocities else 0.0

            # The authored stance is flat through mid-stance and lifts the heel
            # into toe-off, so measure both phases separately.
            flat_zs = []
            late_zs = []
            for frame in group:
                phase = (samples[frame]["phase"] + offset) % 1.0
                stance_progress = phase / stance_ratio
                target_z = samples[frame]["foot"][side]["head"].z
                if stance_progress < 0.62:
                    flat_zs.append(target_z)
                else:
                    late_zs.append(target_z)
            height_error = max(
                (abs(z - ANKLE_HEIGHT) for z in flat_zs), default=0.0
            )
            heel_lift = (max(late_zs) - ANKLE_HEIGHT) if late_zs else 0.0

            # Analytic target from the authored in-place stride.
            target_errors = []
            for frame in group:
                phase = (samples[frame]["phase"] + offset) % 1.0
                target_y = foot_travel * 0.5 - foot_travel * (phase / stance_ratio)
                target_errors.append(abs(samples[frame]["foot"][side]["head"].y - target_y))

            label = f"run.{side}.stance{group_index}"
            check(
                f"{label}.speed",
                speed_error < FOOT_SPEED_TOLERANCE,
                f"actual {actual_speed:.3f} m/s vs reference {expected_speed:.3f} m/s "
                f"({speed_error * 100:.1f} % error)",
            )
            check(
                f"{label}.constant_velocity",
                speed_spread < 0.004,
                f"max per-frame deviation {speed_spread * 1000:.2f} mm",
            )
            check(
                f"{label}.height",
                height_error < STANCE_Z_TOLERANCE,
                f"max flat-foot ankle height error {height_error * 1000:.1f} mm",
            )
            if late_zs:
                check(
                    f"{label}.heel_lift",
                    0.015 < heel_lift < 0.07,
                    f"toe-off heel lift {heel_lift * 1000:.0f} mm",
                )
            check(
                f"{label}.ik_accuracy",
                max(target_errors) < IK_POSITION_TOLERANCE,
                f"max target error {max(target_errors) * 1000:.1f} mm",
            )
            report[f"{side}{group_index}"] = {
                "frames": group,
                "speed_mps": round(actual_speed, 4),
                "reference_speed_mps": round(expected_speed, 4),
                "speed_error_percent": round(speed_error * 100, 2),
                "max_frame_deviation_mm": round(speed_spread * 1000, 3),
                "max_flat_foot_height_error_mm": round(height_error * 1000, 2),
                "toe_off_heel_lift_mm": round(heel_lift * 1000, 2),
                "max_target_error_mm": round(max(target_errors) * 1000, 2),
            }

    # Ground penetration across the whole cycle.
    min_toe = min(
        pose["foot"][side]["tail"].z
        for pose in samples.values()
        for side in ("L", "R")
    )
    check(
        "run.ground_penetration",
        min_toe > -0.015,
        f"lowest toe position z={min_toe * 1000:.1f} mm",
        warning=True,
    )

    # Swing foot must clear the ground convincingly.
    swing_lift = max(
        samples[frame]["foot"][side]["head"].z
        for frame in range(1, frames)
        for side in ("L", "R")
    )
    check(
        "run.swing_clearance",
        swing_lift > ANKLE_HEIGHT + 0.20,
        f"maximum ankle lift {swing_lift:.3f} m",
    )

    hips_zs = [pose["hips_z"] for pose in samples.values()]
    bob = max(hips_zs) - min(hips_zs)
    check(
        "run.hip_bob",
        0.02 < bob < 0.12,
        f"hip bob range {bob * 1000:.0f} mm",
        warning=True,
    )

    metrics["run"] = {
        "stance_ratio": stance_ratio,
        "foot_travel_meters": foot_travel,
        "reference_speed_mps": round(reference_speed, 4),
        "feet": report,
        "min_toe_z_meters": round(min_toe, 4),
        "max_ankle_lift_meters": round(swing_lift, 4),
        "hip_bob_meters": round(bob, 4),
    }


def validate_export_artifacts(actions) -> None:
    glb = SCRIPT_DIR / "turkuaz_runner.glb"
    check("export.glb_exists", glb.exists(), str(glb))
    if glb.exists():
        size = glb.stat().st_size
        check("export.glb_size", size > 100_000, f"{size / 1024:.0f} KiB")

    check(
        "export.clip_count",
        len(actions) == 11,
        f"{len(actions)} actions ready for export",
    )
    check(
        "export.game_copies",
        all(path.exists() for path in (
            SCRIPT_DIR.parent / "turkuaz-adalar" / "src" / "assets" / "models" / "turkuaz_runner.glb",
            SCRIPT_DIR.parent / "turkuaz-adalar" / "public" / "models" / "turkuaz_runner.glb",
        )),
        "both game copies present",
    )


def main() -> None:
    if not bpy.data.filepath:
        print("validate_rig.py must run against a saved .blend", file=sys.stderr)
        raise SystemExit(2)

    scene = bpy.context.scene
    rig = bpy.data.objects.get(RIG_NAME)
    mesh_object = bpy.data.objects.get(MESH_NAME)
    if rig is None or mesh_object is None:
        print("Expected TK_Armature and TK_CharacterMesh in the .blend", file=sys.stderr)
        raise SystemExit(2)

    if rig.animation_data and rig.animation_data.action:
        rig.animation_data.action = None

    print("Turkuaz rig validation")
    print("-" * 60)

    validate_scene(scene)
    validate_mesh(mesh_object)
    validate_armature(rig)
    actions = validate_actions(rig)
    validate_run_feet(rig, actions)
    validate_export_artifacts(actions)

    # Restore the authored idle state.
    idle = actions.get("Idle")
    if idle is not None:
        evaluate_action(rig, idle, 1)

    failed = [item for item in checks if item["status"] == "fail"]
    warned = [item for item in checks if item["status"] == "warn"]
    summary = {
        "passed": len(checks) - len(failed) - len(warned),
        "warnings": len(warned),
        "failed": len(failed),
        "total": len(checks),
    }

    report = {
        "asset": "TurkuazRunner",
        "validated_file": bpy.data.filepath,
        "blender_version": bpy.app.version_string,
        "fps": FPS,
        "summary": summary,
        "checks": checks,
        "metrics": metrics,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n")

    print("-" * 60)
    print(
        f"{summary['passed']} passed, {summary['warnings']} warnings, "
        f"{summary['failed']} failed ({summary['total']} checks)"
    )
    print(f"Report: {REPORT_PATH}")

    if failed:
        print("\nFailed checks:")
        for item in failed:
            print(f"  - {item['name']}: {item['detail']}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
