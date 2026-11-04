import * as THREE from 'three'
import { PALETTE } from '../../../config/Palette.ts'
import { WORLD_CONFIG } from '../../../config/WorldConfig.ts'
import { buildGeometry } from '../geometry/AssetGeometry.ts'

const fallVertexShader = /* glsl */ `
  #include <fog_pars_vertex>

  uniform float uTime;

  varying vec2 vUv;
  varying float vFall;

  void main() {
    vUv = uv;
    vFall = 1.0 - uv.y;

    vec3 transformed = position;
    float t = vFall;
    transformed.z += t * t * 0.34;
    transformed.x *= 1.0 + t * 0.16;
    transformed.x += sin(t * 9.0 + uTime * 3.4) * 0.02 * t;

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`

const fallFragmentShader = /* glsl */ `
  #include <fog_pars_fragment>

  uniform vec3 uLight;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform float uTime;

  varying vec2 vUv;
  varying float vFall;

  void main() {
    float edge =
      smoothstep(0.0, 0.07, vUv.x) * (1.0 - smoothstep(0.93, 1.0, vUv.x));

    float streaks =
      sin(vUv.x * 38.0 + sin(vUv.y * 7.0 - uTime * 2.2) * 1.7) * 0.5 + 0.5;
    float flow = sin(vUv.y * 24.0 - uTime * 7.5) * 0.5 + 0.5;
    float bands = smoothstep(0.3, 0.85, streaks * 0.72 + flow * 0.38);

    float topFoam = smoothstep(0.7, 0.98, vUv.y);
    // Falls dissolve before their tail, so scenery water fades into the air
    // instead of ending on a hard edge.
    float bottomFade = smoothstep(0.0, 0.34, vUv.y);

    vec3 color = mix(uDeep, uLight, 0.2 + bands * 0.8);
    color = mix(color, uFoam, topFoam * 0.9);

    float alpha = (0.3 + bands * 0.42 + topFoam * 0.28) * edge * bottomFade;

    gl_FragColor = vec4(color, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

/**
 * Shared waterfall GPU resources. Every fall in the world uses the same tiny
 * animated shader and foam geometry; only the transform changes per island.
 */
export class WaterfallAssets {
  readonly fallGeometry: THREE.PlaneGeometry
  readonly fallMaterial: THREE.ShaderMaterial
  readonly foamGeometry: THREE.BufferGeometry
  readonly foamMaterial: THREE.MeshBasicMaterial

  constructor() {
    const waterfall = WORLD_CONFIG.waterfall

    this.fallGeometry = new THREE.PlaneGeometry(
      1,
      1,
      waterfall.widthSegments,
      waterfall.heightSegments,
    )
    this.fallMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: { value: 0 },
        uLight: { value: new THREE.Color(PALETTE.waterfall) },
        uDeep: { value: new THREE.Color(PALETTE.waterfallDeep) },
        uFoam: { value: new THREE.Color(PALETTE.waterfallFoam) },
      },
      vertexShader: fallVertexShader,
      fragmentShader: fallFragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
      toneMapped: true,
    })

    this.foamGeometry = buildGeometry(
      [
        {
          geometry: new THREE.CircleGeometry(1, 22),
          rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
        },
        {
          geometry: new THREE.TorusGeometry(0.98, 0.16, 5, 24),
          rotation: new THREE.Euler(Math.PI / 2, 0, 0),
          position: new THREE.Vector3(0, 0.02, 0),
        },
        {
          geometry: new THREE.TorusGeometry(0.62, 0.09, 4, 20),
          rotation: new THREE.Euler(Math.PI / 2, 0, 0),
          position: new THREE.Vector3(0, 0.04, 0),
        },
      ],
      false,
    )
    this.foamMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.waterfallFoam,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: true,
      toneMapped: true,
    })
  }

  update(elapsed: number): void {
    this.fallMaterial.uniforms.uTime!.value = elapsed
    this.foamMaterial.opacity = 0.3 + Math.sin(elapsed * 2.1) * 0.06
  }

  dispose(): void {
    this.fallGeometry.dispose()
    this.fallMaterial.dispose()
    this.foamGeometry.dispose()
    this.foamMaterial.dispose()
  }
}

/** One waterfall instance. Transform-only, so instances are cheap to recycle. */
export class Waterfall {
  readonly root = new THREE.Group()

  private readonly fall: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private readonly foam: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  private readonly phase: number
  private foamScale = 1
  private height = 1

  constructor(assets: WaterfallAssets, phase: number) {
    this.phase = phase

    this.fall = new THREE.Mesh(assets.fallGeometry, assets.fallMaterial)
    this.fall.name = 'WaterfallFall'
    this.fall.renderOrder = 4
    this.root.add(this.fall)

    this.foam = new THREE.Mesh(assets.foamGeometry, assets.foamMaterial)
    this.foam.name = 'WaterfallFoam'
    this.foam.renderOrder = 5
    this.root.add(this.foam)
  }

  configure(width: number, height: number, foam = true): void {
    this.height = Math.max(0.4, height)
    this.fall.scale.set(width, this.height, this.height)
    this.fall.position.y = this.height / 2
    this.foamScale = width * 1.15
    this.foam.scale.set(this.foamScale, 1, this.foamScale)
    this.foam.visible = foam
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible
  }

  update(elapsed: number): void {
    if (!this.root.visible) {
      return
    }
    const pulse = 1 + Math.sin(elapsed * 2.4 + this.phase) * 0.07
    this.foam.scale.set(this.foamScale * pulse, 1, this.foamScale * pulse)
    this.foam.rotation.y = elapsed * 0.35 + this.phase
    this.fall.position.y = this.height / 2 + Math.sin(elapsed * 1.6 + this.phase) * 0.01
  }

  dispose(): void {
    this.root.removeFromParent()
    this.root.clear()
  }
}
