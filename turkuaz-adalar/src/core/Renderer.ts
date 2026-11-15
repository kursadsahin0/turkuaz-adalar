import * as THREE from 'three'
import { RENDER_CONFIG } from '../config/RenderConfig.ts'
import type { QualityLevel, QualitySettings } from '../config/QualitySettings.ts'
import { detectQualityLevel, getQualitySettings } from '../config/QualitySettings.ts'
import { EventEmitter } from '../utils/EventEmitter.ts'
import { GameError, toError } from '../utils/errors.ts'

export interface ViewportSize {
  width: number
  height: number
  pixelRatio: number
  aspect: number
}

type RendererEvents = {
  resize: ViewportSize
}

/**
 * Owns the WebGL renderer, its canvas and the responsive sizing pipeline.
 * All rendering defaults (colour management, tone mapping, shadows) live here.
 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer
  readonly canvas: HTMLCanvasElement
  readonly events = new EventEmitter<RendererEvents>()

  private readonly container: HTMLElement
  private resizeObserver: ResizeObserver | null = null
  private pixelRatioLimit: number | null = null
  private width = 1
  private height = 1
  private pixelRatio = 1
  private disposed = false
  private qualitySettings: QualitySettings

  private readonly handleWindowResize = (): void => {
    this.resize()
  }

  private readonly handleContextMenu = (event: Event): void => {
    event.preventDefault()
  }

  constructor(container: HTMLElement, qualityLevel?: QualityLevel) {
    this.container = container

    // Detect or use the provided quality level; presets live in QualitySettings.ts.
    this.qualitySettings = { ...getQualitySettings(qualityLevel ?? detectQualityLevel()) }

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: this.qualitySettings.antialias,
        alpha: false,
        depth: true,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      })
    } catch (error) {
      throw new GameError(
        'WebGL could not be started. Please make sure hardware acceleration is enabled.',
        'WEBGL_UNAVAILABLE',
        { cause: toError(error) },
      )
    }

    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = RENDER_CONFIG.toneMappingExposure
    this.renderer.shadowMap.enabled = this.qualitySettings.shadowsEnabled
    this.renderer.shadowMap.type = this.qualitySettings.shadowMapType
    this.renderer.setClearColor(RENDER_CONFIG.clearColor, 1)

    this.canvas = this.renderer.domElement
    this.canvas.className = 'game-canvas'
    this.canvas.setAttribute('aria-label', 'Tidelark game world')
    this.canvas.addEventListener('contextmenu', this.handleContextMenu)
    this.container.appendChild(this.canvas)

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize())
      this.resizeObserver.observe(this.container)
    }

    window.addEventListener('resize', this.handleWindowResize, { passive: true })
    window.addEventListener('orientationchange', this.handleWindowResize, { passive: true })
    window.visualViewport?.addEventListener('resize', this.handleWindowResize, { passive: true })

    this.resize()
  }

  private resize(): void {
    if (this.disposed) {
      return
    }

    const width = Math.max(1, Math.round(this.container.clientWidth || window.innerWidth))
    const height = Math.max(1, Math.round(this.container.clientHeight || window.innerHeight))
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      this.pixelRatioLimit ?? this.qualitySettings.maxPixelRatio,
    )

    const sizeChanged = width !== this.width || height !== this.height
    const ratioChanged = pixelRatio !== this.pixelRatio
    if (!sizeChanged && !ratioChanged) {
      return
    }

    this.width = width
    this.height = height
    this.pixelRatio = pixelRatio

    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(width, height, false)

    this.events.emit('resize', {
      width,
      height,
      pixelRatio,
      aspect: width / height,
    })
  }

  getQualitySettings(): QualitySettings {
    return this.qualitySettings
  }

  /** The screen's own pixel ratio: the sharpest the canvas can usefully be. */
  get devicePixelRatio(): number {
    return window.devicePixelRatio || 1
  }

  /**
   * Caps the pixel ratio below the tier's maximum (dynamic resolution), or
   * `null` to use the tier's maximum.
   */
  setPixelRatioLimit(limit: number | null): void {
    this.pixelRatioLimit = limit
    this.resize()
  }

  setQualityLevel(level: QualityLevel): void {
    this.qualitySettings = { ...getQualitySettings(level) }

    this.renderer.shadowMap.enabled = this.qualitySettings.shadowsEnabled
    this.renderer.shadowMap.type = this.qualitySettings.shadowMapType

    this.resize()
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.disposed) {
      this.renderer.render(scene, camera)
    }
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true

    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    window.removeEventListener('resize', this.handleWindowResize)
    window.removeEventListener('orientationchange', this.handleWindowResize)
    window.visualViewport?.removeEventListener('resize', this.handleWindowResize)
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu)
    this.events.clear()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.canvas.remove()
  }
}
