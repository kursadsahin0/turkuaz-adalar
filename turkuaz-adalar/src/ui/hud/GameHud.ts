import { createEl } from '../../utils/dom.ts'
import { formatDistance, formatInteger } from '../format.ts'
import { IconButton } from '../components/IconButton.ts'
import { ICON_PATHS } from '../screens/screenUtils.ts'

export interface HUDPowerUp {
  kind: string
  label: string
  remaining: number
  duration: number
  charges: number
}

export type HUDFeedbackTone = 'coin' | 'powerup' | 'reward' | 'shield'

export interface HUDState {
  score: number
  distance: number
  crystals: number
  /** Coins earned in this run. */
  coins: number
  /** Persistent wallet balance including this run. */
  coinBalance: number
  powerUps: readonly HUDPowerUp[]
  dashCharge: number
  dashCooldown: number
  dashReady: boolean
  dashActive: boolean
  /** Label of the strongest active temporary movement effect. */
  effectLabel: string
  effectRemaining: number
  effectDuration: number
  slideActive: boolean
  slideCooldown: number
  /** Level name for current run. */
  levelName: string
  /** Level progress (0-1). */
  levelProgress: number
  /** Target distance for current level. */
  targetDistance: number
}

export interface GameHudOptions {
  onPause: () => void
  onJump: () => void
  onSlide: () => void
  onDash: () => void
}

const DASH_RADIUS = 24
const DASH_CIRCUMFERENCE = 2 * Math.PI * DASH_RADIUS
const TOAST_LIFETIME = 900
const POWER_UP_GLYPHS: Readonly<Record<string, string>> = {
  shield: '◈',
  magnet: '∩',
  speed: '»',
  doubleJump: '⇈',
}

/**
 * In-run overlay. The HUD is intentionally split into a read-only statistics
 * bar and a control layer so gameplay systems never touch the DOM.
 */
export class GameHud {
  readonly root: HTMLDivElement

  private readonly scoreValue: HTMLSpanElement
  private readonly distanceValue: HTMLSpanElement
  private readonly crystalsValue: HTMLSpanElement
  private readonly coinsValue: HTMLSpanElement
  private readonly coinsLabel: HTMLSpanElement
  private readonly powerUpTray: HTMLDivElement
  private readonly toastTray: HTMLDivElement
  private readonly effectBadge: HTMLDivElement
  private readonly effectLabel: HTMLSpanElement
  private readonly effectTime: HTMLSpanElement
  private readonly effectFill: HTMLSpanElement
  private readonly slideButton: HTMLButtonElement
  private readonly dashButton: HTMLButtonElement
  private readonly dashTimer: HTMLSpanElement
  private readonly dashRing: SVGCircleElement
  private readonly pauseButton: IconButton
  private readonly actions: GameHudOptions
  private readonly powerUpChips = new Map<
    string,
    { root: HTMLDivElement; time: HTMLSpanElement; fill: HTMLSpanElement }
  >()
  private readonly toastTimers = new Set<number>()
  private readonly levelName: HTMLSpanElement
  private readonly levelProgress: HTMLDivElement
  private readonly levelProgressFill: HTMLDivElement

