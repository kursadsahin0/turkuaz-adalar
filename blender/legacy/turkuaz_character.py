"""
Turkuaz Adalar — procedural cartoon explorer mascot.

Run inside Blender (tested with Blender 5.2 LTS):
    blender --background --factory-startup --python blender/turkuaz_character.py --python-exit-code 1

The script builds an original, rig-ready stylised character from procedural
meshes, organises it into collections, creates a studio set, saves
`turkuaz_character.blend` and renders `character_preview.png` beside this file.

It is safe to run repeatedly: every generated datablock is tagged and removed
before rebuilding, while unrelated user objects are left untouched.
"""

from __future__ import annotations

import math
import sys
import traceback
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
BLEND_PATH = SCRIPT_DIR / "turkuaz_character.blend"
PREVIEW_PATH = SCRIPT_DIR / "character_preview.png"

GENERATED_TAG = "turkuaz_generated"
ROOT_NAME = "TK_Root"
SCENE_NAME = "Turkuaz Character Preview"

# Character faces -Y. Z is up. The feet sit exactly on Z = 0.
COLORS = {
    "skin": "#F2B98C",
    "skin_shade": "#D99A72",
    "skin_light": "#FFD1AA",
    "hair": "#5B3826",
    "hair_light": "#7C4E31",
    "hair_dark": "#3F2619",
    "jacket": "#18A8A1",
    "jacket_dark": "#0D7679",
    "jacket_light": "#57D4C9",
    "cream": "#F6E8CB",
    "cream_dark": "#D8C29A",
    "yellow": "#F3C247",
    "gold": "#D99A2B",
    "coral": "#F07C66",
    "shorts": "#D9C69B",
    "leather": "#7C4E35",
    "leather_dark": "#523222",
    "backpack": "#C9794B",
    "backpack_dark": "#9E5736",
    "eye_white": "#FFF8EA",
    "iris": "#0C8A8E",
    "iris_dark": "#075E63",
    "pupil": "#14262A",
    "brow": "#4A2D1F",
    "mouth": "#7A3A36",
    "sole": "#EFE0C4",
}


def srgb_channel_to_linear(value: float) -> float:
    """Convert one 0..1 sRGB channel to Blender's linear colour space."""
    if value <= 0.04045:
        return value / 12.92
    return ((value + 0.055) / 1.055) ** 2.4


