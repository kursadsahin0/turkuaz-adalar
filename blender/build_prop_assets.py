"""
Turkuaz Adalar — GLB prop exports used by the asset pipeline.

These are deliberately small, real GLB files so every registry category
(environment, obstacle, collectible) can be loaded, cached, cloned and tested.
The character itself is produced by `build_character_rig.py`.

Run from the repository root:
    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        --python blender/build_prop_assets.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
MODEL_ROOT = REPO_ROOT / "turkuaz-adalar" / "src" / "assets" / "models"

COLORS = {
    "crate": "#C96A4C",
    "crate_dark": "#8F3F2F",
    "crate_strap": "#F2C46D",
    "spire": "#1A7C8E",
    "spire_glow": "#48F0E2",
    "crystal": "#7BFFF3",
    "crystal_core": "#1FE2D2",
    "beacon": "#0F7F84",
    "beacon_light": "#FFF0B0",
    "gold": "#E8A72F",
    "sand": "#F1D29A",
    "cream": "#F6E8CB",
}


def srgb_channel_to_linear(value: float) -> float:
    if value <= 0.04045:
        return value / 12.92
    return ((value + 0.055) / 1.055) ** 2.4


def hex_to_linear(value: str) -> tuple[float, float, float, float]:
    raw = value.lstrip("#")
    r, g, b = (int(raw[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (
        srgb_channel_to_linear(r),
        srgb_channel_to_linear(g),
        srgb_channel_to_linear(b),
        1.0,
    )


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def make_material(
    name: str,
    color: str,
    *,
    roughness: float = 0.75,
    metallic: float = 0.0,
    emission: str | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is None:
        raise RuntimeError(f"Material {name} has no Principled BSDF")
    principled.inputs["Base Color"].default_value = hex_to_linear(color)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    if emission:
        principled.inputs["Emission Color"].default_value = hex_to_linear(emission)
        principled.inputs["Emission Strength"].default_value = emission_strength
    return material


def add_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    obj.data.materials.append(material)


def add_box(
    name: str,
    size: tuple[float, float, float],
    location: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    obj.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    add_material(obj, material)
    return obj


def add_cylinder(
    name: str,
    radius: float,
    depth: float,
    location: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    vertices: int = 12,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    add_material(obj, material)
    return obj


def add_cone(
    name: str,
    radius1: float,
    radius2: float,
    depth: float,
    location: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    vertices: int = 12,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    add_material(obj, material)
    return obj


def add_torus(
    name: str,
    major_radius: float,
    minor_radius: float,
    location: tuple[float, float, float],
    material: bpy.types.Material,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=24,
        minor_segments=6,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    add_material(obj, material)
    return obj


def shade_flat(obj: bpy.types.Object) -> None:
    for polygon in obj.data.polygons:
        polygon.use_smooth = False


def export(name: str, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_animations=False,
        export_materials="EXPORT",
        export_normals=True,
        export_tangents=False,
        export_texcoords=True,
        export_extras=True,
    )
    print(f"Exported {name}: {path}")


def build_crate() -> None:
    reset_scene()
    body = make_material("TK_Prop_Crate", COLORS["crate"], roughness=0.84)
    edge = make_material("TK_Prop_CrateDark", COLORS["crate_dark"], roughness=0.8)
    strap = make_material("TK_Prop_CrateStrap", COLORS["crate_strap"], roughness=0.6)

    add_box("CrateBody", (1.2, 1.2, 1.15), (0.0, 0.0, 0.575), body)
    for index, z in enumerate((0.34, 0.82)):
        add_box(f"CrateStrap{index}", (1.24, 1.24, 0.1), (0.0, 0.0, z), strap)
    add_box("CrateCap", (0.98, 0.98, 0.055), (0.0, 0.0, 1.12), edge)
    add_box("CrateFootL", (0.16, 1.24, 0.12), (-0.5, 0.0, 0.06), edge)
    add_box("CrateFootR", (0.16, 1.24, 0.12), (0.5, 0.0, 0.06), edge)
    for obj in bpy.context.scene.objects:
        shade_flat(obj)
    export("crate", MODEL_ROOT / "obstacles" / "crate.glb")


def build_spire() -> None:
    reset_scene()
    crystal = make_material(
        "TK_Prop_Spire",
        COLORS["spire"],
        roughness=0.34,
        metallic=0.18,
        emission=COLORS["spire_glow"],
        emission_strength=0.6,
    )
    glow = make_material(
        "TK_Prop_SpireGlow",
        COLORS["spire_glow"],
        roughness=0.2,
        emission=COLORS["spire_glow"],
        emission_strength=3.0,
    )

    add_cone("SpireCrystal", 0.66, 0.0, 2.5, (0.0, 0.0, 1.25), crystal, vertices=5)
    for side in (-1, 1):
        add_cone(
            f"SpireShard{side}",
            0.25,
            0.0,
            1.2,
            (side * 0.34, side * 0.08, 0.55),
            crystal,
            vertices=4,
        ).rotation_euler[1] = side * 0.4
    add_torus("SpireRing", 0.58, 0.035, (0.0, 0.0, 0.08), glow)
    for obj in bpy.context.scene.objects:
        shade_flat(obj)
    export("spire", MODEL_ROOT / "obstacles" / "spire.glb")


def build_crystal() -> None:
    reset_scene()
    shell = make_material(
        "TK_Prop_Crystal",
        COLORS["crystal"],
        roughness=0.18,
        metallic=0.24,
        emission=COLORS["crystal_core"],
        emission_strength=1.8,
    )
    core = make_material(
        "TK_Prop_CrystalCore",
        COLORS["crystal_core"],
        roughness=0.1,
        emission=COLORS["crystal_core"],
        emission_strength=3.2,
    )

    add_cone("CrystalUpper", 0.27, 0.0, 0.34, (0.0, 0.0, 0.17), shell, vertices=4)
    add_cone("CrystalLower", 0.0, 0.27, 0.2, (0.0, 0.0, -0.1), shell, vertices=4)
    add_cone("CrystalCore", 0.11, 0.0, 0.18, (0.0, 0.0, 0.15), core, vertices=4)
    for obj in bpy.context.scene.objects:
        shade_flat(obj)
    export("crystal", MODEL_ROOT / "collectibles" / "crystal.glb")


def build_beacon() -> None:
    reset_scene()
    base = make_material("TK_Prop_BeaconBase", COLORS["beacon"], roughness=0.55, metallic=0.2)
    gold = make_material("TK_Prop_BeaconGold", COLORS["gold"], roughness=0.35, metallic=0.5)
    light = make_material(
        "TK_Prop_BeaconLight",
        COLORS["beacon_light"],
        roughness=0.15,
        emission=COLORS["beacon_light"],
        emission_strength=2.6,
    )
    sand = make_material("TK_Prop_BeaconSand", COLORS["sand"], roughness=0.9)

    add_cylinder("BeaconBase", 0.32, 0.16, (0.0, 0.0, 0.08), sand, vertices=10)
    add_cylinder("BeaconPost", 0.075, 1.1, (0.0, 0.0, 0.71), gold, vertices=10)
    add_cylinder("BeaconCollar", 0.16, 0.07, (0.0, 0.0, 1.28), base, vertices=10)
    add_box("BeaconLantern", (0.3, 0.3, 0.32), (0.0, 0.0, 1.48), light)
    add_cone("BeaconRoof", 0.24, 0.0, 0.26, (0.0, 0.0, 1.77), base, vertices=8)
    add_cylinder("BeaconFinial", 0.035, 0.16, (0.0, 0.0, 1.96), gold, vertices=8)
    for obj in bpy.context.scene.objects:
        shade_flat(obj)
    export("tide_beacon", MODEL_ROOT / "environment" / "tide_beacon.glb")


def main() -> None:
    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    build_crate()
    build_spire()
    build_crystal()
    build_beacon()
    print("All prop assets exported.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # pragma: no cover - Blender CLI guard
        print(f"Prop export failed: {error}", file=sys.stderr)
        raise