  private readonly handleClick = (event: Event): void => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action
    if (action === 'jump') {
      this.actions.onJump()
    } else if (action === 'slide') {
      this.actions.onSlide()
    } else if (action === 'dash') {
      this.actions.onDash()
    }
  }

  constructor(options: GameHudOptions) {
    this.actions = options
    this.root = createEl('div', 'hud')
    this.root.hidden = true
    this.root.setAttribute('aria-hidden', 'true')

    const top = createEl('div', 'hud__top')

    const score = createEl('div', 'hud-stat hud-stat--score')
    const scoreLabel = createEl('span', 'hud-stat__label', 'Score')
    this.scoreValue = createEl('span', 'hud-stat__value', '0')
    score.append(scoreLabel, this.scoreValue)

    const metrics = createEl('div', 'hud__metrics')
    const distance = createEl('div', 'hud-stat hud-stat--small')
    const distanceLabel = createEl('span', 'hud-stat__label', 'Distance')
    this.distanceValue = createEl('span', 'hud-stat__value', '0 m')
    distance.append(distanceLabel, this.distanceValue)

    const crystals = createEl('div', 'hud-stat hud-stat--small')
    const crystalsLabel = createEl('span', 'hud-stat__label', 'Crystals')
    this.crystalsValue = createEl('span', 'hud-stat__value', '0')
    crystals.append(crystalsLabel, this.crystalsValue)

    const coins = createEl('div', 'hud-stat hud-stat--small hud-stat--coins')
    this.coinsLabel = createEl('span', 'hud-stat__label', 'Coins')
    this.coinsValue = createEl('span', 'hud-stat__value', '0')
    coins.append(this.coinsLabel, this.coinsValue)
    metrics.append(distance, crystals, coins)

    const level = createEl('div', 'hud-stat hud-stat--level')
    this.levelName = createEl('span', 'hud-stat__label', 'Level')
    this.levelProgress = createEl('div', 'hud-stat__progress')
    this.levelProgressFill = createEl('div', 'hud-stat__progress-fill')
    this.levelProgress.appendChild(this.levelProgressFill)
    level.append(this.levelName, this.levelProgress)

    const stats = createEl('div', 'hud__stats')
    stats.append(score, metrics, level)

    this.pauseButton = new IconButton({
      iconPaths: ICON_PATHS.pause,
      label: 'Pause run',
      onClick: options.onPause,
      className: 'hud__pause',
    })

    top.append(stats, this.pauseButton.element)

    this.effectBadge = createEl('div', 'hud__effect')
    this.effectBadge.hidden = true
    const effectText = createEl('div', 'hud__effect-text')
    this.effectLabel = createEl('span', 'hud__effect-label', '')
    this.effectTime = createEl('span', 'hud__effect-time', '')
    effectText.append(this.effectLabel, this.effectTime)
    const effectTrack = createEl('div', 'hud__effect-track')
    this.effectFill = createEl('span', 'hud__effect-fill')
    effectTrack.append(this.effectFill)
    this.effectBadge.append(effectText, effectTrack)

    this.powerUpTray = createEl('div', 'hud__powerups')
    this.powerUpTray.setAttribute('aria-live', 'polite')
    this.toastTray = createEl('div', 'hud__toasts')
    this.toastTray.setAttribute('aria-live', 'polite')

    const controls = createEl('div', 'hud__controls')

    const jump = createEl('button', 'action-btn action-btn--jump')
    jump.type = 'button'
    jump.dataset.action = 'jump'
    jump.setAttribute('aria-label', 'Jump')
    const jumpGlyph = createEl('span', 'action-btn__glyph', '↑')
    const jumpLabel = createEl('span', 'action-btn__label', 'Jump')
    jump.append(jumpGlyph, jumpLabel)

    this.slideButton = createEl('button', 'action-btn action-btn--slide')
    this.slideButton.type = 'button'
    this.slideButton.dataset.action = 'slide'
    this.slideButton.setAttribute('aria-label', 'Slide')
    const slideGlyph = createEl('span', 'action-btn__glyph', '↓')
    const slideLabel = createEl('span', 'action-btn__label', 'Slide')
    this.slideButton.append(slideGlyph, slideLabel)

    this.dashButton = createEl('button', 'action-btn action-btn--dash')
    this.dashButton.type = 'button'
    this.dashButton.dataset.action = 'dash'
    this.dashButton.setAttribute('aria-label', 'Dash, ready')

    const namespace = 'http://www.w3.org/2000/svg'
    const ring = document.createElementNS(namespace, 'svg')
    ring.setAttribute('class', 'dash-ring')
    ring.setAttribute('viewBox', '0 0 56 56')
    ring.setAttribute('aria-hidden', 'true')

    const ringTrack = document.createElementNS(namespace, 'circle')
    ringTrack.setAttribute('class', 'dash-ring__track')
    ringTrack.setAttribute('cx', '28')
    ringTrack.setAttribute('cy', '28')
    ringTrack.setAttribute('r', String(DASH_RADIUS))

    this.dashRing = document.createElementNS(namespace, 'circle')
    this.dashRing.setAttribute('class', 'dash-ring__charge')
    this.dashRing.setAttribute('cx', '28')
    this.dashRing.setAttribute('cy', '28')
    this.dashRing.setAttribute('r', String(DASH_RADIUS))
    this.dashRing.setAttribute('stroke-dasharray', String(DASH_CIRCUMFERENCE))
    this.dashRing.setAttribute('stroke-dashoffset', '0')

    ring.append(ringTrack, this.dashRing)

    const dashContent = createEl('span', 'action-btn__content')
    const dashGlyph = createEl('span', 'action-btn__glyph', '»')
    const dashLabel = createEl('span', 'action-btn__label', 'Dash')
    this.dashTimer = createEl('span', 'action-btn__timer', 'Ready')
    dashContent.append(dashGlyph, dashLabel)
    this.dashButton.append(ring, dashContent, this.dashTimer)

    controls.append(jump, this.slideButton, this.dashButton)

    const hint = createEl('p', 'hud__hint only-fine')
    hint.append(
      createEl('kbd', '', 'A'),
      createEl('kbd', '', 'D'),
      createEl('span', '', ' lanes  ·  '),
      createEl('kbd', '', 'Space'),
      createEl('span', '', ' jump  ·  '),
      createEl('kbd', '', 'S'),
      createEl('span', '', ' slide  ·  '),
      createEl('kbd', '', 'Shift'),
      createEl('span', '', ' dash  ·  '),
      createEl('kbd', '', 'Esc'),
      createEl('span', '', ' pause'),
    )

    this.root.append(
      top,
      this.effectBadge,
      this.powerUpTray,
      this.toastTray,
      hint,
      controls,
    )
    this.root.addEventListener('click', this.handleClick)
  }

  show(): void {
    this.root.hidden = false
    this.root.setAttribute('aria-hidden', 'false')
  }

  hide(): void {
    this.root.hidden = true
    this.root.setAttribute('aria-hidden', 'true')
    this.clearFeedback()
  }

  /**
   * Short-lived collection feedback. Toasts stack, self-remove and are cleared
   * with the HUD, so nothing survives into the next screen.
   */
  pushFeedback(text: string, tone: HUDFeedbackTone = 'coin'): void {
    const toast = createEl('div', `hud-toast hud-toast--${tone}`, text)
    this.toastTray.appendChild(toast)
    while (this.toastTray.childElementCount > 3) {
      this.toastTray.firstElementChild?.remove()
    }

    const timer = window.setTimeout(() => {
      this.toastTimers.delete(timer)
      toast.remove()
    }, TOAST_LIFETIME)
    this.toastTimers.add(timer)
  }

  update(state: HUDState): void {
    this.scoreValue.textContent = formatInteger(state.score)
    this.distanceValue.textContent = formatDistance(state.distance)
    this.crystalsValue.textContent = formatInteger(state.crystals)
    this.coinsValue.textContent = formatInteger(state.coins)
    this.coinsLabel.textContent = `Coins · ${formatInteger(state.coinBalance)}`
    this.levelName.textContent = state.levelName
    this.levelProgressFill.style.transform = `scaleX(${state.levelProgress})`
    this.syncPowerUps(state.powerUps)

    const hasEffect = state.effectLabel.length > 0 && state.effectRemaining > 0
    this.effectBadge.hidden = !hasEffect
    if (hasEffect) {
      this.effectLabel.textContent = state.effectLabel
      this.effectTime.textContent = `${state.effectRemaining.toFixed(1)}s`
      const ratio =
        state.effectDuration > 0
          ? Math.min(1, Math.max(0, state.effectRemaining / state.effectDuration))
          : 0
      this.effectFill.style.transform = `scaleX(${ratio})`
    }

    const slideCooling = !state.slideActive && state.slideCooldown > 0
    this.slideButton.classList.toggle('is-active', state.slideActive)
    this.slideButton.classList.toggle('is-cooling', slideCooling)
    this.slideButton.classList.toggle('is-ready', !state.slideActive && !slideCooling)
    if (state.slideActive) {
      this.slideButton.setAttribute('aria-label', 'Sliding')
    } else if (slideCooling) {
      this.slideButton.setAttribute(
        'aria-label',
        `Slide recovering, ${state.slideCooldown.toFixed(1)} seconds`,
      )
    } else {
      this.slideButton.setAttribute('aria-label', 'Slide, ready')
    }

    const charge = Math.min(1, Math.max(0, state.dashCharge))
    this.dashRing.setAttribute(
      'stroke-dashoffset',
      String(DASH_CIRCUMFERENCE * (1 - charge)),
    )

    this.dashButton.classList.toggle('is-ready', state.dashReady)
    this.dashButton.classList.toggle('is-active', state.dashActive)
    this.dashButton.classList.toggle('is-cooling', !state.dashReady)

    if (!state.dashReady) {
      this.dashTimer.textContent = `${state.dashCooldown.toFixed(1)}s`
      this.dashButton.setAttribute(
        'aria-label',
        `Dash recharging, ${state.dashCooldown.toFixed(1)} seconds`,
      )
    } else if (state.dashActive) {
      this.dashTimer.textContent = 'Boost'
      this.dashButton.setAttribute('aria-label', 'Dash active')
    } else {
      this.dashTimer.textContent = 'Ready'
      this.dashButton.setAttribute('aria-label', 'Dash, ready')
    }
  }

  dispose(): void {
    this.root.removeEventListener('click', this.handleClick)
    this.clearFeedback()
    this.powerUpChips.clear()
    this.pauseButton.dispose()
    this.root.remove()
  }

  private syncPowerUps(powerUps: readonly HUDPowerUp[]): void {
    const seen = new Set<string>()
    for (const powerUp of powerUps) {
      if (powerUp.remaining <= 0) {
        continue
      }
      seen.add(powerUp.kind)
      const chip = this.powerUpChips.get(powerUp.kind) ?? this.createChip(powerUp)
      chip.time.textContent =
        powerUp.kind === 'shield' && powerUp.charges > 1
          ? `${powerUp.charges}× ${powerUp.remaining.toFixed(1)}s`
          : `${powerUp.remaining.toFixed(1)}s`
      const ratio =
        powerUp.duration > 0
          ? Math.min(1, Math.max(0, powerUp.remaining / powerUp.duration))
          : 0
      chip.fill.style.transform = `scaleX(${ratio})`
    }

    for (const [kind, chip] of [...this.powerUpChips.entries()]) {
      if (!seen.has(kind)) {
        chip.root.remove()
        this.powerUpChips.delete(kind)
      }
    }
  }

  private createChip(powerUp: HUDPowerUp): {
    root: HTMLDivElement
    time: HTMLSpanElement
    fill: HTMLSpanElement
  } {
    const root = createEl('div', `hud-power hud-power--${powerUp.kind}`)
    const glyph = createEl(
      'span',
      'hud-power__glyph',
      POWER_UP_GLYPHS[powerUp.kind] ?? '✦',
    )
    glyph.setAttribute('aria-hidden', 'true')
    const body = createEl('div', 'hud-power__body')
    const label = createEl('span', 'hud-power__label', powerUp.label)
    const time = createEl('span', 'hud-power__time', '')
    const track = createEl('span', 'hud-power__track')
    const fill = createEl('span', 'hud-power__fill')
    track.append(fill)
    body.append(label, track)
    root.append(glyph, body, time)
    this.powerUpTray.appendChild(root)

    const chip = { root, time, fill }
    this.powerUpChips.set(powerUp.kind, chip)
    return chip
  }

  private clearFeedback(): void {
    for (const timer of this.toastTimers) {
      window.clearTimeout(timer)
    }
    this.toastTimers.clear()
    this.toastTray.replaceChildren()
  }
}
