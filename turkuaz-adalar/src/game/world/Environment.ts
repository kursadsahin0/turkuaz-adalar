import * as THREE from 'three'
import { GAME_CONFIG } from '../../config/GameConfig.ts'
import { PALETTE } from '../../config/Palette.ts'
import { RENDER_CONFIG } from '../../config/RenderConfig.ts'
import { WORLD_CONFIG } from '../../config/WorldConfig.ts'
import { disposeObject3D } from '../../utils/dispose.ts'
import { buildGeometry } from './geometry/AssetGeometry.ts'
import type { GeometryPart } from './geometry/AssetGeometry.ts'

const skyVertexShader = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const skyFragmentShader = /* glsl */ `
  uniform vec3 uTopColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;

  varying vec3 vDirection;

  void main() {
    vec3 direction = normalize(vDirection);
    float height = clamp(direction.y, 0.0, 1.0);
    vec3 color = mix(uHorizonColor, uTopColor, pow(height, 0.62));

    float sunAmount = max(dot(direction, normalize(uSunDirection)), 0.0);
    float sunDisc = pow(sunAmount, 900.0);
    float sunGlow = pow(sunAmount, 12.0) * 0.22;
    color += uSunColor * (sunDisc * 1.4 + sunGlow);

    // Warm haze band hugging the waterline.
    float haze = exp(-abs(direction.y) * 12.0);
    color = mix(color, uHorizonColor * 1.04, haze * 0.22);

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

interface CloudData {
  mesh: THREE.Mesh
  speed: number
  drift: number
  baseY: number
  limit: number
}

/**
 * Lighting rig, gradient sky and drifting cloud banks. The sun and sky follow
 * the runner so shadows and atmosphere remain stable forever. Clouds are merged
 * into one mesh per bank and ignore fog, so they stay crisp against the sky.
 */
export class Environment {
  readonly root = new THREE.Group()

  private readonly skyRoot = new THREE.Group()
  private readonly sun: THREE.DirectionalLight
  private readonly sunTarget = new THREE.Object3D()
  private readonly skyMaterial: THREE.ShaderMaterial
  private readonly clouds: CloudData[] = []
  private readonly nearCloudMaterial: THREE.MeshStandardMaterial
  private readonly farCloudMaterial: THREE.MeshStandardMaterial

  constructor() {
    this.root.name = 'Environment'

    const skyGeometry = new THREE.SphereGeometry(310, 32, 20)
    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTopColor: { value: new THREE.Color(PALETTE.skyTop) },
        uHorizonColor: { value: new THREE.Color(PALETTE.skyHorizon) },
        uSunColor: { value: new THREE.Color(PALETTE.skySun) },
        uSunDirection: { value: new THREE.Vector3(-34, 52, -48).normalize() },
      },
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: true,
    })

    const sky = new THREE.Mesh(skyGeometry, this.skyMaterial)
    sky.name = 'Sky'
    sky.frustumCulled = false
    sky.renderOrder = -10
    this.skyRoot.add(sky)

    this.nearCloudMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.97,
      metalness: 0,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false,
    })
    this.farCloudMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.98,
      metalness: 0,
      flatShading: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      fog: false,
    })
    this.createClouds()

    const hemisphere = new THREE.HemisphereLight(PALETTE.skyTop, PALETTE.sand, 1.45)
    hemisphere.name = 'HemisphereFill'
    hemisphere.position.set(0, 40, 0)

    this.sun = new THREE.DirectionalLight(PALETTE.sun, 2.9)
    this.sun.name = 'Sun'
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(RENDER_CONFIG.shadow.mapSize, RENDER_CONFIG.shadow.mapSize)
    this.sun.shadow.camera.left = -RENDER_CONFIG.shadow.cameraSize
    this.sun.shadow.camera.right = RENDER_CONFIG.shadow.cameraSize
    this.sun.shadow.camera.top = RENDER_CONFIG.shadow.cameraSize
    this.sun.shadow.camera.bottom = -RENDER_CONFIG.shadow.cameraSize
    this.sun.shadow.camera.near = RENDER_CONFIG.shadow.near
    this.sun.shadow.camera.far = RENDER_CONFIG.shadow.far
    this.sun.shadow.bias = RENDER_CONFIG.shadow.bias
    this.sun.shadow.normalBias = RENDER_CONFIG.shadow.normalBias
    this.sun.shadow.camera.updateProjectionMatrix()
    this.sun.target = this.sunTarget

    const fill = new THREE.DirectionalLight(PALETTE.fill, 0.5)
    fill.name = 'CoolFill'
    fill.position.set(18, 24, 26)

    this.root.add(this.skyRoot, hemisphere, this.sun, this.sunTarget, fill)
  }

  update(delta: number, elapsed: number, playerPosition: THREE.Vector3): void {
    this.skyRoot.position.set(playerPosition.x, 0, playerPosition.z)

    this.sunTarget.position.set(playerPosition.x, GAME_CONFIG.track.topY, playerPosition.z)
    this.sun.position.set(
      playerPosition.x - 34,
      GAME_CONFIG.track.topY + 52,
      playerPosition.z - 48,
    )
    this.sunTarget.updateMatrixWorld()

    for (const cloud of this.clouds) {
      cloud.drift += cloud.speed * delta
      if (cloud.drift > cloud.limit) {
        cloud.drift = -cloud.limit
      }
      cloud.mesh.position.x = cloud.drift
      cloud.mesh.position.y =
        cloud.baseY + Math.sin(elapsed * 0.14 + cloud.speed * 40) * 0.7
    }
  }

  dispose(): void {
    this.root.removeFromParent()
    disposeObject3D(this.root)
    this.root.clear()
    this.sun.shadow.dispose()
  }

  private createClouds(): void {
    const config = WORLD_CONFIG.clouds
    this.createCloudLayer(config.count, false)
    this.createCloudLayer(config.farCount, true)
  }

  private createCloudLayer(count: number, far: boolean): void {
    const config = WORLD_CONFIG.clouds
    const random = (min: number, max: number): number => min + Math.random() * (max - min)

    for (let index = 0; index < count; index += 1) {
      const parts: GeometryPart[] = []
      const puffs = 4 + Math.floor(Math.random() * 4)

      for (let puffIndex = 0; puffIndex < puffs; puffIndex += 1) {
        const puffY = random(-1.3, 1.6)
        const scale = random(3.4, 6.2)
        parts.push({
          geometry: new THREE.IcosahedronGeometry(1, 1),
          color: puffY < 0.05 ? PALETTE.cloudShade : PALETTE.cloud,
          position: new THREE.Vector3(
            random(-6.8, 6.8),
            puffY,
            random(-3.4, 3.4),
          ),
          scale: new THREE.Vector3(
            scale,
            scale * random(0.42, 0.62),
            scale * random(0.7, 1.0),
          ),
          rotation: new THREE.Euler(
            random(0, Math.PI),
            random(0, Math.PI),
            random(0, Math.PI),
          ),
        })
      }

      const mesh = new THREE.Mesh(
        buildGeometry(parts, true),
        far ? this.farCloudMaterial : this.nearCloudMaterial,
      )
      mesh.name = far ? `FarCloud-${index}` : `Cloud-${index}`

      const baseY = far ? random(28, config.maxY) : random(config.minY, 44)
      mesh.position.set(
        random(-160, 160) * (far ? 1.35 : 1),
        baseY,
        far ? config.farZ + random(-20, 20) : random(-150, 10),
      )
      mesh.scale.setScalar(far ? random(2.2, 3.8) : random(0.75, 1.35))

      this.clouds.push({
        mesh,
        speed: random(0.5, 1.4) * (far ? 0.6 : 1),
        drift: mesh.position.x,
        baseY,
        limit: far ? 235 : config.driftLimit,
      })
      this.skyRoot.add(mesh)
    }
  }
}
