/**
 * Small generative music engine: island loops built from WebAudio
 * oscillators, so the game ships without audio files. A lookahead scheduler
 * queues notes slightly ahead of the audio clock for sample-accurate timing.
 *
 * Each `MusicStyle` (tempo, key, mode, lead instrument, seed) yields an
 * original, seeded 8-bar tune that is identical on every play. The menu and
 * every island have their own style; switching waits for the next bar.
 */

export type MusicIntensity = 'menu' | 'run'
export type LeadVoice = 'marimba' | 'bell' | 'pluck'

export interface MusicStyle {
  readonly id: string
  readonly bpm: number
  /** Semitones above C. */
  readonly key: number
  readonly mode: 'major' | 'minor'
  readonly lead: LeadVoice
  /** Melody seed: same seed, same tune. */
  readonly seed: number
  /** 0..1, how busy the melody is. */
  readonly density: number
}

/** Calm title-screen loop. */
export const MENU_STYLE: MusicStyle = {
  id: 'menu',
  bpm: 84,
  key: 0,
  mode: 'major',
  lead: 'bell',
  seed: 0x5eed01,
  density: 0.55,
}

/** Island styles by `LevelTheme.id`; the endless run uses `shallows`. */
export const ISLAND_STYLES: Readonly<Record<string, MusicStyle>> = {
  shallows: {
    id: 'shallows',
    bpm: 104,
    key: 0,
    mode: 'major',
    lead: 'marimba',
    seed: 0x7a11e5,
    density: 0.75,
  },
  rapids: {
    id: 'rapids',
    bpm: 116,
    key: 2,
    mode: 'major',
    lead: 'pluck',
    seed: 0x2a91d3,
    density: 0.8,
  },
  depths: {
    id: 'depths',
    bpm: 96,
    key: 9,
    mode: 'minor',
    lead: 'bell',
    seed: 0x3d0e95,
    density: 0.6,
  },
  peaks: {
    id: 'peaks',
    bpm: 100,
    key: 4,
    mode: 'minor',
    lead: 'bell',
    seed: 0x9eaa51,
    density: 0.7,
  },
  horizon: {
    id: 'horizon',
    bpm: 108,
    key: 5,
    mode: 'major',
    lead: 'marimba',
    seed: 0x4b0a7c,
    density: 0.75,
  },
  valley: {
    id: 'valley',
    bpm: 104,
    key: 7,
    mode: 'major',
    lead: 'bell',
    seed: 0x6e55a1,
    density: 0.7,
  },
  archipelago: {
    id: 'archipelago',
    bpm: 112,
    key: 0,
    mode: 'major',
    lead: 'pluck',
    seed: 0x1c3f20,
    density: 0.8,
  },
  twilight: {
    id: 'twilight',
    bpm: 92,
    key: 2,
    mode: 'minor',
    lead: 'pluck',
    seed: 0x77e1a4,
    density: 0.6,
  },
  core: {
    id: 'core',
    bpm: 120,
    key: 9,
    mode: 'minor',
    lead: 'marimba',
    seed: 0x0c0a71,
    density: 0.85,
  },
  void: { id: 'void', bpm: 88, key: 11, mode: 'minor', lead: 'bell', seed: 0x5f00d1, density: 0.5 },
  ruins: {
    id: 'ruins',
    bpm: 98,
    key: 3,
    mode: 'minor',
    lead: 'marimba',
    seed: 0x2b6e0f,
    density: 0.65,
  },
  storm: {
    id: 'storm',
    bpm: 124,
    key: 1,
    mode: 'minor',
    lead: 'pluck',
    seed: 0x9f3c27,
    density: 0.9,
  },
  glacier: {
    id: 'glacier',
    bpm: 94,
    key: 6,
    mode: 'major',
    lead: 'bell',
    seed: 0x4ce0b8,
    density: 0.55,
  },
  volcano: {
    id: 'volcano',
    bpm: 128,
    key: 8,
    mode: 'minor',
    lead: 'marimba',
    seed: 0xd1530a,
    density: 0.9,
  },
  aurora: {
    id: 'aurora',
    bpm: 106,
    key: 10,
    mode: 'major',
    lead: 'bell',
    seed: 0x6a2ff4,
    density: 0.7,
  },
  mangrove: {
    id: 'mangrove',
    bpm: 102,
    key: 2,
    mode: 'minor',
    lead: 'marimba',
    seed: 0x1a3c5e,
    density: 0.7,
  },
  pearl: {
    id: 'pearl',
    bpm: 110,
    key: 4,
    mode: 'major',
    lead: 'bell',
    seed: 0x6c2e91,
    density: 0.7,
  },
  dunes: {
    id: 'dunes',
    bpm: 118,
    key: 5,
    mode: 'minor',
    lead: 'pluck',
    seed: 0x8e4f12,
    density: 0.85,
  },
  kelp: {
    id: 'kelp',
    bpm: 96,
    key: 9,
    mode: 'minor',
    lead: 'bell',
    seed: 0x2b7d63,
    density: 0.6,
  },
  cliffs: {
    id: 'cliffs',
    bpm: 126,
    key: 0,
    mode: 'minor',
    lead: 'pluck',
    seed: 0xc4091f,
    density: 0.9,
  },
  atoll: {
    id: 'atoll',
    bpm: 90,
    key: 7,
    mode: 'minor',
    lead: 'bell',
    seed: 0x3f6a88,
    density: 0.55,
  },
  jade: {
    id: 'jade',
    bpm: 100,
    key: 3,
    mode: 'major',
    lead: 'marimba',
    seed: 0x5d1e7b,
    density: 0.75,
  },
  sunset: {
    id: 'sunset',
    bpm: 108,
    key: 10,
    mode: 'major',
    lead: 'pluck',
    seed: 0xa47c33,
    density: 0.75,
  },
  fjord: {
    id: 'fjord',
    bpm: 92,
    key: 2,
    mode: 'major',
    lead: 'bell',
    seed: 0x19b2e4,
    density: 0.6,
  },
  ember: {
    id: 'ember',
    bpm: 130,
    key: 6,
    mode: 'minor',
    lead: 'marimba',
    seed: 0xd2384a,
    density: 0.9,
  },
  starfall: {
    id: 'starfall',
    bpm: 112,
    key: 11,
    mode: 'major',
    lead: 'bell',
    seed: 0x47f10c,
    density: 0.7,
  },
  citadel: {
    id: 'citadel',
    bpm: 120,
    key: 4,
    mode: 'minor',
    lead: 'pluck',
    seed: 0x7b93c6,
    density: 0.85,
  },
  nebula: {
    id: 'nebula',
    bpm: 98,
    key: 8,
    mode: 'minor',
    lead: 'bell',
    seed: 0x9a0e5d,
    density: 0.65,
  },
  obsidian: {
    id: 'obsidian',
    bpm: 132,
    key: 1,
    mode: 'minor',
    lead: 'pluck',
    seed: 0xe36f28,
    density: 0.92,
  },
  throne: {
    id: 'throne',
    bpm: 116,
    key: 0,
    mode: 'major',
    lead: 'marimba',
    seed: 0x52c8a1,
    density: 0.85,
  },
}

