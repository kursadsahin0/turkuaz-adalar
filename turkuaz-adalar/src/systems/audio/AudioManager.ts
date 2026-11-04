import type { SaveManager } from '../save/SaveManager.ts'
import { Logger } from '../../utils/logger.ts'

export type SoundName =
  | 'jump'
  | 'collect'
  | 'hit'
  | 'dash'
  | 'ui'
  | 'start'
  | 'bounce'
  | 'slide'
  | 'recover'
  | 'surge'
  | 'checkpoint'
  | 'coin'
  | 'token'
  | 'powerup'
  | 'shieldBreak'
  | 'reward'
  | 'landing'
  | 'footstep'
  | 'levelComplete'

const MUTE_SAVE_KEY = 'settings.muted'
const MUSIC_VOLUME_KEY = 'settings.musicVolume'
const SFX_VOLUME_KEY = 'settings.sfxVolume'

/**
 * Procedural WebAudio sound system. No binary audio assets are required, which
 * keeps the foundation self-contained while providing real feedback sounds.
 */
export class AudioManager {
  private readonly save: SaveManager
  private readonly logger = new Logger('Audio')

  private context: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private ambientSource: AudioBufferSourceNode | null = null
  private ambientGain: GainNode | null = null
  private muteState: boolean
  private _musicVolume: number
  private _sfxVolume: number
  private failed = false
  private disposed = false
  private soundCooldowns = new Map<SoundName, number>()
  private readonly cooldownPeriod = 0.05

  constructor(save: SaveManager) {
    this.save = save
    const stored = save.load<unknown>(MUTE_SAVE_KEY, false)
    this.muteState = stored === true
    this._musicVolume = save.load<number>(MUSIC_VOLUME_KEY, 0.8)
    this._sfxVolume = save.load<number>(SFX_VOLUME_KEY, 0.8)
  }

  get isMuted(): boolean {
    return this.muteState
  }

  get musicVolume(): number {
    return this._musicVolume
  }

  get sfxVolume(): number {
    return this._sfxVolume
  }

  async unlock(): Promise<void> {
    if (this.disposed || this.failed) {
      return
    }

    try {
      if (!this.context) {
        this.context = new AudioContext()
        this.master = this.context.createGain()
        this.master.gain.value = this.muteState ? 0 : 0.85
        this.master.connect(this.context.destination)

        this.musicGain = this.context.createGain()
        this.musicGain.gain.value = this.muteState ? 0 : this.musicVolume
        this.musicGain.connect(this.master)

        this.sfxGain = this.context.createGain()
        this.sfxGain.gain.value = this.muteState ? 0 : this.sfxVolume
        this.sfxGain.connect(this.master)

        this.noiseBuffer = this.createNoiseBuffer(this.context)
      }

      if (this.context.state !== 'running') {
        await this.context.resume()
      }

      this.startAmbient()
    } catch (error) {
      this.failed = true
      this.logger.warn('Audio is unavailable; continuing silently.', error)
    }
  }

  /** Silences everything while the app is in the background. */
  suspend(): void {
    if (this.context && this.context.state === 'running') {
      void this.context.suspend().catch(() => undefined)
    }
  }

  /** Restores audio after suspend(); a no-op until unlock() created the context. */
  resume(): void {
    if (this.context && this.context.state === 'suspended' && !this.disposed && !this.failed) {
      void this.context.resume().catch(() => undefined)
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muteState)
    return this.muteState
  }

  setMuted(muted: boolean): void {
    this.muteState = muted
    this.save.save(MUTE_SAVE_KEY, muted)
    this.updateVolumes()
  }

  setMusicVolume(volume: number): void {
    this._musicVolume = Math.max(0, Math.min(1, volume))
    this.save.save(MUSIC_VOLUME_KEY, this._musicVolume)
    this.updateVolumes()
  }

  setSfxVolume(volume: number): void {
    this._sfxVolume = Math.max(0, Math.min(1, volume))
    this.save.save(SFX_VOLUME_KEY, this._sfxVolume)
    this.updateVolumes()
  }