def hex_to_linear(hex_value: str) -> tuple[float, float, float, float]:
    """Convert #RRGGBB to a linear RGBA tuple for Principled inputs."""
    raw = hex_value.lstrip("#")
    if len(raw) != 6:
        raise ValueError(f"Expected a six-digit hex colour, got {hex_value!r}")
    r, g, b = (int(raw[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (
        srgb_channel_to_linear(r),
        srgb_channel_to_linear(g),
        srgb_channel_to_linear(b),
        1.0,
    )


class BuildError(RuntimeError):
    """Raised when a generated part cannot be constructed."""


# ---------------------------------------------------------------------------
# Scene and collection helpers
# ---------------------------------------------------------------------------


def set_object_mode() -> None:
    """Exit edit modes and make sure operators have a clean object context."""
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def clear_generated_data() -> None:
    """Remove datablocks created by a previous run of this script."""
    set_object_mode()

    for obj in list(bpy.data.objects):
        if obj.get(GENERATED_TAG) or obj.name.startswith("TK_"):
            bpy.data.objects.remove(obj, do_unlink=True)

    for collection in list(bpy.data.collections):
        if collection.get(GENERATED_TAG) or collection.name.startswith("Turkuaz "):
            bpy.data.collections.remove(collection)

    # Materials, meshes, lights, cameras and worlds are tagged separately.
    for block_collection in (
        bpy.data.materials,
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.lights,
        bpy.data.cameras,
        bpy.data.worlds,
    ):
        for block in list(block_collection):
            if block.get(GENERATED_TAG) and block.users == 0:
                block_collection.remove(block)

    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)


def remove_default_startup_objects() -> None:
    """Remove the stock cube/camera/light when running from a fresh file.

    A saved user scene is never touched, so the script can also be used as an
    insert into an existing project.
    """
    if bpy.data.filepath:
        return
    default_names = {"Cube", "Camera", "Light"}
    for name in default_names:
        obj = bpy.data.objects.get(name)
        if obj is not None and not obj.get(GENERATED_TAG):
            bpy.data.objects.remove(obj, do_unlink=True)


def new_collection(name: str, parent: bpy.types.Collection) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    collection[GENERATED_TAG] = True
    parent.children.link(collection)
    return collection


def tag_object(obj: bpy.types.Object) -> bpy.types.Object:
    obj[GENERATED_TAG] = True
    return obj


def tag_datablock(block):
    block[GENERATED_TAG] = True
    return block


class BuildContext:
    """Holds collections, materials and the common character root."""

    def __init__(self, scene: bpy.types.Scene) -> None:
        self.scene = scene
        self.materials: dict[str, bpy.types.Material] = {}

        self.character_master = new_collection("Turkuaz Character", scene.collection)
        self.body_collection = new_collection("Character Body", self.character_master)
        self.face_collection = new_collection("Character Face", self.character_master)
        self.outfit_collection = new_collection("Character Outfit", self.character_master)
        self.accessory_collection = new_collection(
            "Character Accessories", self.character_master
        )

        self.studio_master = new_collection("Turkuaz Studio", scene.collection)
        self.studio_set_collection = new_collection("Studio Set", self.studio_master)
        self.studio_light_collection = new_collection("Studio Lights", self.studio_master)
        self.studio_camera_collection = new_collection("Studio Camera", self.studio_master)

        self.root = self._create_root()
        self.materials = create_materials()

    def _create_root(self) -> bpy.types.Object:
        root = bpy.data.objects.new(ROOT_NAME, None)
        root.empty_display_type = "PLAIN_AXES"
        root.empty_display_size = 0.14
        root.location = (0.0, 0.0, 0.0)
        tag_object(root)
        self.character_master.objects.link(root)
        return root

    def link_character(
        self,
        obj: bpy.types.Object,
        collection: bpy.types.Collection,
        parent: bpy.types.Object | None = None,
    ) -> bpy.types.Object:
        tag_object(obj)
        collection.objects.link(obj)
        obj.parent = parent if parent is not None else self.root
        return obj

    def link_studio(
        self, obj: bpy.types.Object, collection: bpy.types.Collection
    ) -> bpy.types.Object:
        tag_object(obj)
        collection.objects.link(obj)
        return obj

    def material(self, name: str) -> bpy.types.Material:
        material = self.materials.get(name)
        if material is None:
            raise BuildError(f"Material {name!r} was not created.")
        return material


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------


def set_principled_input(
    bsdf: bpy.types.ShaderNodeBsdfPrincipled, name: str, value
) -> None:
    """Set a Principled input when the current Blender version provides it."""
    socket = bsdf.inputs.get(name)
    if socket is not None:
        socket.default_value = value


def make_material(
    name: str,
    base_hex: str,
    roughness: float,
    *,
    metallic: float = 0.0,
    coat: float = 0.0,
    coat_roughness: float = 0.1,
    sheen: float = 0.0,
    subsurface: float = 0.0,
    noise_scale: float = 0.0,
    noise_bump: float = 0.0,
    roughness_variation: float = 0.0,
    emission_hex: str | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(f"TK_Mat_{name}")
    tag_datablock(material)
    material.use_nodes = True
    material.diffuse_color = hex_to_linear(base_hex)

    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        raise BuildError(f"Principled BSDF missing while creating {name!r}.")

    base_colour = hex_to_linear(base_hex)
    set_principled_input(bsdf, "Base Color", base_colour)
    set_principled_input(bsdf, "Roughness", roughness)
    set_principled_input(bsdf, "Metallic", metallic)
    set_principled_input(bsdf, "Coat Weight", coat)
    set_principled_input(bsdf, "Coat Roughness", coat_roughness)
    set_principled_input(bsdf, "Sheen Weight", sheen)
    set_principled_input(bsdf, "Sheen Roughness", 0.5)
    set_principled_input(bsdf, "Subsurface Weight", subsurface)
    if subsurface:
        set_principled_input(bsdf, "Subsurface Radius", (0.22, 0.11, 0.06))
        set_principled_input(bsdf, "Subsurface Scale", 0.035)
    if emission_hex is not None:
        set_principled_input(bsdf, "Emission Color", hex_to_linear(emission_hex))
        set_principled_input(bsdf, "Emission Strength", emission_strength)

    if noise_scale > 0.0:
        texcoord = nodes.new("ShaderNodeTexCoord")
        texcoord.location = (-760, 20)
        noise = nodes.new("ShaderNodeTexNoise")
        noise.location = (-560, 20)
        noise.noise_dimensions = "3D"
        noise.inputs["Scale"].default_value = noise_scale
        noise.inputs["Detail"].default_value = 2.6
        noise.inputs["Roughness"].default_value = 0.55
        links.new(texcoord.outputs["Object"], noise.inputs["Vector"])

        bump = nodes.new("ShaderNodeBump")
        bump.location = (-300, -120)
        bump.inputs["Strength"].default_value = noise_bump
        bump.inputs["Distance"].default_value = 0.006
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

        if roughness_variation > 0.0:
            mapping = nodes.new("ShaderNodeMapRange")
            mapping.location = (-300, 110)
            mapping.inputs["From Min"].default_value = 0.0
            mapping.inputs["From Max"].default_value = 1.0
            mapping.inputs["To Min"].default_value = max(
                0.05, roughness - roughness_variation
            )
            mapping.inputs["To Max"].default_value = min(
                1.0, roughness + roughness_variation
            )
            links.new(noise.outputs["Fac"], mapping.inputs["Value"])
            links.new(mapping.outputs["Result"], bsdf.inputs["Roughness"])

    return material


def create_materials() -> dict[str, bpy.types.Material]:
    """Create the complete, consistent character palette once."""
    materials = {
        "skin": make_material(
            "Skin",
            COLORS["skin"],
            0.56,
            subsurface=0.055,
            sheen=0.08,
        ),
        "skin_shade": make_material("SkinShade", COLORS["skin_shade"], 0.6),
        "skin_light": make_material("SkinLight", COLORS["skin_light"], 0.5),
        "hair": make_material(
            "Hair",
            COLORS["hair"],
            0.38,
            sheen=0.35,
            coat=0.12,
            noise_scale=18.0,
            noise_bump=0.12,
            roughness_variation=0.035,
        ),
        "hair_light": make_material(
            "HairLight",
            COLORS["hair_light"],
            0.42,
            sheen=0.3,
            noise_scale=20.0,
            noise_bump=0.1,
        ),
        "hair_dark": make_material("HairDark", COLORS["hair_dark"], 0.46),
        "jacket": make_material(
            "Jacket",
            COLORS["jacket"],
            0.52,
            sheen=0.28,
            noise_scale=34.0,
            noise_bump=0.14,
            roughness_variation=0.035,
        ),
        "jacket_dark": make_material(
            "JacketDark",
            COLORS["jacket_dark"],
            0.55,
            sheen=0.22,
            noise_scale=30.0,
            noise_bump=0.1,
        ),
        "jacket_light": make_material("JacketLight", COLORS["jacket_light"], 0.46),
        "cream": make_material(
            "Cream",
            COLORS["cream"],
            0.58,
            sheen=0.16,
            noise_scale=38.0,
            noise_bump=0.09,
        ),
        "cream_dark": make_material("CreamDark", COLORS["cream_dark"], 0.6),
        "yellow": make_material(
            "Yellow",
            COLORS["yellow"],
            0.46,
            sheen=0.22,
            noise_scale=36.0,
            noise_bump=0.08,
        ),
        "gold": make_material(
            "Gold",
            COLORS["gold"],
            0.32,
            metallic=0.55,
            noise_scale=24.0,
            noise_bump=0.04,
        ),
        "coral": make_material("Coral", COLORS["coral"], 0.52),
        "shorts": make_material(
            "Shorts",
            COLORS["shorts"],
            0.6,
            sheen=0.14,
            noise_scale=30.0,
            noise_bump=0.1,
        ),
        "leather": make_material(
            "Leather",
            COLORS["leather"],
            0.46,
            coat=0.12,
            coat_roughness=0.35,
            noise_scale=17.0,
            noise_bump=0.16,
            roughness_variation=0.045,
        ),
        "leather_dark": make_material(
            "LeatherDark",
            COLORS["leather_dark"],
            0.5,
            noise_scale=16.0,
            noise_bump=0.12,
        ),
        "backpack": make_material(
            "Backpack",
            COLORS["backpack"],
            0.55,
            sheen=0.18,
            noise_scale=24.0,
            noise_bump=0.12,
            roughness_variation=0.04,
        ),
        "backpack_dark": make_material(
            "BackpackDark", COLORS["backpack_dark"], 0.58, noise_scale=22.0, noise_bump=0.1
        ),
        "eye_white": make_material(
            "EyeWhite",
            COLORS["eye_white"],
            0.22,
            coat=0.45,
            coat_roughness=0.04,
        ),
        "iris": make_material(
            "Iris",
            COLORS["iris"],
            0.2,
            coat=0.5,
            coat_roughness=0.03,
            noise_scale=60.0,
            noise_bump=0.02,
        ),
        "iris_dark": make_material("IrisDark", COLORS["iris_dark"], 0.28),
        "pupil": make_material(
            "Pupil", COLORS["pupil"], 0.16, coat=0.55, coat_roughness=0.02
        ),
        "brow": make_material("Brow", COLORS["brow"], 0.44),
        "mouth": make_material("Mouth", COLORS["mouth"], 0.5),
        "sole": make_material(
            "Sole",
            COLORS["sole"],
            0.62,
            noise_scale=26.0,
            noise_bump=0.07,
        ),
        "highlight": make_material(
            "EyeHighlight",
            "#FFFFFF",
            0.08,
            emission_hex="#FFFFFF",
            emission_strength=2.4,
        ),
        "lens": make_material(
            "CompassGlass",
            "#9BE8E0",
            0.12,
            coat=0.7,
            coat_roughness=0.02,
        ),
    }
    return materials


# ---------------------------------------------------------------------------
# Low-level mesh construction
# ---------------------------------------------------------------------------


def select_only(objects) -> None:
    """Make one or more objects the active selection."""
    if isinstance(objects, bpy.types.Object):
        objects = [objects]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def apply_modifier(obj: bpy.types.Object, modifier: bpy.types.Modifier) -> None:
    select_only(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def add_subsurf(
    obj: bpy.types.Object, levels: int = 1, *, render_levels: int | None = None
) -> None:
    modifier = obj.modifiers.new("SmoothSubdivision", "SUBSURF")
    modifier.subdivision_type = "CATMULL_CLARK"
    modifier.levels = levels
    modifier.render_levels = levels if render_levels is None else render_levels
    apply_modifier(obj, modifier)


def add_solidify(obj: bpy.types.Object, thickness: float, offset: float = -1.0) -> None:
    modifier = obj.modifiers.new("ClothThickness", "SOLIDIFY")
    modifier.thickness = thickness
    modifier.offset = offset
    modifier.use_even_offset = True
    apply_modifier(obj, modifier)


def add_small_bevel(obj: bpy.types.Object, width: float, segments: int = 2) -> None:
    modifier = obj.modifiers.new("SoftEdge", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    modifier.angle_limit = math.radians(45.0)
    apply_modifier(obj, modifier)


def make_mesh_object(
    name: str,
    vertices,
    faces,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    smooth: bool = True,
    parent: bpy.types.Object | None = None,
    ctx: BuildContext | None = None,
) -> bpy.types.Object:
    """Create a mesh object from explicit vertices and faces."""
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    tag_datablock(mesh)
    mesh.from_pydata([tuple(v) for v in vertices], [], [tuple(f) for f in faces])
    mesh.validate(verbose=False)
    mesh.update(calc_edges=True)

    if smooth:
        for polygon in mesh.polygons:
            polygon.use_smooth = True

    obj = bpy.data.objects.new(name, mesh)
    tag_object(obj)
    collection.objects.link(obj)
    obj.parent = parent

    mesh.materials.clear()
    mesh.materials.append(material)
    if ctx is not None:
        tag_object(obj)
    return obj


def make_ellipsoid(
    name: str,
    center,
    radii,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    segments: int = 48,
    rings: int = 28,
    rotation: Matrix | None = None,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    """A smooth UV-sphere-derived ellipsoid, optionally rotated about its centre."""
    cx, cy, cz = center
    rx, ry, rz = radii
    vertices: list[Vector] = []
    faces: list[tuple[int, ...]] = []

    rot = rotation if rotation is not None else Matrix.Identity(3)
    local_center = Vector((cx, cy, cz))

    vertices.append(local_center + rot @ Vector((0.0, 0.0, rz)))
    for ring in range(1, rings):
        phi = math.pi * ring / rings
        sin_phi = math.sin(phi)
        cos_phi = math.cos(phi)
        for segment in range(segments):
            theta = 2.0 * math.pi * segment / segments
            point = Vector(
                (
                    rx * sin_phi * math.cos(theta),
                    ry * sin_phi * math.sin(theta),
                    rz * cos_phi,
                )
            )
            vertices.append(local_center + rot @ point)
    vertices.append(local_center + rot @ Vector((0.0, 0.0, -rz)))

    first_ring = 1
    for segment in range(segments):
        nxt = (segment + 1) % segments
        faces.append((0, first_ring + segment, first_ring + nxt))

    for ring in range(rings - 2):
        start_a = 1 + ring * segments
        start_b = start_a + segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append(
                (
                    start_a + segment,
                    start_b + segment,
                    start_b + nxt,
                    start_a + nxt,
                )
            )

    last_ring_start = 1 + (rings - 2) * segments
    bottom_index = len(vertices) - 1
    for segment in range(segments):
        nxt = (segment + 1) % segments
        faces.append((bottom_index, last_ring_start + nxt, last_ring_start + segment))

    return make_mesh_object(
        name, vertices, faces, material, collection, parent=parent
    )


def superellipse_component(value: float, exponent: float) -> float:
    """Signed power used by superellipse cross sections."""
    return math.copysign(abs(value) ** exponent, value)


def make_superellipsoid(
    name: str,
    center,
    radii,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    exponent_xy: float = 0.55,
    exponent_z: float = 0.55,
    segments: int = 40,
    rings: int = 20,
    rotation: Matrix | None = None,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    """Smooth rounded-box form, ideal for packs, pockets, soles and buckles."""
    cx, cy, cz = center
    rx, ry, rz = radii
    rot = rotation if rotation is not None else Matrix.Identity(3)
    local_center = Vector((cx, cy, cz))
    vertices: list[Vector] = []
    faces: list[tuple[int, ...]] = []

    vertices.append(local_center + rot @ Vector((0.0, 0.0, rz)))
    for ring in range(1, rings):
        phi = -math.pi / 2.0 + math.pi * ring / rings
        cos_phi = superellipse_component(math.cos(phi), exponent_z)
        sin_phi = superellipse_component(math.sin(phi), exponent_z)
        for segment in range(segments):
            theta = 2.0 * math.pi * segment / segments
            point = Vector(
                (
                    rx * cos_phi * superellipse_component(math.cos(theta), exponent_xy),
                    ry * cos_phi * superellipse_component(math.sin(theta), exponent_xy),
                    rz * sin_phi,
                )
            )
            vertices.append(local_center + rot @ point)
    vertices.append(local_center + rot @ Vector((0.0, 0.0, -rz)))

    first_ring = 1
    for segment in range(segments):
        nxt = (segment + 1) % segments
        faces.append((0, first_ring + segment, first_ring + nxt))
    for ring in range(rings - 2):
        start_a = 1 + ring * segments
        start_b = start_a + segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append(
                (
                    start_a + segment,
                    start_b + segment,
                    start_b + nxt,
                    start_a + nxt,
                )
            )
    last_ring_start = 1 + (rings - 2) * segments
    bottom_index = len(vertices) - 1
    for segment in range(segments):
        nxt = (segment + 1) % segments
        faces.append((bottom_index, last_ring_start + nxt, last_ring_start + segment))

    return make_mesh_object(
        name, vertices, faces, material, collection, parent=parent
    )


def make_section_loft(
    name: str,
    sections,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    sides: int = 24,
    exponent: float = 2.0,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    """Loft horizontal elliptical/superelliptical rings along a centreline.

    Each section is (x, y, z, radius_x, radius_y). This is used for torsos,
    hair locks, scarf tails, straps and other mostly-vertical fabric forms.
    """
    if len(sections) < 2:
        raise BuildError("A loft needs at least two sections.")

    vertices: list[Vector] = []
    faces: list[tuple[int, ...]] = []
    component = 2.0 / exponent

    for x, y, z, rx, ry in sections:
        for side in range(sides):
            angle = 2.0 * math.pi * side / sides
            vertices.append(
                Vector(
                    (
                        x + rx * superellipse_component(math.cos(angle), component),
                        y + ry * superellipse_component(math.sin(angle), component),
                        z,
                    )
                )
            )

    for ring in range(len(sections) - 1):
        start_a = ring * sides
        start_b = start_a + sides
        for side in range(sides):
            nxt = (side + 1) % sides
            faces.append(
                (start_a + side, start_b + side, start_b + nxt, start_a + nxt)
            )

    # Fanned caps keep the ends closed without n-gons.
    top_center = len(vertices)
    first = sections[0]
    vertices.append(Vector((first[0], first[1], first[2])))
    bottom_center = len(vertices)
    last = sections[-1]
    vertices.append(Vector((last[0], last[1], last[2])))
    last_ring_start = (len(sections) - 1) * sides
    for side in range(sides):
        nxt = (side + 1) % sides
        faces.append((top_center, side, nxt))
        faces.append((bottom_center, last_ring_start + nxt, last_ring_start + side))

    obj = make_mesh_object(
        name, vertices, faces, material, collection, parent=parent
    )
    return obj


def perpendicular(vector: Vector) -> Vector:
    """Return an arbitrary unit vector perpendicular to `vector`."""
    reference = Vector((0.0, 0.0, 1.0))
    if abs(vector.normalized().dot(reference)) > 0.94:
        reference = Vector((1.0, 0.0, 0.0))
    result = vector.cross(reference)
    if result.length < 1e-6:
        result = vector.cross(Vector((0.0, 1.0, 0.0)))
    return result.normalized()


def make_tube_path(
    name: str,
    points,
    radii,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    sides: int = 16,
    aspect: tuple[float, float] = (1.0, 1.0),
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    """Sweep an elliptical cross-section along a 3D path."""
    if len(points) != len(radii) or len(points) < 2:
        raise BuildError("Tube path points and radii must match and have length >= 2.")

    path = [Vector(p) for p in points]
    tangents: list[Vector] = []
    for index in range(len(path)):
        if index == 0:
            tangent = path[1] - path[0]
        elif index == len(path) - 1:
            tangent = path[-1] - path[-2]
        else:
            tangent = path[index + 1] - path[index - 1]
        tangents.append(tangent.normalized())

    normal = perpendicular(tangents[0])
    frames: list[tuple[Vector, Vector]] = []
    for index, tangent in enumerate(tangents):
        if index > 0:
            rotation = tangents[index - 1].rotation_difference(tangent)
            normal = (rotation @ normal).normalized()
        normal = (normal - tangent * normal.dot(tangent)).normalized()
        binormal = tangent.cross(normal).normalized()
        frames.append((normal, binormal))

    vertices: list[Vector] = []
    for index, point in enumerate(path):
        normal, binormal = frames[index]
        radius = radii[index]
        for side in range(sides):
            angle = 2.0 * math.pi * side / sides
            offset = (
                normal * math.cos(angle) * radius * aspect[0]
                + binormal * math.sin(angle) * radius * aspect[1]
            )
            vertices.append(point + offset)

    faces: list[tuple[int, ...]] = []
    for ring in range(len(path) - 1):
        start_a = ring * sides
        start_b = start_a + sides
        for side in range(sides):
            nxt = (side + 1) % sides
            faces.append(
                (start_a + side, start_b + side, start_b + nxt, start_a + nxt)
            )

    start_center = len(vertices)
    vertices.append(path[0])
    end_center = len(vertices)
    vertices.append(path[-1])
    last_start = (len(path) - 1) * sides
    for side in range(sides):
        nxt = (side + 1) % sides
        faces.append((start_center, nxt, side))
        faces.append((end_center, last_start + side, last_start + nxt))

    return make_mesh_object(
        name, vertices, faces, material, collection, parent=parent
    )


def make_torus(
    name: str,
    center,
    major_radius: float,
    minor_radius: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    axis: str = "Z",
    major_segments: int = 40,
    minor_segments: int = 10,
    scale: tuple[float, float, float] = (1.0, 1.0, 1.0),
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    """Parametric torus with a configurable axis and non-uniform scale."""
    if axis == "Z":
        u = Vector((1.0, 0.0, 0.0))
        v = Vector((0.0, 1.0, 0.0))
        w = Vector((0.0, 0.0, 1.0))
    elif axis == "Y":
        u = Vector((1.0, 0.0, 0.0))
        v = Vector((0.0, 0.0, 1.0))
        w = Vector((0.0, 1.0, 0.0))
    elif axis == "X":
        u = Vector((0.0, 1.0, 0.0))
        v = Vector((0.0, 0.0, 1.0))
        w = Vector((1.0, 0.0, 0.0))
    else:
        raise BuildError(f"Unknown torus axis {axis!r}.")

    center_vector = Vector(center)
    scale_vector = Vector(scale)
    vertices: list[Vector] = []
    for major_index in range(major_segments):
        theta = 2.0 * math.pi * major_index / major_segments
        radial = u * math.cos(theta) + v * math.sin(theta)
        for minor_index in range(minor_segments):
            phi = 2.0 * math.pi * minor_index / minor_segments
            point = (
                center_vector
                + radial * (major_radius + minor_radius * math.cos(phi))
                + w * (minor_radius * math.sin(phi))
            )
            point = center_vector + Vector(
                (
                    (point.x - center_vector.x) * scale_vector.x,
                    (point.y - center_vector.y) * scale_vector.y,
                    (point.z - center_vector.z) * scale_vector.z,
                )
            )
            vertices.append(point)

    faces: list[tuple[int, ...]] = []
    for major_index in range(major_segments):
        next_major = (major_index + 1) % major_segments
        for minor_index in range(minor_segments):
            next_minor = (minor_index + 1) % minor_segments
            a = major_index * minor_segments + minor_index
            b = next_major * minor_segments + minor_index
            c = next_major * minor_segments + next_minor
            d = major_index * minor_segments + next_minor
            faces.append((a, b, c, d))

    return make_mesh_object(
        name, vertices, faces, material, collection, parent=parent
    )


def make_face_ring(
    name: str,
    center_x: float,
    center_z: float,
    y: float,
    radius_x: float,
    radius_z: float,
    tube_radius: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    segments: int = 48,
    tube_sides: int = 8,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    """A closed tube outlining an ellipse in the XZ plane (eye rims)."""
    vertices: list[Vector] = []
    for index in range(segments):
        theta = 2.0 * math.pi * index / segments
        point = Vector(
            (center_x + radius_x * math.cos(theta), y, center_z + radius_z * math.sin(theta))
        )
        radial = Vector((math.cos(theta), 0.0, math.sin(theta))).normalized()
        face_normal = Vector((0.0, -1.0, 0.0))
        for side in range(tube_sides):
            phi = 2.0 * math.pi * side / tube_sides
            offset = (
                face_normal * math.cos(phi) * tube_radius
                + radial * math.sin(phi) * tube_radius
            )
            vertices.append(point + offset)

    faces: list[tuple[int, ...]] = []
    for index in range(segments):
        next_index = (index + 1) % segments
        for side in range(tube_sides):
            next_side = (side + 1) % tube_sides
            a = index * tube_sides + side
            b = next_index * tube_sides + side
            c = next_index * tube_sides + next_side
            d = index * tube_sides + next_side
            faces.append((a, b, c, d))

    return make_mesh_object(
        name, vertices, faces, material, collection, parent=parent
    )


def make_arc_tube(
    name: str,
    points,
    radii,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    sides: int = 10,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    return make_tube_path(
        name, points, radii, material, collection, sides=sides, parent=parent
    )


def voxel_union(
    name: str,
    objects,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    voxel_size: float,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    """Join organic pieces and fuse them into one seamless surface."""
    if not objects:
        raise BuildError("voxel_union needs at least one object.")

    set_object_mode()
    select_only(objects)
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name

    remesh = obj.modifiers.new("SeamlessFuse", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = voxel_size
    remesh.use_smooth_shade = True
    apply_modifier(obj, remesh)

    smooth = obj.modifiers.new("OrganicPolish", "SMOOTH")
    smooth.factor = 0.18
    smooth.iterations = 2
    apply_modifier(obj, smooth)

    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True

    tag_object(obj)
    if obj.name not in collection.objects:
        # The joined active object lives in the collection of the first piece.
        for old_collection in list(obj.users_collection):
            old_collection.objects.unlink(obj)
        collection.objects.link(obj)
    obj.parent = parent
    return obj