const STEPS_PER_BEAT = 4
const STEPS_PER_BAR = 16
const BARS = 8
const LOOKAHEAD_SECONDS = 0.18
const TICK_MS = 50

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
} as const
const PENTATONIC = { major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10] } as const
/** I–vi–IV–V in major, i–VI–III–VII in minor (scale degrees, 0-based). */
const PROGRESSIONS = { major: [0, 5, 3, 4], minor: [0, 5, 2, 6] } as const

interface MelodyNote {
  readonly step: number
  readonly note: number
  readonly length: number
}

interface Composition {
  readonly style: MusicStyle
  readonly chords: readonly (readonly number[])[]
  readonly melody: readonly (readonly MelodyNote[])[]
  readonly stepSeconds: number
}

function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12)
}

/** Triad on a scale degree, as MIDI notes around the bass register. */
function triad(style: MusicStyle, degree: number): number[] {
  const scale = SCALES[style.mode]
  const root = 48 + style.key
  return [0, 2, 4].map((offset) => {
    const index = degree + offset
    return root + scale[index % 7] + 12 * Math.floor(index / 7)
  })
}

/** Builds a style's fixed 8-bar tune once from its seed. */
function compose(style: MusicStyle): Composition {
  let seed = style.seed
  const random = (): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
    return seed / 0x100000000
  }
  const chords = PROGRESSIONS[style.mode].map((degree) => triad(style, degree))
  const pentatonic = PENTATONIC[style.mode]
  const passing = [0, 1].flatMap((octave) =>
    pentatonic.map((step) => 72 + style.key + step + octave * 12),
  )
  const rhythm = [0, 3, 6, 8, 10, 12, 14]
  const melody: MelodyNote[][] = []
  for (let bar = 0; bar < BARS; bar += 1) {
    const chord = chords[bar % chords.length]
    const notes: MelodyNote[] = []
    // The second phrase answers the first with a sparser, higher line.
    const answer = bar >= 4
    const skip = (answer ? 0.38 : 0.22) + (1 - style.density) * 0.3
    for (const step of rhythm) {
      if (random() < skip) {
        continue
      }
      const useChordTone = step % 4 === 0 || random() < 0.5
      const note = useChordTone
        ? chord[Math.floor(random() * chord.length)] + 24 + (answer && random() < 0.4 ? 12 : 0)
        : passing[Math.floor(random() * passing.length)]
      notes.push({ step, note, length: step === 14 ? 2 : random() < 0.3 ? 3 : 2 })
    }
    melody.push(notes)
  }
  return { style, chords, melody, stepSeconds: 60 / style.bpm / STEPS_PER_BEAT }
}