  private updateVolumes(): void {
    if (this.master && this.musicGain && this.sfxGain && this.context) {
      const target = this.muteState ? 0 : 0.85
      const now = this.context.currentTime
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setTargetAtTime(target, now, 0.025)
      this.musicGain.gain.setTargetAtTime(this.muteState ? 0 : this._musicVolume, now, 0.05)
      this.sfxGain.gain.setTargetAtTime(this.muteState ? 0 : this._sfxVolume, now, 0.05)
    }
  }

  play(name: SoundName): void {
    if (this.disposed || this.muteState || this.failed) {
      return
    }

    const context = this.context
    const sfxGain = this.sfxGain
    if (!context || !sfxGain || context.state !== 'running') {
      return
    }

    // Cooldown to prevent overlapping sounds excessively
    const now = context.currentTime
    const lastPlay = this.soundCooldowns.get(name) ?? 0
    if (now - lastPlay < this.cooldownPeriod) {
      return
    }
    this.soundCooldowns.set(name, now)

    switch (name) {
      case 'jump':
        this.tone(context, sfxGain, 330, 620, 0.14, 'sine', 0.13)
        break
      case 'collect':
        this.tone(context, sfxGain, 880, 880, 0.09, 'triangle', 0.12)
        this.tone(context, sfxGain, 1320, 1320, 0.12, 'triangle', 0.09, 0.06)
        break
      case 'hit':
        this.tone(context, sfxGain, 160, 42, 0.38, 'sawtooth', 0.18)
        this.noiseBurst(context, sfxGain, 0.3, 0.14, 520)
        break
      case 'dash':
        this.noiseBurst(context, sfxGain, 0.35, 0.12, 1400, 420, true)
        this.tone(context, sfxGain, 220, 720, 0.28, 'sine', 0.08)
        break
      case 'ui':
        this.tone(context, sfxGain, 720, 880, 0.06, 'sine', 0.06)
        break
      case 'start':
        this.tone(context, sfxGain, 392, 392, 0.5, 'triangle', 0.07)
        this.tone(context, sfxGain, 523.25, 523.25, 0.5, 'triangle', 0.065, 0.08)
        this.tone(context, sfxGain, 659.25, 659.25, 0.55, 'triangle', 0.06, 0.16)
        break
      case 'bounce':
        this.tone(context, sfxGain, 260, 780, 0.26, 'triangle', 0.16)
        this.tone(context, sfxGain, 520, 1040, 0.2, 'sine', 0.07, 0.03)
        this.noiseBurst(context, sfxGain, 0.16, 0.07, 1200, 2400, true)
        break
      case 'slide':
        this.noiseBurst(context, sfxGain, 0.34, 0.1, 900, 220)
        this.tone(context, sfxGain, 240, 130, 0.24, 'sawtooth', 0.05)
        break
      case 'surge':
        this.tone(context, sfxGain, 420, 980, 0.34, 'sine', 0.1)
        this.tone(context, sfxGain, 680, 1360, 0.28, 'triangle', 0.06, 0.05)
        this.noiseBurst(context, sfxGain, 0.28, 0.06, 1600, 500, true)
        break
      case 'recover':
        this.tone(context, sfxGain, 330, 660, 0.2, 'sine', 0.1)
        this.tone(context, sfxGain, 660, 990, 0.26, 'triangle', 0.07, 0.12)
        break
      case 'checkpoint':
        this.tone(context, sfxGain, 660, 660, 0.14, 'triangle', 0.08)
        this.tone(context, sfxGain, 990, 990, 0.22, 'triangle', 0.07, 0.09)
        break
      case 'coin':
        this.tone(context, sfxGain, 1180, 1560, 0.09, 'triangle', 0.09)
        break
      case 'token':
        this.tone(context, sfxGain, 660, 660, 0.1, 'triangle', 0.09)
        this.tone(context, sfxGain, 990, 990, 0.12, 'triangle', 0.08, 0.06)
        this.tone(context, sfxGain, 1320, 1320, 0.16, 'sine', 0.07, 0.12)
        break
      case 'powerup':
        this.tone(context, sfxGain, 320, 880, 0.3, 'sine', 0.1)
        this.tone(context, sfxGain, 640, 1320, 0.24, 'triangle', 0.06, 0.08)
        break
      case 'shieldBreak':
        this.noiseBurst(context, sfxGain, 0.26, 0.12, 2200, 500, true)
        this.tone(context, sfxGain, 520, 160, 0.24, 'triangle', 0.09)
        break
      case 'reward':
        this.tone(context, sfxGain, 523.25, 523.25, 0.16, 'triangle', 0.08)
        this.tone(context, sfxGain, 659.25, 659.25, 0.18, 'triangle', 0.07, 0.08)
        this.tone(context, sfxGain, 783.99, 783.99, 0.2, 'triangle', 0.07, 0.16)
        this.tone(context, sfxGain, 1046.5, 1046.5, 0.34, 'sine', 0.06, 0.26)
        break
      case 'landing':
        this.tone(context, sfxGain, 180, 80, 0.18, 'sine', 0.08)
        this.noiseBurst(context, sfxGain, 0.12, 0.06, 800, 200)
        break
      case 'footstep':
        this.tone(context, sfxGain, 120, 80, 0.08, 'sine', 0.05)
        break
      case 'levelComplete':
        this.tone(context, sfxGain, 392, 392, 0.3, 'triangle', 0.1)
        this.tone(context, sfxGain, 523.25, 523.25, 0.35, 'triangle', 0.09, 0.1)
        this.tone(context, sfxGain, 659.25, 659.25, 0.4, 'triangle', 0.08, 0.2)
        this.tone(context, sfxGain, 783.99, 783.99, 0.45, 'triangle', 0.07, 0.3)
        this.tone(context, sfxGain, 1046.5, 1046.5, 0.5, 'sine', 0.06, 0.4)
        break
    }
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true

    try {
      this.ambientSource?.stop()
      this.ambientSource?.disconnect()
      this.ambientGain?.disconnect()
      this.musicGain?.disconnect()
      this.sfxGain?.disconnect()
      this.master?.disconnect()
    } catch {
      // Nodes may already be stopped; teardown must stay best-effort.
    }

    this.ambientSource = null
    this.ambientGain = null
    this.musicGain = null
    this.sfxGain = null
    this.master = null
    this.noiseBuffer = null

    const context = this.context
    this.context = null
    if (context) {
      void context.close().catch(() => undefined)
    }
  }

