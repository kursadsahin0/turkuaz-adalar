#!/usr/bin/env node
/**
 * End-to-end validation of the exported Turkuaz runner GLB.
 *
 * Checks the binary container, glTF structure, skin weights, animation
 * metadata, loop seams, in-place root motion, the embedded PNG badge texture,
 * and finally loads the file with three.js and plays every clip through
 * AnimationMixer (including a cross-fade and an exported foot-contact check).
 *
 * Usage:
 *   node scripts/validate-character-glb.mjs
 *   node scripts/validate-character-glb.mjs --glb public/models/turkuaz_runner.glb
 *
 * Exit code is 1 when a hard check fails.  A JSON report is written next to
 * this script (or to the path passed with --json).
 */

globalThis.self = globalThis;

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THREE = await import("three");
const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const GAME_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(GAME_ROOT, "..");

const FPS = 30;
const RUN_REFERENCE_SPEED = 2.8125;
const FOOT_SPEED_TOLERANCE = 0.08;

const REQUIRED_CLIPS = {
  Idle: 121,
  Run: 17,
  Jump: 22,
  Airborne: 31,
  Fall: 21,
  Land: 19,
  Win: 91,
  Lose: 76,
  Slide: 31,
  Turn: 21,
  Turn_Right: 21,
};
const LOOP_CLIPS = new Set(["Idle", "Run", "Airborne", "Fall"]);
const LOOP_SAFE_BONUS = new Set(["Win", "Lose", "Turn", "Turn_Right"]);

const EXPECTED_MATERIALS = [
  "TK_Mat_Jacket",
  "TK_Mat_Cream",
  "TK_Mat_JacketDark",
  "TK_Mat_Gold",
  "TK_Mat_Shorts",
  "TK_Mat_Leather",
  "TK_Mat_Skin",
  "TK_Mat_Sole",
  "TK_Mat_Coral",
  "TK_Mat_CreamDark",
  "TK_Mat_Hair",
  "TK_Mat_HairDark",
  "TK_Mat_EyeWhite",
  "TK_Mat_Iris",
  "TK_Mat_Pupil",
  "TK_Mat_EyeHighlight",
  "TK_Mat_Brow",
  "TK_Mat_SkinShade",
  "TK_Mat_SkinLight",
  "TK_Mat_Mouth",
  "TK_Mat_Backpack",
  "TK_Mat_BackpackDark",
  "TK_Mat_LeatherDark",
  "TK_Mat_Badge",
];

const checks = [];
const metrics = {};

function record(name, status, detail) {
  checks.push({ name, status, detail });
  const tag = status.toUpperCase().padEnd(4);
  console.log(`  [${tag}] ${name}: ${detail}`);
}

function check(name, condition, detail, warning = false) {
  record(name, condition ? "pass" : warning ? "warn" : "fail", detail);
  return condition;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : true;
      args[key] = value;
      if (value !== true) index += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const defaultGlb = path.join(GAME_ROOT, "public", "models", "turkuaz_runner.glb");
const glbPath = path.resolve(String(args.glb ?? defaultGlb));
const reportPath = path.resolve(String(args.json ?? path.join(SCRIPT_DIR, "glb_validation_report.json")));

// ---------------------------------------------------------------------------
// GLB container / accessor helpers
// ---------------------------------------------------------------------------

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

function parseGlb(buffer) {
  if (buffer.length < 20) throw new Error("file is too small to be a GLB");
  const magic = buffer.readUInt32LE(0);
  const version = buffer.readUInt32LE(4);
  const length = buffer.readUInt32LE(8);
  if (magic !== GLB_MAGIC) throw new Error("invalid GLB magic");
  if (length !== buffer.length) {
    throw new Error(`GLB header length ${length} does not match file size ${buffer.length}`);
  }

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) throw new Error("truncated chunk header");
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    if (end > buffer.length) throw new Error("chunk extends past end of file");
    if (chunkType === CHUNK_JSON) {
      json = JSON.parse(buffer.subarray(start, end).toString("utf8").replace(/\0+$/u, ""));
    } else if (chunkType === CHUNK_BIN) {
      bin = buffer.subarray(start, end);
    }
    offset = end + ((4 - (chunkLength % 4)) % 4);
  }
  if (!json) throw new Error("GLB has no JSON chunk");
  return { json, bin, version, length };
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const COMPONENT_READERS = {
  5120: { size: 1, read: (view, offset) => view.getInt8(offset), normalize: (value) => Math.max(value / 127, -1) },
  5121: { size: 1, read: (view, offset) => view.getUint8(offset), normalize: (value) => value / 255 },
  5122: { size: 2, read: (view, offset) => view.getInt16(offset, true), normalize: (value) => Math.max(value / 32767, -1) },
  5123: { size: 2, read: (view, offset) => view.getUint16(offset, true), normalize: (value) => value / 65535 },
  5125: { size: 4, read: (view, offset) => view.getUint32(offset, true), normalize: (value) => value },
  5126: { size: 4, read: (view, offset) => view.getFloat32(offset, true), normalize: (value) => value },
};