export class MusicSequencer {
  private readonly context: AudioContext
  private readonly output: GainNode
  private readonly noise: AudioBuffer
  private readonly compositions = new Map<string, Composition>()
  private current: Composition
  private pending: Composition | null = null
  private intensity: MusicIntensity = 'menu'
  private timer: number | null = null
  private nextStepTime = 0
  private step = 0
  private percussionGain: GainNode
  private bassGain: GainNode

  constructor(
    context: AudioContext,
    destination: AudioNode,
    noise: AudioBuffer,
    style: MusicStyle = MENU_STYLE,
  ) {
    this.context = context
    this.noise = noise
    this.current = this.composition(style)
    this.output = context.createGain()
    this.output.gain.value = 0.5
    this.output.connect(destination)
    this.percussionGain = context.createGain()
    this.percussionGain.gain.value = 0
    this.percussionGain.connect(this.output)
    this.bassGain = context.createGain()
    this.bassGain.gain.value = 0.55
    this.bassGain.connect(this.output)
  }

  get playing(): boolean {
    return this.timer !== null
  }

  get styleId(): string {
    return (this.pending ?? this.current).style.id
  }

  start(): void {
    if (this.timer !== null) {
      return
    }
    this.nextStepTime = this.context.currentTime + 0.08
    this.timer = window.setInterval(() => this.schedule(), TICK_MS)
    this.schedule()
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Switches tune at the next bar line, so the change never cuts a phrase. */
  setStyle(style: MusicStyle): void {
    if (style.id === this.styleId) {
      return
    }
    this.pending = this.composition(style)
    if (!this.playing) {
      this.adoptPending()
    }
  }

  /** Menu is mellow; a run adds the shaker and a fuller bass. */
  setIntensity(intensity: MusicIntensity): void {
    if (intensity === this.intensity) {
      return
    }
    this.intensity = intensity
    const now = this.context.currentTime
    this.percussionGain.gain.setTargetAtTime(intensity === 'run' ? 1 : 0, now, 0.4)
    this.bassGain.gain.setTargetAtTime(intensity === 'run' ? 0.85 : 0.55, now, 0.4)
  }

  dispose(): void {
    this.stop()
    try {
      this.output.disconnect()
    } catch {
      // Already disconnected.
    }
  }

  private composition(style: MusicStyle): Composition {
    let composition = this.compositions.get(style.id)
    if (!composition) {
      composition = compose(style)
      this.compositions.set(style.id, composition)
    }
    return composition
  }

  private adoptPending(): void {
    if (this.pending) {
      this.current = this.pending
      this.pending = null
      this.step = 0
    }
  }

  private schedule(): void {
    // After a suspend, skip ahead instead of firing a burst of late notes.
    if (this.nextStepTime < this.context.currentTime - 0.25) {
      this.nextStepTime = this.context.currentTime + 0.05
    }
    while (this.nextStepTime < this.context.currentTime + LOOKAHEAD_SECONDS) {
      if (this.pending && this.step % STEPS_PER_BAR === 0) {
        this.adoptPending()
      }
      this.playStep(this.step, this.nextStepTime)
      this.nextStepTime += this.current.stepSeconds
      this.step = (this.step + 1) % (STEPS_PER_BAR * BARS)
    }
  }

  private playStep(step: number, time: number): void {
    const { chords, melody, stepSeconds, style } = this.current
    const bar = Math.floor(step / STEPS_PER_BAR)
    const inBar = step % STEPS_PER_BAR
    const chord = chords[bar % chords.length]

    // Bass: root on beats 1 and 3, fifth on the "and" of 2.
    if (inBar === 0 || inBar === 8) {
      this.pluck(midiToHz(chord[0] - 12), time, stepSeconds * 5, 'triangle', 0.2, this.bassGain)
    } else if (inBar === 6) {
      this.pluck(midiToHz(chord[2] - 12), time, stepSeconds * 2, 'triangle', 0.13, this.bassGain)
    }

    // Soft chord stabs on the offbeats.
    if (inBar === 4 || inBar === 12) {
      for (const note of chord) {
        this.pluck(midiToHz(note + 12), time, stepSeconds * 2.5, 'sine', 0.035, this.output)
      }
    }

    for (const note of melody[bar]) {
      if (note.step === inBar) {
        this.lead(style.lead, midiToHz(note.note), time, stepSeconds * note.length)
      }
    }

    // Shaker on every eighth, accented on the offbeat (run only, via gain).
    if (inBar % 2 === 0) {
      this.shaker(time, inBar % 4 === 2 ? 0.05 : 0.025)
    }
  }

  private lead(voice: LeadVoice, frequency: number, time: number, duration: number): void {
    switch (voice) {
      case 'marimba':
        this.pluck(frequency, time, duration + 0.25, 'sine', 0.075, this.output)
        // A quiet overtone two octaves up gives the wooden "tock".
        this.pluck(frequency * 4, time, 0.06, 'sine', 0.012, this.output)
        break
      case 'bell':
        // Inharmonic partial and a long tail: glassy and calm.
        this.pluck(frequency, time, duration + 0.9, 'sine', 0.06, this.output)
        this.pluck(frequency * 2.76, time, duration * 0.6 + 0.3, 'sine', 0.014, this.output)
        break
      case 'pluck':
        this.pluck(frequency, time, duration * 0.6 + 0.12, 'triangle', 0.06, this.output)
        this.pluck(frequency * 2, time, 0.08, 'sine', 0.01, this.output)
        break
    }
  }

  private pluck(
    frequency: number,
    time: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    destination: AudioNode,
  ): void {
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, time)
    gain.gain.setValueAtTime(0.0001, time)
    gain.gain.linearRampToValueAtTime(volume, time + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration)
    oscillator.connect(gain)
    gain.connect(destination)
    oscillator.start(time)
    oscillator.stop(time + duration + 0.02)
    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
    }
  }

  private shaker(time: number, volume: number): void {
    const source = this.context.createBufferSource()
    source.buffer = this.noise
    const filter = this.context.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 6500
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(volume, time)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.percussionGain)
    // Random offset into the noise buffer so hits do not sound identical.
    source.start(time, Math.random() * Math.max(0, this.noise.duration - 0.1), 0.06)
    source.onended = () => {
      source.disconnect()
      filter.disconnect()
      gain.disconnect()
    }
  }
}
