import * as THREE from 'three'
import { PALETTE } from '../../config/Palette.ts'

const vertexShader = /* glsl */ `
  #include <fog_pars_vertex>

  uniform float uTime;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying float vWave;

  void main() {
    vec4 worldBase = modelMatrix * vec4(position, 1.0);

    float phaseA = worldBase.x * 0.12 + uTime * 0.9;
    float phaseB = worldBase.z * 0.18 - uTime * 0.7;
    float phaseC = (worldBase.x + worldBase.z) * 0.06 + uTime * 0.5;
    float phaseD = (worldBase.x - worldBase.z) * 0.31 + uTime * 1.4;

    float waveA = sin(phaseA) * 0.12;
    float waveB = sin(phaseB) * 0.09;
    float waveC = sin(phaseC) * 0.14;
    float waveD = sin(phaseD) * 0.035;
    float height = waveA + waveB + waveC + waveD;

    float slopeX =
      cos(phaseA) * 0.0144 + cos(phaseC) * 0.0084 + cos(phaseD) * 0.01085;
    float slopeZ =
      cos(phaseB) * 0.0162 + cos(phaseC) * 0.0084 - cos(phaseD) * 0.01085;

    vec3 displaced = position;
    displaced.y += height;

    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPosition.xyz;
    vNormal = normalize(vec3(-slopeX, 1.0, -slopeZ));
    vWave = height;

    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  #include <fog_pars_fragment>

  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform float uTime;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying float vWave;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - clamp(dot(viewDirection, normal), 0.0, 1.0), 2.6);

    float band =
      sin(vWorldPosition.x * 0.2 + vWorldPosition.z * 0.16 + uTime * 0.6) * 0.5 + 0.5;
    float swell =
      sin(vWorldPosition.x * 0.06 - vWorldPosition.z * 0.1 + uTime * 0.24) * 0.5 + 0.5;

    vec3 color = mix(
      uDeep,
      uShallow,
      clamp(
        0.2 + fresnel * 0.8 + band * 0.1 + swell * 0.08 + vWave * 0.5,
        0.0,
        1.0
      )
    );

    vec3 halfDirection = normalize(uSunDirection + viewDirection);
    float specular = pow(max(dot(normal, halfDirection), 0.0), 180.0);
    color += uSunColor * specular * 1.7;

    float crest = smoothstep(0.2, 0.34, vWave);
    color = mix(color, uFoam, crest * 0.26);

    float shimmer = smoothstep(
      0.965,
      1.0,
      sin(
        vWorldPosition.x * 0.9 +
        sin(vWorldPosition.z * 0.65 + uTime * 0.9)
      ) * 0.5 + 0.5
    );
    color += uFoam * shimmer * 0.24;

    // Soft surf rolling along both sides of the island chain.
    float shore = smoothstep(2.6, 0.0, abs(abs(vWorldPosition.x) - 6.5));
    float surf =
      sin(
        vWorldPosition.z * 0.75 +
        uTime * 1.25 +
        sin(vWorldPosition.x * 0.4) * 2.0
      ) * 0.5 + 0.5;
    float surfLine = smoothstep(0.32, 0.0, abs(abs(vWorldPosition.x) - 6.45));
    color = mix(color, uFoam, shore * (0.06 + surf * 0.2));
    color += uFoam * surfLine * (0.18 + surf * 0.3);

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

/** Stylised, world-anchored ocean surface with waves, surf and sun glitter. */
export class Ocean {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>

  private readonly material: THREE.ShaderMaterial

  constructor() {
    const geometry = new THREE.PlaneGeometry(460, 460, 96, 96)
    geometry.rotateX(-Math.PI / 2)

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(PALETTE.oceanDeep) },
        uShallow: { value: new THREE.Color(PALETTE.oceanShallow) },
        uFoam: { value: new THREE.Color(PALETTE.oceanFoam) },
        uSunColor: { value: new THREE.Color(PALETTE.skySun) },
        uSunDirection: {
          value: new THREE.Vector3(-34, 52, -48).normalize(),
        },
      },
      vertexShader,
      fragmentShader,
      fog: true,
      toneMapped: true,
    })

    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.name = 'Ocean'
    this.mesh.position.y = 0
    this.mesh.receiveShadow = false
    this.mesh.frustumCulled = false
  }

  update(playerPosition: THREE.Vector3, elapsed: number): void {
    // Stay aligned with the track's centreline so the shoreline surf hugs the
    // island edge even when the runner drifts sideways.
    this.mesh.position.x = 0
    this.mesh.position.z = playerPosition.z
    this.material.uniforms.uTime!.value = elapsed
  }

  /** Island-specific sea colours; `null` restores the authored turquoise. */
  setColors(deep: number | null, shallow: number | null): void {
    ;(this.material.uniforms.uDeep!.value as THREE.Color).set(deep ?? PALETTE.oceanDeep)
    ;(this.material.uniforms.uShallow!.value as THREE.Color).set(shallow ?? PALETTE.oceanShallow)
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