  private startAmbient(): void {
    if (this.ambientSource || !this.context || !this.master || !this.noiseBuffer) {
      return
    }

    const source = this.context.createBufferSource()
    source.buffer = this.noiseBuffer
    source.loop = true

    const filter = this.context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    filter.Q.value = 0.6

    const gain = this.context.createGain()
    gain.gain.value = 0.022

    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    source.start()

    this.ambientSource = source
    this.ambientGain = gain
  }

  private tone(
    context: AudioContext,
    destination: AudioNode,
    startFrequency: number,
    endFrequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    const start = context.currentTime + delay
    const end = start + duration

    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(Math.max(1, startFrequency), start)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), end)

    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.linearRampToValueAtTime(volume, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)

    oscillator.connect(gain)
    gain.connect(destination)
    oscillator.start(start)
    oscillator.stop(end + 0.03)
  }

  private noiseBurst(
    context: AudioContext,
    destination: AudioNode,
    duration: number,
    volume: number,
    frequency: number,
    endFrequency = frequency,
    sweep = false,
  ): void {
    if (!this.noiseBuffer) {
      return
    }

    const start = context.currentTime
    const end = start + duration

    const source = context.createBufferSource()
    source.buffer = this.noiseBuffer

    const filter = context.createBiquadFilter()
    filter.type = sweep ? 'bandpass' : 'lowpass'
    filter.frequency.setValueAtTime(frequency, start)
    if (sweep) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(60, endFrequency), end)
      filter.Q.value = 1.4
    }

    const gain = context.createGain()
    gain.gain.setValueAtTime(volume, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(destination)
    source.start(start)
    source.stop(end + 0.02)
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const length = Math.floor(context.sampleRate * 4)
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let index = 0; index < length; index += 1) {
      channel[index] = Math.random() * 2 - 1
    }
    return buffer
  }
}