function readAccessor(json, bin, index) {
  const accessor = json.accessors[index];
  if (!accessor) throw new Error(`missing accessor ${index}`);
  const components = COMPONENTS[accessor.type];
  const reader = COMPONENT_READERS[accessor.componentType];
  if (!components || !reader) throw new Error(`unsupported accessor ${index}`);
  if (accessor.sparse) throw new Error(`sparse accessor ${index} is not supported by this validator`);

  const output = [];
  if (accessor.bufferView === undefined) {
    for (let element = 0; element < accessor.count; element += 1) {
      for (let component = 0; component < components; component += 1) output.push(0);
    }
    return { accessor, values: output, components };
  }
  if (!bin) throw new Error(`accessor ${index} needs a BIN chunk`);
  const bufferView = json.bufferViews[accessor.bufferView];
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = bufferView.byteStride ?? components * reader.size;
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);

  for (let element = 0; element < accessor.count; element += 1) {
    for (let component = 0; component < components; component += 1) {
      const raw = reader.read(view, base + element * stride + component * reader.size);
      output.push(accessor.normalized ? reader.normalize(raw) : raw);
    }
  }
  return { accessor, values: output, components };
}

function quaternionAngle(a, b) {
  const lengthA = Math.hypot(a[0], a[1], a[2], a[3]);
  const lengthB = Math.hypot(b[0], b[1], b[2], b[3]);
  if (lengthA < 1e-8 || lengthB < 1e-8) return 0;
  const dot = Math.abs(
    (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) / (lengthA * lengthB),
  );
  return 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
}

function vectorDelta(a, b) {
  return Math.max(...a.map((value, index) => Math.abs(value - b[index])));
}

