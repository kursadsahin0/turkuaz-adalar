import { clamp } from '../../utils/math.ts'

export interface InputCallbacks {
  onPause: () => void
  onToggleMute: () => void
}

const TAP_MAX_DISTANCE = 18
const TAP_MAX_DURATION = 350
const SWIPE_UP_THRESHOLD = 48
const SWIPE_DOWN_THRESHOLD = 56

/**
 * Unified keyboard + touch input. This layer only produces intent: discrete
 * lane steps, jumps, slides and dashes. It never touches the player, physics or
 * lane positions — `LaneController` owns movement rules.
 *
 * Touch gestures:
 * - horizontal swipe → exactly one lane step (locked for the rest of the gesture)
 * - tap or swipe up → jump
 * - swipe down → slide
 */
export class InputManager {
  private readonly canvas: HTMLCanvasElement
  private readonly callbacks: InputCallbacks

  private pointerId: number | null = null
  private pointerStartX = 0
  private pointerStartY = 0
  private pointerStartTime = 0
  private laneTriggered = false
  private readonly laneQueue: number[] = []
  private readonly jumpKeys = new Set<string>()
  private pointerHeld = false
  private jumpQueued = false
  private slideQueued = false
  private dashQueued = false
  private disposed = false

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) {
      return
    }

    const actionKeys = [
      'Space',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ShiftLeft',
      'ShiftRight',
      'KeyK',
    ]
    if (actionKeys.includes(event.code)) {
      event.preventDefault()
    }

    if (event.repeat) {
      return
    }

    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.queueLaneChange(-1)
        break
      case 'ArrowRight':
      case 'KeyD':
        this.queueLaneChange(1)
        break
      case 'Space':
      case 'ArrowUp':
      case 'KeyW':
        this.jumpKeys.add(event.code)
        this.jumpQueued = true
        break
      case 'ArrowDown':
      case 'KeyS':
        this.slideQueued = true
        break
      case 'ShiftLeft':
      case 'ShiftRight':
      case 'KeyK':
        this.dashQueued = true
        break
      case 'Escape':
      case 'KeyP':
        this.callbacks.onPause()
        break
      case 'KeyM':
        this.callbacks.onToggleMute()
        break
    }
  }

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.jumpKeys.delete(event.code)
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || this.pointerId !== null) {
      return
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    event.preventDefault()
    this.pointerId = event.pointerId
    this.pointerStartX = event.clientX
    this.pointerStartY = event.clientY
    this.pointerStartTime = performance.now()
    this.laneTriggered = false
    this.pointerHeld = true

    try {
      this.canvas.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture is an enhancement; gestures still work without it.
    }
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || this.laneTriggered) {
      return
    }

    const deltaX = event.clientX - this.pointerStartX
    const deltaY = event.clientY - this.pointerStartY
    if (Math.abs(deltaX) < this.laneSwipeThreshold()) {
      return
    }
    if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.1) {
      return
    }

    // Fire as soon as the threshold is crossed for responsive touch controls,
    // then lock the gesture so one swipe can never change two lanes.
    this.laneTriggered = true
    this.queueLaneChange(deltaX > 0 ? 1 : -1)
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) {
      return
    }

    const deltaX = event.clientX - this.pointerStartX
    const deltaY = event.clientY - this.pointerStartY
    const distance = Math.hypot(deltaX, deltaY)
    const duration = performance.now() - this.pointerStartTime
    const horizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.1

    if (!this.laneTriggered) {
      if (distance < TAP_MAX_DISTANCE && duration < TAP_MAX_DURATION) {
        this.jumpQueued = true
      } else if (!horizontal && deltaY < -SWIPE_UP_THRESHOLD) {
        this.jumpQueued = true
      } else if (!horizontal && deltaY > SWIPE_DOWN_THRESHOLD) {
        this.slideQueued = true
      }
    }

    this.releasePointer(event.pointerId)
  }

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) {
      this.releasePointer(event.pointerId)
    }
  }

  private readonly handleBlur = (): void => {
    this.reset()
  }

  constructor(canvas: HTMLCanvasElement, callbacks: InputCallbacks) {
    this.canvas = canvas
    this.callbacks = callbacks

    window.addEventListener('keydown', this.handleKeyDown, { passive: false })
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('blur', this.handleBlur)
    canvas.addEventListener('pointerdown', this.handlePointerDown, { passive: false })
    canvas.addEventListener('pointermove', this.handlePointerMove, { passive: false })
    canvas.addEventListener('pointerup', this.handlePointerUp)
    canvas.addEventListener('pointercancel', this.handlePointerCancel)
  }

  /** Next queued lane step, or 0 when no input is waiting. */
  consumeLaneChange(): number {
    return this.laneQueue.shift() ?? 0
  }

  consumeJump(): boolean {
    const queued = this.jumpQueued
    this.jumpQueued = false
    return queued
  }

  consumeSlide(): boolean {
    const queued = this.slideQueued
    this.slideQueued = false
    return queued
  }

  consumeDash(): boolean {
    const queued = this.dashQueued
    this.dashQueued = false
    return queued
  }

  /** True while a jump key or the touch pointer is still held. */
  isJumpHeld(): boolean {
    return this.jumpKeys.size > 0 || this.pointerHeld
  }

  queueLaneChange(direction: -1 | 1): void {
    // A handful of buffered steps is plenty; prevents key-repeat floods.
    if (this.laneQueue.length >= 4) {
      return
    }
    this.laneQueue.push(direction)
  }

  queueJump(): void {
    this.jumpQueued = true
  }

  queueSlide(): void {
    this.slideQueued = true
  }

  queueDash(): void {
    this.dashQueued = true
  }

  reset(): void {
    this.laneQueue.length = 0
    this.laneTriggered = false
    this.jumpQueued = false
    this.slideQueued = false
    this.dashQueued = false
    this.jumpKeys.clear()
    this.pointerHeld = false
    if (this.pointerId !== null) {
      this.releasePointer(this.pointerId)
    }
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true

    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('blur', this.handleBlur)
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel)
  }

  private laneSwipeThreshold(): number {
    const width = typeof window === 'undefined' ? 390 : window.innerWidth
    return clamp(width * 0.07, 26, 56)
  }

  private releasePointer(pointerId: number): void {
    this.pointerId = null
    this.pointerHeld = false
    this.laneTriggered = false
    try {
      if (this.canvas.hasPointerCapture(pointerId)) {
        this.canvas.releasePointerCapture(pointerId)
      }
    } catch {
      // The pointer may already have been released by the browser.
    }
  }
}