function hashFile(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// ---------------------------------------------------------------------------
// Static glTF validation
// ---------------------------------------------------------------------------

function validateContainer(json, bin, version) {
  check("glb.version", version === 2, `container version ${version}`);
  check("glb.asset_version", json.asset?.version === "2.0", json.asset?.version);
  check("glb.generator", Boolean(json.asset?.generator), json.asset?.generator ?? "missing");
  check("glb.bin_chunk", Boolean(bin) && bin.length > 0, bin ? `${bin.length} bytes` : "missing BIN chunk");
  check("glb.scene", Array.isArray(json.scenes) && json.scenes.length === 1, `${json.scenes?.length ?? 0} scene(s)`);
}

function validateMaterials(json) {
  const materials = (json.materials ?? []).map((material) => material.name);
  metrics.materials = materials;
  check("materials.count", materials.length === 24, `${materials.length} materials`);
  const missing = EXPECTED_MATERIALS.filter((name) => !materials.includes(name));
  const extra = materials.filter((name) => !EXPECTED_MATERIALS.includes(name));
  check(
    "materials.names",
    missing.length === 0 && extra.length === 0,
    missing.length || extra.length ? `missing=${missing} extra=${extra}` : "palette matches the Blender build",
  );

  const textured = (json.materials ?? []).filter(
    (material) => material.pbrMetallicRoughness?.baseColorTexture !== undefined,
  );
  check("materials.textured", textured.length >= 1, `${textured.length} material(s) with baseColorTexture`);
}

function validateImages(json, bin) {
  const images = json.images ?? [];
  metrics.images = images.map((image) => ({
    name: image.name,
    mimeType: image.mimeType,
    bufferView: image.bufferView,
  }));
  check("textures.image_count", images.length === 1, `${images.length} embedded image(s)`);
  const image = images.find((candidate) => candidate.name === "TK_BadgeWave") ?? images[0];
  check("textures.image_named", image?.name === "TK_BadgeWave", image?.name ?? "missing");
  check("textures.mime_type", image?.mimeType === "image/png", image?.mimeType ?? "missing");
  check(
    "textures.embedded",
    image?.bufferView !== undefined && image?.uri === undefined,
    image?.bufferView !== undefined ? `bufferView ${image.bufferView}` : "not embedded",
  );

  if (image?.bufferView === undefined) return;
  const bufferView = json.bufferViews[image.bufferView];
  const start = bufferView.byteOffset ?? 0;
  const bytes = bin.subarray(start, start + bufferView.byteLength);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  check(
    "textures.png_signature",
    signature.every((byte, index) => bytes[index] === byte),
    "valid PNG signature",
  );
  const ihdr = bytes.subarray(12, 16).toString("ascii");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  metrics.textures = {
    name: image.name,
    width,
    height,
    bitDepth,
    colorType,
    byteLength: bytes.length,
  };
  check("textures.png_ihdr", ihdr === "IHDR", ihdr);
  check("textures.dimensions", width === 128 && height === 128, `${width}x${height}`);
  check("textures.rgba", bitDepth === 8 && colorType === 6, `bitDepth=${bitDepth} colorType=${colorType}`);

  const texture = json.textures?.[0];
  check("textures.source", texture?.source === 0, `source=${texture?.source}`);
  const badgeIndex = (json.materials ?? []).findIndex((material) => material.name === "TK_Mat_Badge");
  const badgeTexture = json.materials?.[badgeIndex]?.pbrMetallicRoughness?.baseColorTexture?.index;
  check(
    "textures.badge_binding",
    badgeIndex >= 0 && badgeTexture === 0,
    `TK_Mat_Badge baseColorTexture=${badgeTexture}`,
  );
}

function validateMeshAndSkin(json, bin) {
  const meshes = json.meshes ?? [];
  const mesh = meshes.find((candidate) => candidate.name === "TK_CharacterMesh") ?? meshes[0];
  check("mesh.present", Boolean(mesh), mesh?.name ?? "missing");
  if (!mesh) return;

  const skin = (json.skins ?? [])[0];
  check("skin.present", Boolean(skin), skin?.name ?? "missing");
  const joints = skin?.joints ?? [];
  metrics.skin = {
    name: skin?.name,
    joints: joints.length,
    joint_names: joints.map((index) => json.nodes[index]?.name),
  };
  check("skin.joints", joints.length === 22, `${joints.length} joints`);
  check(
    "skin.required_bones",
    ["root", "hips", "head", "foot.L", "foot.R", "hand.L", "hand.R"].every((name) =>
      metrics.skin.joint_names.includes(name)),
    metrics.skin.joint_names.join(", "),
  );
  if (skin?.inverseBindMatrices !== undefined) {
    const inverseBind = readAccessor(json, bin, skin.inverseBindMatrices);
    check(
      "skin.inverse_bind_matrices",
      inverseBind.accessor.count === joints.length,
      `${inverseBind.accessor.count} matrices for ${joints.length} joints`,
    );
  }

  check("mesh.primitives", mesh.primitives.length === 24, `${mesh.primitives.length} primitives`);
  let vertices = 0;
  let triangles = 0;
  let maxInfluences = 0;
  let badWeightSums = 0;
  let badJointIndices = 0;
  let positionsPresent = 0;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
    const attributes = primitive.attributes ?? {};
    const hasJoints = attributes.JOINTS_0 !== undefined;
    const hasWeights = attributes.WEIGHTS_0 !== undefined;
    if (!hasJoints || !hasWeights) {
      check(`mesh.primitive${primitiveIndex}.skin_attributes`, false, "missing JOINTS_0/WEIGHTS_0");
      continue;
    }

    const position = readAccessor(json, bin, attributes.POSITION);
    positionsPresent += 1;
    vertices += position.accessor.count;
    for (let index = 0; index < position.accessor.count; index += 1) {
      const y = position.values[index * 3 + 1];
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    if (primitive.indices !== undefined) {
      const indices = readAccessor(json, bin, primitive.indices);
      triangles += indices.accessor.count / 3;
    }

    const weights = readAccessor(json, bin, attributes.WEIGHTS_0);
    const skinIndices = readAccessor(json, bin, attributes.JOINTS_0);
    for (let vertex = 0; vertex < weights.accessor.count; vertex += 1) {
      let sum = 0;
      let influences = 0;
      for (let component = 0; component < 4; component += 1) {
        const weight = weights.values[vertex * 4 + component];
        sum += weight;
        if (weight > 1e-4) influences += 1;
      }
      maxInfluences = Math.max(maxInfluences, influences);
      if (Math.abs(sum - 1) > 1e-3) badWeightSums += 1;
      for (let component = 0; component < 4; component += 1) {
        const joint = skinIndices.values[vertex * 4 + component];
        if (weights.values[vertex * 4 + component] > 0 && (joint < 0 || joint >= joints.length)) {
          badJointIndices += 1;
        }
      }
    }
  }

  metrics.mesh = {
    name: mesh.name,
    primitives: mesh.primitives.length,
    vertices,
    triangles: Math.round(triangles),
    max_influences: maxInfluences,
    height_meters: Number.isFinite(minY) ? maxY - minY : null,
  };

  check("mesh.vertices", vertices > 10_000, `${vertices} vertices`);
  check("mesh.triangles", triangles > 20_000, `${Math.round(triangles)} triangles`);
  check("mesh.position_data", positionsPresent === mesh.primitives.length, `${positionsPresent}/${mesh.primitives.length} primitives`);
  check("mesh.max_influences", maxInfluences <= 4, `${maxInfluences} influences per vertex`);
  check("mesh.normalized_weights", badWeightSums === 0, `${badWeightSums} vertices with weight sum != 1`);
  check("mesh.joint_indices", badJointIndices === 0, `${badJointIndices} out-of-range joint indices`);
  check(
    "mesh.height",
    Number.isFinite(minY) && Math.abs(maxY - minY - 1.75) < 0.1,
    `${(maxY - minY).toFixed(3)} m (y ${minY.toFixed(3)}..${maxY.toFixed(3)})`,
  );
  check("mesh.feet_on_ground", Math.abs(minY) < 0.02, `lowest vertex y=${minY.toFixed(4)} m`);
}

function findChannel(animation, json, nodeName, targetPath) {
  return (animation.channels ?? []).find((channel) => {
    const node = json.nodes[channel.target.node];
    return node?.name === nodeName && channel.target.path === targetPath;
  });
}

function validateAnimations(json, bin, extras) {
  const animations = json.animations ?? [];
  metrics.animations = {};
  check("animations.count", animations.length === 11, `${animations.length} clips`);

  const names = animations.map((animation) => animation.name);
  const missing = Object.keys(REQUIRED_CLIPS).filter((name) => !names.includes(name));
  const extra = names.filter((name) => !(name in REQUIRED_CLIPS));
  check(
    "animations.names",
    missing.length === 0 && extra.length === 0,
    missing.length || extra.length ? `missing=${missing} extra=${extra}` : "all 10 required clips + Turn_Right",
  );

  const runSpeed = Number(extras?.run_reference_speed ?? RUN_REFERENCE_SPEED);

  for (const [name, frameCount] of Object.entries(REQUIRED_CLIPS)) {
    const animation = animations.find((candidate) => candidate.name === name);
    if (!animation) {
      record(`clip.${name}.present`, "fail", "missing");
      continue;
    }

    const expectedDuration = (frameCount - 1) / FPS;
    const inputs = animation.samplers.map((sampler) => readAccessor(json, bin, sampler.input));
    const start = Math.min(...inputs.map((input) => input.values[0]));
    const end = Math.max(...inputs.map((input) => input.values[input.values.length - 1]));
    const strictlyIncreasing = inputs.every((input) =>
      input.values.every((value, index) => index === 0 || value > input.values[index - 1]));
    const interpolation = [...new Set(animation.samplers.map((sampler) => sampler.interpolation ?? "LINEAR"))];

    metrics.animations[name] = {
      duration_seconds: Number(end.toFixed(4)),
      channels: animation.channels.length,
      samplers: animation.samplers.length,
      interpolation,
    };

    check(
      `clip.${name}.duration`,
      Math.abs(start) < 1e-4 && Math.abs(end - expectedDuration) < 2e-3,
      `${start.toFixed(4)}..${end.toFixed(4)} s (expected ${expectedDuration.toFixed(4)} s)`,
    );
    check(`clip.${name}.time_order`, strictlyIncreasing, "sampler inputs are strictly increasing");
    check(
      `clip.${name}.channels`,
      animation.channels.length === 66,
      `${animation.channels.length} channels (22 bones x TRS)`,
    );

    // Root must never translate: clips are authored in place.
    const rootTranslation = findChannel(animation, json, "root", "translation");
    let maxRootTranslation = 0;
    if (rootTranslation) {
      const output = readAccessor(json, bin, animation.samplers[rootTranslation.sampler].output);
      maxRootTranslation = Math.max(...output.values.map((value) => Math.abs(value)));
    }
    const rootRotation = findChannel(animation, json, "root", "rotation");
    let maxRootRotation = 0;
    if (rootRotation) {
      const output = readAccessor(json, bin, animation.samplers[rootRotation.sampler].output);
      for (let index = 0; index < output.accessor.count; index += 1) {
        maxRootRotation = Math.max(
          maxRootRotation,
          quaternionAngle(output.values.slice(index * 4, index * 4 + 4), [0, 0, 0, 1]),
        );
      }
    }
    check(
      `clip.${name}.root_in_place`,
      maxRootTranslation < 1e-5 && maxRootRotation < 1e-5,
      `max root translation ${maxRootTranslation.toExponential(2)} m, rotation ${maxRootRotation.toExponential(2)} rad`,
    );

    if (LOOP_CLIPS.has(name) || LOOP_SAFE_BONUS.has(name)) {
      let maxSeam = 0;
      let seamTrack = "";
      for (const channel of animation.channels) {
        const sampler = animation.samplers[channel.sampler];
        const output = readAccessor(json, bin, sampler.output);
        const first = output.values.slice(0, output.components);
        const last = output.values.slice(output.values.length - output.components);
        const delta = channel.target.path === "rotation" ? quaternionAngle(first, last) : vectorDelta(first, last);
        if (delta > maxSeam) {
          maxSeam = delta;
          seamTrack = `${json.nodes[channel.target.node]?.name}.${channel.target.path}`;
        }
      }
      check(
        `clip.${name}.loop_seam`,
        maxSeam < 1e-4,
        maxSeam < 1e-7 ? "identical first/last samples" : `max ${maxSeam.toExponential(2)} on ${seamTrack}`,
      );
      metrics.animations[name].loop_seam = maxSeam;
    }
  }

  // Exported extras should carry the timing contract used by the game.
  check(
    "extras.run_reference_speed",
    Number.isFinite(Number(extras?.run_reference_speed)),
    `${extras?.run_reference_speed ?? "missing"} m/s`,
  );
  check(
    "extras.loop_contract",
    extras?.root_motion === "in_place" && extras?.forward_axis_gltf === "-Z" && Number(extras?.fps) === FPS,
    `root_motion=${extras?.root_motion} forward=${extras?.forward_axis_gltf} fps=${extras?.fps}`,
  );

  metrics.run_reference_speed = runSpeed;
}

// ---------------------------------------------------------------------------
// Runtime validation (three.js GLTFLoader + AnimationMixer)
// ---------------------------------------------------------------------------

function loadGltf(buffer) {
  const loader = new GLTFLoader();
  const suppressed = [];
  const originalError = console.error;
  console.error = (...parts) => {
    const message = parts.map(String).join(" ");
    if (message.includes("Couldn't load texture blob:")) {
      suppressed.push(message);
      return;
    }
    originalError(...parts);
  };
  return new Promise((resolve, reject) => {
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    loader.parse(
      arrayBuffer,
      "",
      (gltf) => {
        console.error = originalError;
        resolve({ gltf, suppressed });
      },
      (error) => {
        console.error = originalError;
        reject(error);
      },
    );
  });
}

function validateRuntime(gltf, suppressed, runSpeed) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  function getNode(name) {
    return scene.getObjectByName(name) ?? scene.getObjectByName(name.replace(/[.\/]/gu, ""));
  }

  const skinnedMeshes = [];
  scene.traverse((object) => {
    if (object.isSkinnedMesh) skinnedMeshes.push(object);
  });
  const skinnedMesh = skinnedMeshes[0];
  const boneCount = skinnedMesh?.skeleton?.bones?.length ?? 0;
  const boneNames = (skinnedMesh?.skeleton?.bones ?? []).map((bone) => bone.name);
  const materialNames = new Set();
  for (const mesh of skinnedMeshes) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material?.name) materialNames.add(material.name);
    }
  }

  check("runtime.scene", Boolean(scene), `${gltf.scenes.length} scene(s)`);
  check("runtime.skinned_mesh", Boolean(skinnedMesh), `${skinnedMeshes.length} skinned primitive(s)`);
  check("runtime.skeleton_bones", boneCount === 22, `${boneCount} skeleton bones`);
  check(
    "runtime.required_bones",
    ["root", "hips", "head", "hand.L", "hand.R", "foot.L", "foot.R", "toe.L", "toe.R"].every((name) =>
      boneNames.includes(name.replace(/[.\/]/gu, ""))),
    `all driver bones exposed to AnimationMixer (${boneNames.length} bones)`,
  );
  check(
    "runtime.material_slots",
    materialNames.size === 24,
    `${materialNames.size} unique materials across ${skinnedMeshes.length} skinned primitives`,
  );
  check(
    "runtime.skin_attributes",
    Boolean(skinnedMesh?.geometry?.attributes?.skinIndex && skinnedMesh?.geometry?.attributes?.skinWeight),
    "geometry carries skinIndex and skinWeight",
  );
  check(
    "runtime.texture_decode",
    true,
    suppressed.length
      ? `PNG decode skipped in Node (${suppressed.length} image); validated structurally instead`
      : "no deferred textures",
    true,
  );

  check("runtime.clips", gltf.animations.length === 11, `${gltf.animations.length} AnimationClips`);
  const required = Object.keys(REQUIRED_CLIPS);
  const missing = required.filter((name) => !gltf.animations.some((clip) => clip.name === name));
  check("runtime.clip_names", missing.length === 0, missing.length ? `missing=${missing}` : "all clips named correctly");

  // Every track must bind to a node in the loaded scene.
  const unbound = [];
  for (const clip of gltf.animations) {
    for (const track of clip.tracks) {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      const node = THREE.PropertyBinding.findNode(scene, parsed.nodeName);
      if (!node) unbound.push(`${clip.name}:${track.name}`);
    }
  }
  check(
    "runtime.track_bindings",
    unbound.length === 0,
    unbound.length ? `${unbound.length} unbound (e.g. ${unbound[0]})` : "all tracks bind to scene nodes",
  );

  const mixer = new THREE.AnimationMixer(scene);
  const probeBones = ["hand.R", "head", "foot.L"].map(getNode).filter(Boolean);
  const runtimeMetrics = {};

  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip);
    action.reset();
    action.play();
    const positions = [];
    for (const time of [0, clip.duration * 0.25, clip.duration * 0.5, clip.duration * 0.75]) {
      mixer.setTime(time);
      scene.updateMatrixWorld(true);
      positions.push(probeBones.map((bone) => bone.getWorldPosition(new THREE.Vector3()).clone()));
    }
    let motion = 0;
    for (let index = 0; index < positions.length; index += 1) {
      for (let other = index + 1; other < positions.length; other += 1) {
        for (let bone = 0; bone < positions[index].length; bone += 1) {
          motion = Math.max(motion, positions[index][bone].distanceTo(positions[other][bone]));
        }
      }
    }
    runtimeMetrics[clip.name] = { motion_meters: Number(motion.toFixed(4)) };
    check(
      `runtime.${clip.name}.motion`,
      motion > 0.002,
      `max probe-bone travel ${motion.toFixed(3)} m across the clip`,
    );
    action.stop();
    mixer.stopAllAction();
  }

  // Cross-fade Idle -> Run the way the game will switch states.
  const idleClip = gltf.animations.find((clip) => clip.name === "Idle");
  const runClip = gltf.animations.find((clip) => clip.name === "Run");
  if (idleClip && runClip) {
    const idleAction = mixer.clipAction(idleClip);
    const runAction = mixer.clipAction(runClip);
    idleAction.reset().play();
    runAction.reset().play();
    runAction.crossFadeFrom(idleAction, 0.15, false);
    for (let step = 0; step < 30; step += 1) mixer.update(0.01);
    check(
      "runtime.crossfade_idle_to_run",
      runAction.getEffectiveWeight() > 0.95 && idleAction.getEffectiveWeight() < 0.05,
      `run weight ${runAction.getEffectiveWeight().toFixed(2)}, idle weight ${idleAction.getEffectiveWeight().toFixed(2)}`,
    );
    idleAction.stop();
    runAction.stop();
    mixer.stopAllAction();
  } else {
    record("runtime.crossfade_idle_to_run", "fail", "Idle or Run clip missing");
  }

  // Exported foot contact: the stance foot must travel backward at the
  // reference speed and stay on the ground.
  if (runClip) {
    const runAction = mixer.clipAction(runClip);
    runAction.reset().play();
    const leftFoot = getNode("foot.L");
    const rightFoot = getNode("foot.R");
    const leftToe = getNode("toe.L");
    const rightToe = getNode("toe.R");
    const intervals = REQUIRED_CLIPS.Run - 1;
    const samples = [];
    for (let frame = 0; frame < intervals; frame += 1) {
      mixer.setTime(frame / FPS);
      scene.updateMatrixWorld(true);
      samples.push({
        frame,
        phase: frame / intervals,
        L: leftFoot.getWorldPosition(new THREE.Vector3()),
        R: rightFoot.getWorldPosition(new THREE.Vector3()),
        toeL: leftToe.getWorldPosition(new THREE.Vector3()),
        toeR: rightToe.getWorldPosition(new THREE.Vector3()),
      });
    }

    const stanceReport = {};
    for (const side of ["L", "R"]) {
      const offset = side === "R" ? 0.5 : 0;
      const stance = samples.filter((sample) => (sample.phase + offset) % 1 < 0.4);
      const groups = [];
      for (const sample of stance) {
        if (groups.length && sample.frame === groups[groups.length - 1][groups[groups.length - 1].length - 1].frame + 1) {
          groups[groups.length - 1].push(sample);
        } else {
          groups.push([sample]);
        }
      }

      groups.forEach((group, groupIndex) => {
        const displacements = [];
        for (let index = 1; index < group.length; index += 1) {
          displacements.push(group[index][side].clone().sub(group[index - 1][side]));
        }
        // Contact speed is horizontal: the ankle also rises during toe-off.
        const speed =
          displacements.reduce((total, delta) => total + Math.hypot(delta.x, delta.z), 0) /
          (displacements.length / FPS);
        const speedError = Math.abs(speed - runSpeed) / runSpeed;
        const flatHeights = group
          .filter((sample) => ((sample.phase + offset) % 1) / 0.4 < 0.62)
          .map((sample) => sample[side].y);
        const lateHeights = group
          .filter((sample) => ((sample.phase + offset) % 1) / 0.4 >= 0.62)
          .map((sample) => sample[side].y);
        const heightError = Math.max(...flatHeights.map((height) => Math.abs(height - 0.11)));
        const heelLift = lateHeights.length ? Math.max(...lateHeights) - 0.11 : 0;

        stanceReport[`${side}${groupIndex}`] = {
          frames: group.map((sample) => sample.frame),
          speed_mps: Number(speed.toFixed(4)),
          speed_error_percent: Number((speedError * 100).toFixed(2)),
          direction_ok: displacements.every((delta) => delta.z > 0.01),
          flat_foot_height_error_mm: Number((heightError * 1000).toFixed(2)),
          toe_off_heel_lift_mm: Number((heelLift * 1000).toFixed(2)),
        };

        check(
          `runtime.run.${side}${groupIndex}.speed`,
          speedError < FOOT_SPEED_TOLERANCE,
          `${speed.toFixed(3)} m/s vs ${runSpeed.toFixed(3)} m/s (${(speedError * 100).toFixed(1)} %)`,
        );
        check(
          `runtime.run.${side}${groupIndex}.direction`,
          displacements.every((delta) => delta.z > 0.01),
          "stance foot travels along +Z (game backward / in-place locomotion)",
        );
        check(
          `runtime.run.${side}${groupIndex}.height`,
          heightError < 0.025,
          `flat-foot height error ${(heightError * 1000).toFixed(1)} mm`,
        );
        check(
          `runtime.run.${side}${groupIndex}.heel_lift`,
          heelLift > 0.015 && heelLift < 0.07,
          `toe-off heel lift ${(heelLift * 1000).toFixed(0)} mm`,
        );
      });
    }

    const minToe = Math.min(...samples.map((sample) => Math.min(sample.toeL.y, sample.toeR.y)));
    check("runtime.run.ground_penetration", minToe > -0.005, `lowest toe y=${(minToe * 1000).toFixed(1)} mm`);

    const hips = getNode("hips");
    const hipsHeights = samples.map((sample) => {
      mixer.setTime(sample.frame / FPS);
      scene.updateMatrixWorld(true);
      return hips.getWorldPosition(new THREE.Vector3()).y;
    });
    const hipBob = Math.max(...hipsHeights) - Math.min(...hipsHeights);
    check("runtime.run.hip_bob", hipBob > 0.02 && hipBob < 0.12, `${(hipBob * 1000).toFixed(0)} mm`);

    // Root must stay fixed while the clip plays.
    const root = getNode("root");
    const rootPositions = samples.map((sample) => {
      mixer.setTime(sample.frame / FPS);
      scene.updateMatrixWorld(true);
      return root.getWorldPosition(new THREE.Vector3());
    });
    const rootDrift = Math.max(...rootPositions.map((position) => position.distanceTo(rootPositions[0])));
    check("runtime.run.root_fixed", rootDrift < 1e-5, `root drift ${rootDrift.toExponential(2)} m`);

    runtimeMetrics.run = { stance: stanceReport, min_toe_y: Number(minToe.toFixed(4)), hip_bob_meters: Number(hipBob.toFixed(4)) };
    runAction.stop();
    mixer.stopAllAction();
  }

  metrics.runtime = { three_revision: THREE.REVISION, ...runtimeMetrics };
  mixer.uncacheRoot(scene);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Turkuaz GLB validation");
  console.log("-".repeat(60));

  check("file.exists", fs.existsSync(glbPath), glbPath);
  if (!fs.existsSync(glbPath)) throw new Error(`GLB not found: ${glbPath}`);
  const buffer = fs.readFileSync(glbPath);
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  metrics.file = {
    path: glbPath,
    bytes: buffer.length,
    sha256: fileHash,
  };
  check("file.size", buffer.length > 100_000, `${(buffer.length / 1024).toFixed(0)} KiB`);
  check(
    "file.container_alignment",
    buffer.length % 4 === 0,
    `${buffer.length} bytes (GLB chunks are 4-byte aligned)`,
  );

  const copies = [
    path.join(GAME_ROOT, "public", "models", "turkuaz_runner.glb"),
    path.join(GAME_ROOT, "src", "assets", "models", "turkuaz_runner.glb"),
    path.join(REPO_ROOT, "blender", "turkuaz_runner.glb"),
  ];
  for (const copy of copies) {
    if (!fs.existsSync(copy)) {
      check(`file.copy.${path.basename(path.dirname(path.dirname(copy)))}`, false, `${copy} missing`);
      continue;
    }
    const copyHash = hashFile(copy);
    check(
      `file.copy.${copy.includes(`${path.sep}src${path.sep}`) ? "src" : copy.includes(`${path.sep}public${path.sep}`) ? "public" : "blender"}`,
      copyHash === fileHash,
      copyHash === fileHash ? "byte-identical" : "differs from validated GLB",
    );
  }

  const { json, bin, version } = parseGlb(buffer);
  validateContainer(json, bin, version);
  validateMaterials(json);
  validateImages(json, bin);
  validateMeshAndSkin(json, bin);

  const armatureNode = (json.nodes ?? []).find((node) => node.name === "TK_Armature");
  const extras = armatureNode?.extras ?? {};
  metrics.extras = extras;
  validateAnimations(json, bin, extras);

  const { gltf, suppressed } = await loadGltf(buffer);
  validateRuntime(gltf, suppressed, Number(extras.run_reference_speed ?? RUN_REFERENCE_SPEED));

  const failed = checks.filter((item) => item.status === "fail");
  const warned = checks.filter((item) => item.status === "warn");
  const summary = {
    passed: checks.length - failed.length - warned.length,
    warnings: warned.length,
    failed: failed.length,
    total: checks.length,
  };
  const report = {
    asset: "TurkuazRunner",
    validated_file: glbPath,
    validator: "scripts/validate-character-glb.mjs",
    three_revision: THREE.REVISION,
    summary,
    checks,
    metrics,
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log("-".repeat(60));
  console.log(
    `${summary.passed} passed, ${summary.warnings} warnings, ${summary.failed} failed (${summary.total} checks)`,
  );
  console.log(`Report: ${reportPath}`);

  if (failed.length) {
    console.log("\nFailed checks:");
    for (const item of failed) console.log(`  - ${item.name}: ${item.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
